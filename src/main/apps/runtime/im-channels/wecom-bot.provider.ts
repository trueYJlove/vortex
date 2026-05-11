/**
 * apps/runtime/im-channels -- WeCom Bot Provider
 *
 * ImChannelProvider implementation for WeCom Intelligent Bot (企业微信智能机器人).
 *
 * Protocol (aligned with @wecom/aibot-node-sdk and official docs at
 * https://developer.work.weixin.qq.com/document/path/100937):
 * - WebSocket long connection (JSON, no XML/AES)
 * - `aibot_subscribe` for authentication (bot_id + secret)
 * - `aibot_msg_callback` for receiving messages
 * - `aibot_respond_msg` for replying (passive, shares inbound req_id)
 * - `aibot_send_msg` for proactive push (new req_id per call)
 * - Application-level heartbeat: `{ cmd: "ping" }` every 30 seconds
 * - Only ONE WebSocket connection per bot allowed
 *
 * Protocol time limits (per official docs):
 * - Reply window: 24 hours after inbound callback (aibot_respond_msg lifetime)
 * - Stream message: 10 minutes from first packet to finish=true (server auto-ends after)
 * - Media URL: 5 minutes (download window for image / file / video attachments)
 * - Frequency: 30 msgs/min, 1000 msgs/hour per chat (reply + push combined; soft cap)
 *
 * Long-task support:
 * - Streams approaching the 10-minute cutoff are proactively finished and switched to
 *   discrete aibot_send_msg pushes for progress and the final answer (see WecomStreamSession).
 * - Mid-stream WS disconnects mark stream.id as broken; after reconnect, remaining content
 *   is delivered via push using a queued-push mechanism on WecomBotInstance.
 *
 * File capabilities (WeCom single-chat only):
 * - Receive: image / file / video — URL+aeskey, AES-256-CBC decrypted to local temp file
 * - Send: chunked WebSocket upload (init → chunks → complete → media_id) then send msg
 * - Images are also passed as base64 for Claude multimodal vision
 */

import WebSocket from 'ws'
import { createDecipheriv, createHash } from 'crypto'
import { readdirSync, statSync, unlinkSync } from 'fs'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join, basename, extname } from 'path'
import https from 'https'
import type {
  ImChannelProvider,
  ImChannelInstance,
  ImFileCapability,
  ImChannelConfigFieldDef,
  ImChannelType,
  SanctionedFile,
} from '../../../../shared/types/im-channel'
import type {
  InboundMessage,
  InboundAttachment,
  ReplyHandle,
  StreamingHandle,
  ProgressEvent,
} from '../../../../shared/types/inbound-message'
import type { ImageAttachment, ImageMediaType } from '../../../services/agent/types'

// ============================================
// Constants
// ============================================

const DEFAULT_WS_URL = 'wss://openws.work.weixin.qq.com'
const HEARTBEAT_INTERVAL_MS = 30_000    // 30 seconds
const RECONNECT_BASE_DELAY_MS = 2_000   // 2 seconds
const RECONNECT_MAX_DELAY_MS = 30_000   // 30 seconds cap
const MAX_RECONNECT_ATTEMPTS = 100

/** 24h reply window per official docs ("收到消息回调后，24小时内可以往该会话回复消息") */
const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000
/** 10-min stream lifetime per official docs (server auto-ends after) */
const STREAM_LIFETIME_MS = 10 * 60 * 1000
/** Safety margin before stream cutoff for proactive finish */
const STREAM_SAFETY_MARGIN_MS = 30 * 1000
/** Throttle interval for progress pushes after stream→push transition */
const STREAM_PROGRESS_PUSH_INTERVAL_MS = 2 * 60 * 1000
const STREAM_TRANSITION_NOTICE =
  '\n\n---\n_任务仍在进行中，后续进度会以新消息推送（企微协议限制单条流式消息最长 10 分钟）_'
/** Max wait for WS re-auth before dropping a queued push */
const PUSH_QUEUE_WAIT_MS = 2 * 60 * 1000

const REQ_ID_CLEANUP_INTERVAL_MS = 5 * 60_000  // 5 minutes

/** Interval for periodic health snapshot log lines (kept low-frequency to avoid noise). */
const HEALTH_SNAPSHOT_INTERVAL_MS = 5 * 60_000  // 5 minutes

/**
 * Liveness check: if no inbound traffic (including pong) for this long after the
 * most recent ping, the WS is treated as a zombie and torn down for reconnect.
 * Set just above heartbeat interval so two consecutive pings missed is enough
 * to trigger detection.
 */
const WS_LIVENESS_TIMEOUT_MS = 70_000   // 70 seconds (2x heartbeat + buffer)

/** Frequency soft cap: per-chat sends in a rolling 60s window (server hard cap = 30/min). */
const FREQ_WINDOW_MS = 60_000
const FREQ_WARN_THRESHOLD = 25          // start warning at 25/min (server cap = 30/min)

/** Max characters of any payload preview emitted in logs (truncation cap). */
const PAYLOAD_PREVIEW_CHARS = 200

// ============================================
// Structured Logging
// ============================================

/**
 * Single entry point for all WeCom-related logs. Emits one line per call in a
 * key=value format that is easy to grep and machine-parseable:
 *
 *   [WecomBot:<instanceId>] event=<name> key1=val1 key2=val2 ...
 *
 * Goals:
 *   - Every user interaction can be traced end-to-end by grepping `trace=<id>`
 *   - Performance: single console call, no JSON.stringify, no allocations beyond
 *     a single concatenation per line
 *   - Levels map to console.{log,warn,error} (no logger lib needed per project policy)
 *   - Field values are coerced to strings via formatVal so objects/arrays don't
 *     accidentally expand to `[object Object]`
 *
 * Field naming conventions used across this file:
 *   trace=<id>             — Per-conversation correlation ID (WeCom msgid or generated)
 *   chatId=<id>            — Conversation ID
 *   chatType=direct|group  — Conversation type
 *   reqId=<id>             — WeCom protocol req_id
 *   streamId=<id>          — Stream message ID
 *   mode=stream|push       — Stream session delivery mode
 *   bytes=<n>              — Content size in bytes
 *   elapsedMs=<n>          — Time delta in ms
 *   errcode=<n>, errmsg=<s> — WeCom server error code/message
 *   cat=network|protocol|content|internal — Error category
 */
type LogLevel = 'info' | 'warn' | 'error'
type LogFields = Record<string, string | number | boolean | null | undefined>

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'string') {
    // Quote values containing whitespace or = so the key=value format stays parseable
    if (/[\s=]/.test(v)) return `"${v.replace(/"/g, '\\"')}"`
    return v
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return String(v)
}

function logEvent(
  instanceId: string,
  level: LogLevel,
  event: string,
  fields: LogFields = {},
): void {
  const parts: string[] = [`[WecomBot:${instanceId}]`, `event=${event}`]
  for (const key of Object.keys(fields)) {
    const val = fields[key]
    if (val === undefined) continue
    parts.push(`${key}=${formatVal(val)}`)
  }
  const line = parts.join(' ')
  // eslint-disable-next-line no-console -- structured logger by design
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

/** Truncate a string for log preview while preserving length context. */
function previewText(s: string, max = PAYLOAD_PREVIEW_CHARS): string {
  if (s.length <= max) return s
  return `${s.slice(0, max)}...(+${s.length - max}chars)`
}

let traceIdCounter = 0
/** Generate a fallback trace ID when no WeCom msgid is available (e.g. for proactive pushes). */
function generateTraceId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(++traceIdCounter).toString(36)}`
}

/** Max chunk size before base64 encoding (WeCom limit: 512 KB raw) */
const UPLOAD_CHUNK_SIZE = 512 * 1024

/** Max allowed chunks per upload session (WeCom limit) */
const UPLOAD_MAX_CHUNKS = 100

/** Timeout for a single WeCom WebSocket request-response pair */
const WS_REQUEST_TIMEOUT_MS = 30_000

/** Local temp directory for downloaded WeCom media */
const TEMP_DIR = join(tmpdir(), 'halo-wecom')

/** Max download size (100 MB). Defense-in-depth against unbounded memory allocation. */
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024

/**
 * Remove stale WeCom media temp files older than 24 hours.
 *
 * Called once at startup by the im-channels layer. Files are only needed for
 * the duration of a single agent execution, so anything older than 24 hours
 * is safe to remove.
 */
export function cleanupWecomTempFiles(): void {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  let cleaned = 0
  try {
    const files = readdirSync(TEMP_DIR)
    for (const f of files) {
      const fp = join(TEMP_DIR, f)
      try {
        if (statSync(fp).mtimeMs < cutoff) { unlinkSync(fp); cleaned++ }
      } catch { /* file may be in use or already gone */ }
    }
    if (cleaned > 0) {
      // Module-level startup helper — no instanceId available; use a sentinel.
      logEvent('_startup', 'info', 'temp_files_cleaned', { cleaned, dir: TEMP_DIR })
    }
  } catch { /* directory may not exist on first run */ }
}

/** Image file extensions that map to WeCom 'image' media type */
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'])

// ============================================
// Helpers
// ============================================

let reqIdCounter = 0

function generateReqId(prefix: string): string {
  return `${prefix}_${Date.now()}_${++reqIdCounter}`
}

// ============================================
// Media: Download & Decrypt
// ============================================

/**
 * Download an encrypted media file from WeCom and decrypt it locally.
 *
 * MUST be called within 5 minutes of receiving the message (URL expiry).
 * Algorithm: AES-256-CBC, key = aeskey bytes, IV = first 16 bytes of key.
 * Padding: PKCS#7 to 32-byte multiples (WeCom-specific; handled manually).
 *
 * @param url - WeCom media URL (valid for 5 minutes)
 * @param aeskeyBase64 - Base64-encoded AES key
 * @param filename - Display filename (used to name the temp file)
 * @param instanceId - For logging context
 * @returns Absolute path to the decrypted temp file
 */
async function downloadAndDecrypt(
  url: string,
  aeskeyBase64: string,
  filename: string,
  instanceId: string
): Promise<string> {
  // Ensure temp directory exists
  await mkdir(TEMP_DIR, { recursive: true })

  logEvent(instanceId, 'info', 'media_download_start', { filename, urlLen: url.length })
  const t0 = Date.now()

  // Download encrypted content
  const encryptedBuf = await httpGetBuffer(url)

  // Guard against empty responses (e.g., expired URL returning empty 200)
  if (encryptedBuf.length === 0) {
    throw new Error(`[WecomBot] Empty response downloading media: ${filename}`)
  }

  // Decrypt: AES-256-CBC, IV = first 16 bytes of key.
  // WeCom pads plaintext to 32-byte multiples (not standard 16-byte AES block size),
  // so padding values 17–32 are valid but rejected by Node's built-in PKCS#7 check.
  // Solution: disable auto-padding and strip manually.
  const aeskey = Buffer.from(aeskeyBase64, 'base64')
  const iv = aeskey.subarray(0, 16)
  const decipher = createDecipheriv('aes-256-cbc', aeskey, iv)
  decipher.setAutoPadding(false)
  const raw = Buffer.concat([decipher.update(encryptedBuf), decipher.final()])
  // Strip WeCom PKCS#7 padding (pad value ∈ [1, 32])
  const padLen = raw[raw.length - 1]
  if (padLen < 1 || padLen > 32) {
    throw new Error(`[WecomBot] Invalid padding byte: ${padLen} (expected 1–32)`)
  }
  const decrypted = raw.subarray(0, raw.length - padLen)

  // Write to temp file with a collision-safe name
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${filename}`
  const outPath = join(TEMP_DIR, safeName)
  await writeFile(outPath, decrypted)

  logEvent(instanceId, 'info', 'media_download_done', {
    filename,
    outPath,
    bytes: decrypted.length,
    elapsedMs: Date.now() - t0,
  })
  return outPath
}

/**
 * Simple HTTPS GET → Buffer.
 * Follows redirects once (WeCom CDN may redirect).
 * Rejects on non-200 status or timeout (30 s).
 */
function httpGetBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doGet = (targetUrl: string, redirectsLeft: number) => {
      const req = https.get(targetUrl, (res) => {
        // Handle redirects
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && redirectsLeft > 0) {
          res.resume()
          logEvent('_download', 'info', 'http_redirect', {
            status: res.statusCode,
            location: res.headers.location,
          })
          doGet(res.headers.location, redirectsLeft - 1)
          return
        }
        if (res.statusCode !== 200) {
          res.resume()
          reject(new Error(`HTTP ${res.statusCode} downloading WeCom media from ${targetUrl}`))
          return
        }
        const chunks: Buffer[] = []
        let totalBytes = 0
        res.on('data', (chunk: Buffer) => {
          totalBytes += chunk.length
          if (totalBytes > MAX_DOWNLOAD_BYTES) {
            req.destroy()
            reject(new Error(`WeCom media download exceeds ${MAX_DOWNLOAD_BYTES} bytes limit`))
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      })
      req.on('error', reject)
      req.setTimeout(30_000, () => {
        req.destroy()
        reject(new Error('WeCom media download timeout (30s)'))
      })
    }
    doGet(url, 3)
  })
}

// ============================================
// Media: Image Download Helper
// ============================================

/**
 * Download, decrypt, and prepare an image for both file attachment and
 * multimodal AI input.
 *
 * Returns null on failure (logged, not thrown) so callers can continue
 * processing remaining attachments without losing earlier successes.
 */
async function downloadAndPrepareImage(
  url: string,
  aeskey: string,
  instanceId: string
): Promise<{ attachment: InboundAttachment; image: ImageAttachment } | null> {
  try {
    const filename = `image_${Date.now()}.jpg`
    const localPath = await downloadAndDecrypt(url, aeskey, filename, instanceId)
    const imgBuf = await readFile(localPath)
    const imgExt = url.split('?')[0].split('.').pop()?.toLowerCase()
    const mimeMap: Record<string, ImageMediaType> = { png: 'image/png', gif: 'image/gif' }
    const mediaType: ImageMediaType = mimeMap[imgExt ?? ''] ?? 'image/jpeg'
    return {
      attachment: { type: 'image', filename, localPath, mimeType: 'image/jpeg' },
      image: {
        id: `wecom_img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'image',
        mediaType,
        data: imgBuf.toString('base64'),
        name: filename,
      },
    }
  } catch (err) {
    logEvent(instanceId, 'error', 'image_download_failed', {
      cat: 'network',
      err: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

// ============================================
// Streaming: Tool Icons & Formatting
// ============================================

/**
 * Built-in SDK tool icons (exact name match).
 * Keep this list to tools that have a meaningfully distinct icon.
 */
const BUILTIN_TOOL_ICONS: Record<string, string> = {
  Read: '📖',
  Edit: '✏️',
  Write: '📝',
  Bash: '⚙️',
  Glob: '🔍',
  Grep: '🔍',
  Agent: '🤖',
  Task: '🤖',
  WebFetch: '🌐',
  WebSearch: '🔎',
  TodoWrite: '📋',
  TodoRead: '📋',
  NotebookEdit: '📓',
  ExitPlanMode: '✅',
}

/**
 * Resolve the display icon for a tool.
 *
 * Priority:
 *   1. Exact match in BUILTIN_TOOL_ICONS (SDK built-ins)
 *   2. mcp__ai-browser__ prefix → all browser tools share one icon
 *   3. mcp__web-search__ prefix → search icon
 *   4. mcp__halo-* prefix → Halo internal tools
 *   5. Any other mcp__ prefix → generic tool icon
 *   6. Unknown → default gear
 */
function getToolIcon(toolName: string): string {
  if (BUILTIN_TOOL_ICONS[toolName]) return BUILTIN_TOOL_ICONS[toolName]
  if (toolName.startsWith('mcp__ai-browser__')) return '🌐'
  if (toolName.startsWith('mcp__web-search__')) return '🔎'
  if (toolName.startsWith('mcp__halo-')) return '🔧'
  if (toolName.startsWith('mcp__')) return '🔧'
  return '⚙️'
}

/** Format a ProgressEvent as a single line for display in the WeCom <think> block. */
function formatProgressLine(event: ProgressEvent): string {
  switch (event.type) {
    case 'tool_call': {
      const icon = getToolIcon(event.tool)
      const label = event.summary || event.tool
      return `${icon} ${label}`
    }
    case 'tool_result': {
      const icon = event.success ? '✅' : '❌'
      return `${icon} ${event.summary || (event.success ? 'Done' : 'Error')}`
    }
    case 'thinking':
      return `💭 ${event.text}`
    case 'status':
      return `ℹ️ ${event.text}`
    default:
      return ''
  }
}

// ============================================
// WeCom Bot Config (provider-specific)
// ============================================

interface WecomBotProviderConfig {
  botId: string
  secret: string
  wsUrl?: string
}

// ============================================
// WecomStreamSession
// ============================================

/**
 * Manages a single streaming reply session.
 *
 * Starts in 'stream' mode (aibot_respond_msg). Transitions to 'push' mode
 * (aibot_send_msg) when approaching the 10-min server cutoff or on WS failure.
 * stream.content is FULL accumulated text per packet (not delta).
 */
class WecomStreamSession implements StreamingHandle {
  private readonly streamId: string
  private readonly instance: WecomBotInstance
  private readonly reqId: string
  private readonly chatId: string
  private readonly chatType: 'direct' | 'group'
  private readonly instanceId: string
  /** Per-conversation correlation ID for log grep'ability (WeCom msgid or generated). */
  private readonly traceId: string
  private readonly startedAt: number

  private progressLines: string[] = []
  private answerText = ''
  private started = false
  private finished = false

  /** Once switched to 'push', never returns to 'stream'. */
  private mode: 'stream' | 'push' = 'stream'
  /** True when stream.id is no longer usable (WS disconnect, server reject, expired). */
  private streamChannelBroken = false

  // Stream-packet throttle state
  private throttleTimer: ReturnType<typeof setTimeout> | null = null
  private pendingFlush = false

  // Push-mode progress throttle
  private lastProgressPushAt = 0

  // Lifecycle counters — surfaced in the terminal summary log
  private streamPacketsSent = 0
  private streamPacketsRejected = 0
  private progressPushesSent = 0
  private finalPushSent = false
  private firstPacketAt = 0
  private brokenReason: string | null = null
  private terminalLogged = false

  /** Called when this session is finished, so the instance can untrack it. */
  onDispose: (() => void) | null = null

  private static readonly THROTTLE_MS = 500
  // Leave ~480 bytes margin below the WeCom 20480 byte limit
  private static readonly MAX_CONTENT_BYTES = 20000

  constructor(
    instance: WecomBotInstance,
    reqId: string,
    chatId: string,
    chatType: 'direct' | 'group',
    instanceId: string,
    traceId: string,
  ) {
    this.streamId = `stream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    this.instance = instance
    this.reqId = reqId
    this.chatId = chatId
    this.chatType = chatType
    this.instanceId = instanceId
    this.traceId = traceId
    this.startedAt = Date.now()

    logEvent(this.instanceId, 'info', 'stream_open', {
      trace: this.traceId,
      streamId: this.streamId,
      reqId: this.reqId,
      chatId: this.chatId,
      chatType: this.chatType,
    })
  }

  /** Public read-only accessor for upstream logging correlation. */
  getTraceId(): string {
    return this.traceId
  }

  /** Public read-only accessor: lets external counters increment rejection count. */
  noteStreamPacketRejected(): void {
    this.streamPacketsRejected++
  }

  matchesReqId(reqId: string): boolean {
    return this.reqId === reqId && !this.finished
  }

  /** Mark stream as broken — subsequent delivery switches to push. Idempotent. */
  markStreamBroken(reason: string): void {
    if (this.streamChannelBroken) return
    this.streamChannelBroken = true
    this.brokenReason = reason
    this.clearThrottle()
    logEvent(this.instanceId, 'warn', 'stream_broken', {
      trace: this.traceId,
      streamId: this.streamId,
      reason,
      elapsedMs: Date.now() - this.startedAt,
      streamPacketsSent: this.streamPacketsSent,
    })
  }

  // ── StreamingHandle interface ──────────────────────────────────

  async update(event: ProgressEvent): Promise<void> {
    if (this.finished) return

    if (event.type === 'text_delta') {
      this.answerText += event.text
    } else {
      const line = formatProgressLine(event)
      if (line) this.progressLines.push(line)
    }

    // Proactively transition to push mode just before the server-side 10-min cutoff
    if (this.mode === 'stream' && !this.streamChannelBroken && this.isApproachingLifetimeCutoff()) {
      await this.transitionToPushMode('approaching 10-minute server cutoff')
      // After transition, fall through to push path below
    }

    if (this.mode === 'stream' && !this.streamChannelBroken) {
      this.scheduleFlush()
      return
    }

    // Push mode (or stream channel broken): deliver throttled progress as discrete pushes
    this.maybePushProgress()
  }

  async finish(finalText: string): Promise<void> {
    if (this.finished) return
    this.finished = true
    this.clearThrottle()

    // Detect content mismatch between streamed text_delta accumulation and final SDK text
    if (this.answerText !== finalText) {
      logEvent(this.instanceId, 'warn', 'stream_content_mismatch', {
        trace: this.traceId,
        streamId: this.streamId,
        streamedLen: this.answerText.length,
        finalLen: finalText.length,
        streamedPreview: previewText(this.answerText),
        finalPreview: previewText(finalText),
      })
    }
    this.answerText = finalText

    let deliveredVia: 'stream' | 'push' | 'push_failed' = 'stream'
    if (this.mode === 'stream' && !this.streamChannelBroken && !this.isStreamExpired()) {
      this.sendStreamPacket(true)
      deliveredVia = 'stream'
    } else {
      // Push final answer — survives WS reconnect via the instance push queue
      const ok = await this.instance.queuePush(
        this.chatId, finalText, this.chatType, `stream:${this.streamId}`, this.traceId,
      )
      this.finalPushSent = ok
      deliveredVia = ok ? 'push' : 'push_failed'
    }

    this.onDispose?.()
    this.logTerminalSummary(deliveredVia)
  }

  /** Abort without delivering. For teardown only; use markStreamBroken() for WS disconnects. */
  dispose(): void {
    if (this.finished) return
    this.finished = true
    this.clearThrottle()
    this.onDispose?.()
    this.logTerminalSummary('disposed')
  }

  /**
   * Single-line lifecycle summary emitted exactly once when the session ends.
   * Centralizes all counters so that grepping `event=stream_close trace=<id>`
   * gives the full picture of one stream's lifetime.
   */
  private logTerminalSummary(
    deliveredVia: 'stream' | 'push' | 'push_failed' | 'disposed',
  ): void {
    if (this.terminalLogged) return
    this.terminalLogged = true
    logEvent(
      this.instanceId,
      deliveredVia === 'push_failed' ? 'error' : 'info',
      'stream_close',
      {
        trace: this.traceId,
        streamId: this.streamId,
        mode: this.mode,
        delivered: deliveredVia,
        broken: this.streamChannelBroken,
        brokenReason: this.brokenReason ?? undefined,
        lifetimeMs: Date.now() - this.startedAt,
        timeToFirstPacketMs:
          this.firstPacketAt > 0 ? this.firstPacketAt - this.startedAt : -1,
        streamPacketsSent: this.streamPacketsSent,
        streamPacketsRejected: this.streamPacketsRejected,
        progressPushesSent: this.progressPushesSent,
        finalPushSent: this.finalPushSent,
        finalBytes: Buffer.byteLength(this.answerText, 'utf8'),
        progressLineCount: this.progressLines.length,
      },
    )
  }

  // ── Lifecycle helpers ─────────────────────────────────────────

  private isApproachingLifetimeCutoff(): boolean {
    return Date.now() - this.startedAt >= STREAM_LIFETIME_MS - STREAM_SAFETY_MARGIN_MS
  }

  private isStreamExpired(): boolean {
    return Date.now() - this.startedAt >= STREAM_LIFETIME_MS
  }

  private async transitionToPushMode(reason: string): Promise<void> {
    if (this.mode === 'push') return
    this.mode = 'push'
    logEvent(this.instanceId, 'info', 'stream_transition_to_push', {
      trace: this.traceId,
      streamId: this.streamId,
      reason,
      elapsedMs: Date.now() - this.startedAt,
      streamPacketsSent: this.streamPacketsSent,
    })
    this.clearThrottle()
    if (!this.streamChannelBroken) {
      this.sendStreamPacket(true, { withTransitionNotice: true })
    }
  }

  // ── Stream-mode delivery ──────────────────────────────────────

  private scheduleFlush(): void {
    if (this.throttleTimer) {
      // A timer is already running; flag that we want another flush after it fires
      this.pendingFlush = true
      return
    }

    // Send immediately, then start the cooldown timer
    this.sendStreamPacket(false)
    this.throttleTimer = setTimeout(() => {
      this.throttleTimer = null
      if (this.pendingFlush) {
        this.pendingFlush = false
        if (!this.finished && this.mode === 'stream' && !this.streamChannelBroken) {
          this.sendStreamPacket(false)
        }
      }
    }, WecomStreamSession.THROTTLE_MS)
  }

  private buildContent(): string {
    const thinkBlock = this.progressLines.length > 0
      ? `<think>\n${this.progressLines.join('\n')}\n</think>\n\n`
      : ''
    return thinkBlock + this.answerText
  }

  private sendStreamPacket(finish: boolean, opts?: { withTransitionNotice?: boolean }): void {
    const ws = this.instance.getActiveWebSocket()
    if (!ws) {
      logEvent(this.instanceId, 'warn', 'stream_packet_skip', {
        trace: this.traceId,
        streamId: this.streamId,
        finish,
        reason: 'ws_not_active',
        cat: 'network',
      })
      this.markStreamBroken('ws not open at sendStreamPacket')
      return
    }

    let content = this.buildContent()

    // Enforce byte limit — evict oldest progress lines from the top
    let truncatedLines = 0
    while (
      this.progressLines.length > 1 &&
      Buffer.byteLength(content, 'utf8') > WecomStreamSession.MAX_CONTENT_BYTES
    ) {
      this.progressLines.shift()
      truncatedLines++
      const truncatedThink = `<think>\n...\n${this.progressLines.join('\n')}\n</think>\n\n`
      content = truncatedThink + this.answerText
    }
    if (truncatedLines > 0) {
      logEvent(this.instanceId, 'warn', 'stream_content_truncated', {
        trace: this.traceId,
        streamId: this.streamId,
        evictedLines: truncatedLines,
        finalBytes: Buffer.byteLength(content, 'utf8'),
      })
    }

    if (opts?.withTransitionNotice) {
      content = content + STREAM_TRANSITION_NOTICE
    }

    const packet = {
      cmd: 'aibot_respond_msg',
      headers: { req_id: this.reqId },
      body: {
        msgtype: 'stream',
        stream: {
          id: this.streamId,
          finish,
          content,
        },
      },
    }

    const bytes = Buffer.byteLength(content, 'utf8')
    if (!this.started) {
      this.started = true
      this.firstPacketAt = Date.now()
      logEvent(this.instanceId, 'info', 'stream_first_packet', {
        trace: this.traceId,
        streamId: this.streamId,
        bytes,
        timeToFirstPacketMs: this.firstPacketAt - this.startedAt,
      })
    }

    try {
      ws.send(JSON.stringify(packet))
      this.streamPacketsSent++
      this.instance.noteOutbound('aibot_respond_msg', this.chatId)
      // Per-packet log: every packet visible (not just first/last).
      // INFO level kept lightweight — one line per send.
      logEvent(this.instanceId, 'info', 'stream_packet_sent', {
        trace: this.traceId,
        streamId: this.streamId,
        seq: this.streamPacketsSent,
        finish,
        bytes,
        elapsedMs: Date.now() - this.startedAt,
        progressLines: this.progressLines.length,
        transitionNotice: opts?.withTransitionNotice === true,
      })
      if (finish) {
        // Extra verbose finish log — kept because finish content is most useful
        // to inspect when diagnosing "user saw garbled final answer" reports.
        logEvent(this.instanceId, 'info', 'stream_finish_packet', {
          trace: this.traceId,
          streamId: this.streamId,
          bytes,
          contentPreview: previewText(content, 500),
        })
      }
    } catch (err) {
      logEvent(this.instanceId, 'error', 'stream_packet_send_error', {
        trace: this.traceId,
        streamId: this.streamId,
        cat: 'network',
        err: err instanceof Error ? err.message : String(err),
      })
      this.markStreamBroken('send threw')
    }
  }

  // ── Push-mode delivery ────────────────────────────────────────

  /** Push throttled progress snapshot in push mode. */
  private maybePushProgress(): void {
    const now = Date.now()
    if (now - this.lastProgressPushAt < STREAM_PROGRESS_PUSH_INTERVAL_MS) return
    if (this.progressLines.length === 0) return

    this.lastProgressPushAt = now
    const tail = this.progressLines.slice(-3).join('\n')
    const pushText = `_(任务进行中)_\n\n${tail}`
    this.progressPushesSent++

    logEvent(this.instanceId, 'info', 'stream_progress_push', {
      trace: this.traceId,
      streamId: this.streamId,
      seq: this.progressPushesSent,
      bytes: Buffer.byteLength(pushText, 'utf8'),
      elapsedMs: now - this.startedAt,
    })

    void this.instance.queuePush(
      this.chatId, pushText, this.chatType, `stream:${this.streamId}`, this.traceId,
    )
  }

  private clearThrottle(): void {
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer)
      this.throttleTimer = null
    }
    this.pendingFlush = false
  }
}

// ============================================
// Provider
// ============================================

export class WecomBotProvider implements ImChannelProvider {
  readonly type: ImChannelType = 'wecom-bot'
  readonly displayName = 'WeCom Intelligent Bot'
  readonly description = 'Bidirectional messaging via WeCom AI Bot WebSocket'
  readonly direction = 'bidirectional' as const

  readonly configFields: ImChannelConfigFieldDef[] = [
    { key: 'botId', label: 'Bot ID', type: 'text', placeholder: 'aib-xxx', required: true },
    { key: 'secret', label: 'Secret', type: 'password', required: true },
    { key: 'wsUrl', label: 'WebSocket URL', type: 'text', placeholder: 'wss://openws.work.weixin.qq.com' },
  ]

  readonly defaultConfig: Record<string, unknown> = {
    botId: '',
    secret: '',
    wsUrl: '',
  }

  createInstance(instanceId: string, config: Record<string, unknown>): ImChannelInstance {
    return new WecomBotInstance(instanceId, config as unknown as WecomBotProviderConfig)
  }

  validateConfig(config: Record<string, unknown>): string | null {
    if (!config.botId || typeof config.botId !== 'string') return 'Bot ID is required'
    if (!config.secret || typeof config.secret !== 'string') return 'Secret is required'
    return null
  }
}

// ============================================
// Instance
// ============================================

interface ReqIdEntry {
  reqId: string
  ts: number
}

/** Pending WebSocket request-response resolver */
interface PendingResponse {
  resolve: (msg: any) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

class WecomBotInstance implements ImChannelInstance {
  readonly instanceId: string
  readonly providerType: ImChannelType = 'wecom-bot'

  private config: WecomBotProviderConfig
  private ws: WebSocket | null = null
  private active = false
  /** True after aibot_subscribe succeeds; reset on WS close. */
  private authenticated = false
  private reconnectAttempts = 0
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reqIdCleanupTimer: ReturnType<typeof setInterval> | null = null
  private inboundHandler: ((msg: InboundMessage, reply: ReplyHandle) => void) | null = null
  private reqIdMap = new Map<string, ReqIdEntry>()

  /**
   * Pending request-response resolvers for WebSocket command pairs.
   * Used for upload protocol (init / chunk / complete) and future command RPCs.
   * Keyed by req_id so responses are matched back to their caller Promises.
   */
  private pendingResponses = new Map<string, PendingResponse>()

  /** Active stream sessions — used for ACK routing and lifecycle coordination. */
  private activeStreamSessions = new Set<WecomStreamSession>()

  /** Pushes deferred while WS is unauthenticated; flushed on next subscribe. */
  private pendingPushes: Array<{
    chatId: string
    text: string
    chatType: 'direct' | 'group'
    enqueuedAt: number
    sourceTag: string
    trace: string | undefined
    resolve: (sent: boolean) => void
  }> = []

  // ── Observability state ──────────────────────────────────────
  //
  // All counters below are best-effort INFO-level metrics emitted in the
  // periodic health snapshot. They are not authoritative for business logic.

  /** Timestamp of the most recent inbound frame from the WS (any cmd, including pong). */
  private lastWsActivityAt = 0
  /** Timestamp of the most recent outbound ping; used by the liveness check. */
  private lastPingSentAt = 0
  /** Per-chat rolling 60s timestamps for soft-rate-limit observation. */
  private sendTimestampsByChat = new Map<string, number[]>()
  /** Lifetime totals since process start; emitted in health snapshot + on stop. */
  private counters = {
    totalInbound: 0,
    totalReply: 0,
    totalPush: 0,
    totalStreamPackets: 0,
    totalError: 0,
    totalLivenessReconnect: 0,
    totalDispatched: 0,
  }
  /** Periodic health snapshot timer — keeps low-frequency status visible. */
  private healthSnapshotTimer: ReturnType<typeof setInterval> | null = null
  /** Timer for the post-ping liveness check; rolling, replaced each heartbeat. */
  private livenessTimer: ReturnType<typeof setTimeout> | null = null
  /** Timestamp instance was started, for uptime-in-snapshot computations. */
  private startedAt = 0

  constructor(instanceId: string, config: WecomBotProviderConfig) {
    this.instanceId = instanceId
    this.config = config
  }

  /**
   * Per-outbound bookkeeping: increment counters, prune rolling-window timestamps,
   * and warn when approaching the per-chat 30/min soft limit. Called by all send
   * paths (reply, push, stream packet) so the rate-limit picture is complete.
   *
   * Performance: O(window) prune per call where window <= ~30 entries; negligible.
   */
  noteOutbound(kind: 'aibot_respond_msg' | 'aibot_send_msg', chatId: string): void {
    const now = Date.now()
    const arr = this.sendTimestampsByChat.get(chatId) ?? []
    const cutoff = now - FREQ_WINDOW_MS
    // Prune in-place — find first entry within window, slice once
    let i = 0
    while (i < arr.length && arr[i] < cutoff) i++
    const pruned = i > 0 ? arr.slice(i) : arr
    pruned.push(now)
    this.sendTimestampsByChat.set(chatId, pruned)

    if (kind === 'aibot_respond_msg') {
      // Stream packets and single replies both use respond_msg; differentiate via
      // event labels at the call site rather than splitting counters here.
      this.counters.totalStreamPackets++  // rough — respond_msg includes single replies too; close enough
    } else {
      this.counters.totalPush++
    }

    if (pruned.length >= FREQ_WARN_THRESHOLD) {
      logEvent(this.instanceId, 'warn', 'rate_limit_approaching', {
        chatId,
        kind,
        inWindow: pruned.length,
        windowMs: FREQ_WINDOW_MS,
        hardCap: 30,
      })
    }
  }

  // ── ImChannelInstance interface ────────────────────────────────

  onInbound(handler: (msg: InboundMessage, reply: ReplyHandle) => void): void {
    this.inboundHandler = handler
  }

  start(): void {
    this.active = true
    this.startedAt = Date.now()
    if (!this.config.botId || !this.config.secret) {
      logEvent(this.instanceId, 'warn', 'start_skip', { reason: 'missing botId or secret' })
      return
    }
    this.connect()
    this.reqIdCleanupTimer = setInterval(() => this.cleanupExpiredReqIds(), REQ_ID_CLEANUP_INTERVAL_MS)
    this.healthSnapshotTimer = setInterval(() => this.emitHealthSnapshot(), HEALTH_SNAPSHOT_INTERVAL_MS)
    logEvent(this.instanceId, 'info', 'instance_start', {
      botIdPrefix: this.config.botId.slice(0, 8),
      wsUrl: this.config.wsUrl || DEFAULT_WS_URL,
    })
  }

  stop(): void {
    this.active = false
    this.authenticated = false
    // Final health snapshot before teardown — captures lifetime totals for postmortem
    this.emitHealthSnapshot('stop')
    // Cancel all timers before tearing down the socket so no reconnect or
    // heartbeat fires during teardown.
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    if (this.reqIdCleanupTimer) { clearInterval(this.reqIdCleanupTimer); this.reqIdCleanupTimer = null }
    if (this.healthSnapshotTimer) { clearInterval(this.healthSnapshotTimer); this.healthSnapshotTimer = null }
    if (this.livenessTimer) { clearTimeout(this.livenessTimer); this.livenessTimer = null }
    // Reject all pending upload/command responses immediately on stop
    this.rejectAllPendingResponses(new Error('WecomBot instance stopped'))
    if (this.pendingPushes.length > 0) {
      logEvent(this.instanceId, 'warn', 'push_queue_drop_on_stop', {
        count: this.pendingPushes.length,
      })
      const drained = this.pendingPushes.splice(0, this.pendingPushes.length)
      for (const entry of drained) entry.resolve(false)
    }
    this.activeStreamSessions.forEach(session => session.dispose())
    this.activeStreamSessions.clear()
    // Destroy socket first, then clear the handler.  Reversing the order would
    // create a brief window where an in-flight WebSocket message callback could
    // fire with a null handler and silently drop the message.
    this.destroySocket()
    this.inboundHandler = null
    this.reqIdMap.clear()
    this.sendTimestampsByChat.clear()
    this.reconnectAttempts = 0
    logEvent(this.instanceId, 'info', 'instance_stop', {})
  }

  /**
   * Emit a single-line health snapshot covering connection state, in-flight
   * resource counts, and lifetime totals. Fires on a 5-minute timer and on stop.
   * Cost: one Map.size lookup × a few + counter reads + one console.log; negligible.
   */
  private emitHealthSnapshot(trigger: 'periodic' | 'stop' = 'periodic'): void {
    const wsState = this.ws ? this.ws.readyState : -1
    logEvent(this.instanceId, 'info', 'health_snapshot', {
      trigger,
      uptimeMs: this.startedAt > 0 ? Date.now() - this.startedAt : 0,
      active: this.active,
      authenticated: this.authenticated,
      // WebSocket.readyState: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED, -1=null
      wsState,
      reconnectAttempts: this.reconnectAttempts,
      activeStreams: this.activeStreamSessions.size,
      pendingPushes: this.pendingPushes.length,
      pendingResponses: this.pendingResponses.size,
      reqIdMapSize: this.reqIdMap.size,
      trackedChats: this.sendTimestampsByChat.size,
      lastWsActivityAgoMs: this.lastWsActivityAt > 0 ? Date.now() - this.lastWsActivityAt : -1,
      // Lifetime counters
      totalInbound: this.counters.totalInbound,
      totalReply: this.counters.totalReply,
      totalPush: this.counters.totalPush,
      totalStreamPackets: this.counters.totalStreamPackets,
      totalDispatched: this.counters.totalDispatched,
      totalError: this.counters.totalError,
      totalLivenessReconnect: this.counters.totalLivenessReconnect,
    })
  }

  reconnect(): void {
    if (!this.active) return
    this.destroySocket()
    this.stopHeartbeat()
    this.reconnectAttempts = 0
    if (this.config.botId && this.config.secret) {
      this.connect()
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  /**
   * Synchronous push (aibot_send_msg). Returns false if WS is not ready.
   * For long-task scenarios where you can tolerate reconnect-then-send,
   * prefer queuePush() so the message survives a brief WS bounce.
   */
  pushToChat(chatId: string, text: string, chatType: 'direct' | 'group', trace?: string): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.authenticated) {
      logEvent(this.instanceId, 'warn', 'push_unavailable', {
        trace,
        chatId,
        chatType,
        open: this.ws?.readyState === WebSocket.OPEN,
        authenticated: this.authenticated,
        cat: 'network',
      })
      return false
    }

    // P2 defensive: WeCom requires the user to have messaged the bot at least
    // once before push to a direct chat. We don't block (history may pre-date
    // this session) but we flag it so it's clear in logs if rejection follows.
    if (chatType === 'direct' && !this.reqIdMap.has(chatId)) {
      logEvent(this.instanceId, 'warn', 'push_direct_no_history', {
        trace,
        chatId,
      })
    }

    const reqId = generateReqId('aibot_send_msg')
    try {
      this.ws.send(JSON.stringify({
        cmd: 'aibot_send_msg',
        headers: { req_id: reqId },
        body: {
          chatid: chatId,
          chat_type: chatType === 'direct' ? 1 : 2,
          msgtype: 'markdown',
          markdown: { content: text },
        },
      }))
      this.noteOutbound('aibot_send_msg', chatId)
      logEvent(this.instanceId, 'info', 'push_sent', {
        trace,
        chatId,
        chatType,
        reqId,
        bytes: Buffer.byteLength(text, 'utf8'),
      })
      return true
    } catch (err) {
      this.counters.totalError++
      logEvent(this.instanceId, 'error', 'push_send_error', {
        trace,
        chatId,
        chatType,
        cat: 'network',
        err: err instanceof Error ? err.message : String(err),
      })
      return false
    }
  }

  // ── Internal accessors used by WecomStreamSession ─────────────

  getActiveWebSocket(): WebSocket | null {
    if (!this.ws) return null
    if (this.ws.readyState !== WebSocket.OPEN) return null
    if (!this.authenticated) return null
    return this.ws
  }

  /**
   * Push a message, queueing if WS is unauthenticated. Drains on next subscribe.
   *
   * The trace argument is propagated to logs so a single user interaction is
   * traceable end-to-end (inbound → dispatch → stream packets → queued push →
   * flush). Pass `undefined` if no upstream trace exists (rare).
   */
  queuePush(
    chatId: string,
    text: string,
    chatType: 'direct' | 'group',
    sourceTag: string,
    trace?: string,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (this.getActiveWebSocket()) {
        resolve(this.pushToChat(chatId, text, chatType, trace))
        return
      }

      const entry = {
        chatId,
        text,
        chatType,
        enqueuedAt: Date.now(),
        sourceTag,
        trace,
        resolve,
      }
      this.pendingPushes.push(entry)
      logEvent(this.instanceId, 'info', 'push_queued', {
        trace,
        chatId,
        chatType,
        source: sourceTag,
        queueLen: this.pendingPushes.length,
        bytes: Buffer.byteLength(text, 'utf8'),
      })

      setTimeout(() => {
        const idx = this.pendingPushes.indexOf(entry)
        if (idx === -1) return
        this.pendingPushes.splice(idx, 1)
        this.counters.totalError++
        logEvent(this.instanceId, 'error', 'push_queue_timeout', {
          trace,
          chatId,
          source: sourceTag,
          waitMs: PUSH_QUEUE_WAIT_MS,
          cat: 'network',
        })
        resolve(false)
      }, PUSH_QUEUE_WAIT_MS)
    })
  }

  private flushPendingPushes(): void {
    if (this.pendingPushes.length === 0) return
    const drained = this.pendingPushes.splice(0, this.pendingPushes.length)
    logEvent(this.instanceId, 'info', 'push_queue_flush_start', { count: drained.length })
    let delivered = 0
    let dropped = 0
    for (const entry of drained) {
      if (Date.now() - entry.enqueuedAt > PUSH_QUEUE_WAIT_MS) {
        dropped++
        logEvent(this.instanceId, 'error', 'push_queue_flush_stale', {
          trace: entry.trace,
          chatId: entry.chatId,
          source: entry.sourceTag,
          ageMs: Date.now() - entry.enqueuedAt,
          cat: 'internal',
        })
        entry.resolve(false)
        continue
      }
      const ok = this.pushToChat(entry.chatId, entry.text, entry.chatType, entry.trace)
      if (ok) delivered++
      entry.resolve(ok)
    }
    logEvent(this.instanceId, 'info', 'push_queue_flush_done', {
      delivered,
      dropped,
      failed: drained.length - delivered - dropped,
    })
  }

  /**
   * Optional file-sending capability.
   * Bound to this instance so callers don't need to hold a reference to the instance.
   */
  readonly fileCapability: ImFileCapability = {
    sendFile: (chatId, file, chatType) =>
      this.sendFileToChat(chatId, file.resolvedPath, chatType, file.displayName),
  }

  // ── Reply (using req_id from inbound message) ─────────────────

  private replyToChat(chatId: string, text: string, trace?: string): boolean {
    if (!this.getActiveWebSocket()) {
      logEvent(this.instanceId, 'warn', 'reply_skip_ws_not_active', {
        trace, chatId, cat: 'network',
      })
      return false
    }

    const entry = this.reqIdMap.get(chatId)
    if (!entry) {
      logEvent(this.instanceId, 'warn', 'reply_skip_no_reqid', { trace, chatId })
      return false
    }
    if (Date.now() - entry.ts > REPLY_WINDOW_MS) {
      this.reqIdMap.delete(chatId)
      logEvent(this.instanceId, 'warn', 'reply_skip_window_expired', {
        trace, chatId, ageMs: Date.now() - entry.ts, windowMs: REPLY_WINDOW_MS,
      })
      return false
    }

    try {
      this.ws!.send(JSON.stringify({
        cmd: 'aibot_respond_msg',
        headers: { req_id: entry.reqId },
        body: {
          msgtype: 'markdown',
          markdown: { content: text },
        },
      }))
      this.counters.totalReply++
      this.noteOutbound('aibot_respond_msg', chatId)
      logEvent(this.instanceId, 'info', 'reply_sent', {
        trace,
        chatId,
        reqId: entry.reqId,
        bytes: Buffer.byteLength(text, 'utf8'),
        reqIdAgeMs: Date.now() - entry.ts,
      })
      return true
    } catch (err) {
      this.counters.totalError++
      logEvent(this.instanceId, 'error', 'reply_send_error', {
        trace, chatId, cat: 'network',
        err: err instanceof Error ? err.message : String(err),
      })
      return false
    }
  }

  // ── File: Upload & Send ────────────────────────────────────────

  /**
   * Upload a local file to WeCom via WebSocket chunked upload.
   *
   * Protocol: init → N chunks → complete → media_id
   *   - Each chunk ≤ 512 KB (before base64), max 100 chunks
   *   - Upload session valid for 30 minutes
   *   - media_id valid for 3 days
   *   - Frequency limit: 30 req/min, 1000 req/hr
   *
   * @param filePath - Absolute path to the local file
   * @param mediaType - WeCom media type ('file' | 'image' | 'voice' | 'video')
   * @param filename - Display filename (defaults to basename)
   * @returns media_id for use in message payloads
   */
  private async uploadMediaToWecom(
    filePath: string,
    mediaType: 'file' | 'image' | 'voice' | 'video',
    filename?: string
  ): Promise<string> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('[WecomBot] WebSocket not connected for upload')
    }

    const fileBuf = await readFile(filePath)
    const totalSize = fileBuf.length
    const displayName = filename || basename(filePath)
    const md5 = createHash('md5').update(fileBuf).digest('hex')
    const totalChunks = Math.ceil(totalSize / UPLOAD_CHUNK_SIZE)

    if (totalChunks > UPLOAD_MAX_CHUNKS) {
      throw new Error(
        `File too large for WeCom upload: ${totalChunks} chunks required (max ${UPLOAD_MAX_CHUNKS})`
      )
    }

    logEvent(this.instanceId, 'info', 'upload_start', {
      displayName, bytes: totalSize, chunks: totalChunks, mediaType,
    })
    const uploadStartedAt = Date.now()

    // Step 1: Initialize upload session
    const initReqId = generateReqId('upload_init')
    const initResp = await this.sendAndWaitResponse(initReqId, {
      cmd: 'aibot_upload_media_init',
      headers: { req_id: initReqId },
      body: {
        type: mediaType,
        filename: displayName,
        total_size: totalSize,
        total_chunks: totalChunks,
        md5,
      },
    })

    const uploadId: string = initResp.body?.upload_id
    if (!uploadId) {
      throw new Error('[WecomBot] No upload_id returned from aibot_upload_media_init')
    }
    logEvent(this.instanceId, 'info', 'upload_init_ok', { uploadId, displayName })

    // Step 2: Upload chunks (sequential for simplicity; WeCom supports out-of-order)
    for (let i = 0; i < totalChunks; i++) {
      const start = i * UPLOAD_CHUNK_SIZE
      const end = Math.min(start + UPLOAD_CHUNK_SIZE, totalSize)
      const chunkData = fileBuf.subarray(start, end).toString('base64')
      const chunkReqId = generateReqId(`upload_chunk_${i}`)
      await this.sendAndWaitResponse(chunkReqId, {
        cmd: 'aibot_upload_media_chunk',
        headers: { req_id: chunkReqId },
        body: { upload_id: uploadId, chunk_index: i, base64_data: chunkData },
      })
      // Per-chunk log at INFO is acceptable: capped at <=100 lines per upload
      // and uploads are rare events compared to message traffic.
      logEvent(this.instanceId, 'info', 'upload_chunk_sent', {
        uploadId,
        chunkIndex: i,
        total: totalChunks,
        bytes: end - start,
      })
    }

    // Step 3: Finalize upload and get media_id
    const completeReqId = generateReqId('upload_finish')
    const completeResp = await this.sendAndWaitResponse(completeReqId, {
      cmd: 'aibot_upload_media_finish',
      headers: { req_id: completeReqId },
      body: { upload_id: uploadId },
    })

    const mediaId: string = completeResp.body?.media_id
    if (!mediaId) {
      throw new Error('[WecomBot] No media_id returned from aibot_upload_media_finish')
    }

    logEvent(this.instanceId, 'info', 'upload_complete', {
      uploadId, mediaId, displayName, elapsedMs: Date.now() - uploadStartedAt,
    })
    return mediaId
  }

  /**
   * Upload a local file and send it to a WeCom chat.
   *
   * Combines uploadMediaToWecom + message dispatch.
   * Uses aibot_respond_msg (passive reply) when a valid req_id is available,
   * falls back to aibot_send_msg (active push) otherwise.
   *
   * @param chatId - Target platform-side conversation ID
   * @param filePath - Absolute path to the local file
   * @param chatType - Conversation type
   * @param filename - Display filename (defaults to basename of filePath)
   * @returns true on success, false on recoverable failure
   */
  async sendFileToChat(
    chatId: string,
    filePath: string,
    chatType: 'direct' | 'group',
    filename?: string
  ): Promise<boolean> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logEvent(this.instanceId, 'warn', 'send_file_skip_ws_not_open', { chatId, cat: 'network' })
      return false
    }

    try {
      const displayName = filename || basename(filePath)
      const ext = extname(filePath).toLowerCase()
      const mediaType: 'image' | 'file' = IMAGE_EXTENSIONS.has(ext) ? 'image' : 'file'

      logEvent(this.instanceId, 'info', 'send_file_start', {
        chatId, chatType, displayName, mediaType,
      })

      const mediaId = await this.uploadMediaToWecom(filePath, mediaType, displayName)

      const msgBody = mediaType === 'image'
        ? { msgtype: 'image', image: { media_id: mediaId } }
        : { msgtype: 'file', file: { media_id: mediaId } }

      const entry = this.reqIdMap.get(chatId)
      const canReply = entry && (Date.now() - entry.ts < REPLY_WINDOW_MS)
      const via: 'aibot_respond_msg' | 'aibot_send_msg' =
        canReply ? 'aibot_respond_msg' : 'aibot_send_msg'

      if (canReply) {
        this.ws.send(JSON.stringify({
          cmd: 'aibot_respond_msg',
          headers: { req_id: entry!.reqId },
          body: msgBody,
        }))
      } else {
        this.ws.send(JSON.stringify({
          cmd: 'aibot_send_msg',
          headers: { req_id: generateReqId('send_file') },
          body: {
            chatid: chatId,
            chat_type: chatType === 'direct' ? 1 : 2,
            ...msgBody,
          },
        }))
      }
      this.noteOutbound(via, chatId)
      logEvent(this.instanceId, 'info', 'send_file_sent', {
        chatId, displayName, mediaType, mediaId, via,
      })
      return true
    } catch (err) {
      this.counters.totalError++
      logEvent(this.instanceId, 'error', 'send_file_failed', {
        chatId,
        cat: 'protocol',
        err: err instanceof Error ? err.message : String(err),
      })
      return false
    }
  }

  // ── WebSocket: Request-Response RPC ───────────────────────────

  /**
   * Send a WebSocket message and wait for the matching response (matched by req_id).
   *
   * Used for upload protocol commands (init / chunk / complete).
   * Rejects on WeCom errcode ≠ 0 or after WS_REQUEST_TIMEOUT_MS.
   */
  private sendAndWaitResponse(reqId: string, message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingResponses.delete(reqId)
        this.counters.totalError++
        logEvent(this.instanceId, 'error', 'rpc_timeout', {
          reqId,
          cmd: message?.cmd,
          timeoutMs: WS_REQUEST_TIMEOUT_MS,
          cat: 'network',
        })
        reject(new Error(`WeCom WebSocket response timeout for reqId=${reqId}`))
      }, WS_REQUEST_TIMEOUT_MS)

      this.pendingResponses.set(reqId, { resolve, reject, timer })

      try {
        this.ws!.send(JSON.stringify(message))
      } catch (err) {
        clearTimeout(timer)
        this.pendingResponses.delete(reqId)
        this.counters.totalError++
        logEvent(this.instanceId, 'error', 'rpc_send_error', {
          reqId,
          cmd: message?.cmd,
          cat: 'network',
          err: err instanceof Error ? err.message : String(err),
        })
        reject(err as Error)
      }
    })
  }

  /**
   * Reject all pending upload responses immediately.
   * Called on stop() to prevent dangling Promises.
   */
  private rejectAllPendingResponses(reason: Error): void {
    for (const [, pending] of this.pendingResponses) {
      clearTimeout(pending.timer)
      pending.reject(reason)
    }
    this.pendingResponses.clear()
  }

  // ── WebSocket Connection ──────────────────────────────────────

  private connect(): void {
    this.destroySocket()
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }

    const wsUrl = this.config.wsUrl || DEFAULT_WS_URL
    logEvent(this.instanceId, 'info', 'ws_connecting', {
      wsUrl,
      attempt: this.reconnectAttempts,
    })

    const connectStartedAt = Date.now()
    try {
      this.ws = new WebSocket(wsUrl, {
        perMessageDeflate: false,
        skipUTF8Validation: true,
      })
    } catch (err) {
      this.counters.totalError++
      logEvent(this.instanceId, 'error', 'ws_create_failed', {
        cat: 'network',
        err: err instanceof Error ? err.message : String(err),
      })
      this.scheduleReconnect()
      return
    }

    this.ws.on('open', () => {
      this.reconnectAttempts = 0
      this.authenticated = false
      this.lastWsActivityAt = Date.now()
      logEvent(this.instanceId, 'info', 'ws_open', {
        wsUrl,
        connectMs: Date.now() - connectStartedAt,
      })
      this.ws!.send(JSON.stringify({
        cmd: 'aibot_subscribe',
        headers: { req_id: generateReqId('aibot_subscribe') },
        body: {
          bot_id: this.config.botId,
          secret: this.config.secret,
        },
      }))
    })

    this.ws.on('message', (data: WebSocket.Data) => {
      // Any inbound traffic counts as liveness signal — keeps zombie detection honest
      this.lastWsActivityAt = Date.now()
      this.handleMessage(data)
    })

    // WebSocket protocol-level ping (server-initiated). Respond + count as liveness.
    this.ws.on('ping', () => {
      this.lastWsActivityAt = Date.now()
      this.ws?.pong()
    })

    // WebSocket protocol-level pong (server's reply to our protocol-level ping, if any).
    this.ws.on('pong', () => {
      this.lastWsActivityAt = Date.now()
    })

    this.ws.on('close', (code: number, reason: Buffer) => {
      const reasonStr = reason.toString() || 'unknown'
      const wasAuthenticated = this.authenticated
      this.authenticated = false
      this.stopHeartbeat()
      if (this.livenessTimer) { clearTimeout(this.livenessTimer); this.livenessTimer = null }
      logEvent(this.instanceId, 'warn', 'ws_close', {
        code,
        reason: reasonStr,
        wasAuthenticated,
        activeStreams: this.activeStreamSessions.size,
        cat: 'network',
      })
      // Mark broken (not dispose) so finish() can deliver via push after reconnect
      this.activeStreamSessions.forEach(session => session.markStreamBroken(`ws close (code=${code})`))
      // Reject pending upload responses — they cannot complete after disconnect
      this.rejectAllPendingResponses(
        new Error(`WeCom WebSocket closed (code=${code}) — upload aborted`)
      )
      if (this.active) {
        this.scheduleReconnect()
      }
    })

    this.ws.on('error', (err: Error) => {
      this.counters.totalError++
      logEvent(this.instanceId, 'error', 'ws_error', {
        cat: 'network',
        err: err.message,
      })
    })
  }

  private destroySocket(): void {
    if (this.ws) {
      try {
        this.ws.removeAllListeners()
        this.ws.terminate()
      } catch { /* ignore */ }
      this.ws = null
    }
  }

  private handleMessage(data: WebSocket.Data): void {
    const raw = typeof data === 'string' ? data : data.toString()

    let msg: any
    try {
      msg = JSON.parse(raw)
    } catch {
      logEvent(this.instanceId, 'warn', 'ws_invalid_json', {
        cat: 'protocol',
        preview: previewText(raw, 200),
      })
      return
    }

    const reqId: string = msg.headers?.req_id ?? ''

    // ── Resolve pending upload/command responses FIRST ─────────────────────────
    // Upload protocol (init/chunk/complete) uses sendAndWaitResponse(). Match
    // by req_id before any other routing to avoid falling into the cmd switch.
    if (reqId) {
      const pending = this.pendingResponses.get(reqId)
      if (pending) {
        clearTimeout(pending.timer)
        this.pendingResponses.delete(reqId)
        if (msg.errcode && msg.errcode !== 0) {
          this.counters.totalError++
          logEvent(this.instanceId, 'error', 'rpc_error_ack', {
            reqId,
            errcode: msg.errcode,
            errmsg: msg.errmsg ?? 'unknown',
            cat: 'protocol',
          })
          pending.reject(new Error(`WeCom error ${msg.errcode}: ${msg.errmsg ?? 'unknown'}`))
        } else {
          logEvent(this.instanceId, 'info', 'rpc_ok_ack', { reqId })
          pending.resolve(msg)
        }
        return
      }
    }

    // Authentication response
    if (typeof reqId === 'string' && reqId.startsWith('aibot_subscribe')) {
      if (msg.errcode === 0) {
        this.authenticated = true
        logEvent(this.instanceId, 'info', 'subscribe_ok', {})
        this.startHeartbeat()
        this.flushPendingPushes()
      } else {
        this.counters.totalError++
        logEvent(this.instanceId, 'error', 'subscribe_failed', {
          errcode: msg.errcode,
          errmsg: msg.errmsg,
          cat: 'protocol',
        })
        this.destroySocket()
      }
      return
    }

    // Heartbeat ack — silent in INFO; counts as liveness above (lastWsActivityAt updated)
    if (typeof reqId === 'string' && reqId.startsWith('ping')) return

    // Stream-packet ACK routing.
    //
    // Multiple aibot_respond_msg(stream) packets share the inbound req_id, so they
    // do not register in pendingResponses (keyed by req_id, single-shot only).
    // We route their responses here by scanning active stream sessions: any
    // response carrying a req_id that matches an active stream is treated as that
    // session's ACK. errcode != 0 marks the stream broken; errcode == 0 is logged
    // at INFO so the "did the server accept this packet?" question is answerable.
    if (reqId && msg.errcode !== undefined) {
      for (const session of this.activeStreamSessions) {
        if (session.matchesReqId(reqId)) {
          if (msg.errcode !== 0) {
            this.counters.totalError++
            session.noteStreamPacketRejected()
            logEvent(this.instanceId, 'warn', 'stream_packet_rejected', {
              trace: session.getTraceId(),
              reqId,
              errcode: msg.errcode,
              errmsg: msg.errmsg ?? 'unknown',
              cat: 'protocol',
            })
            session.markStreamBroken(`server errcode=${msg.errcode}: ${msg.errmsg ?? 'unknown'}`)
          } else {
            logEvent(this.instanceId, 'info', 'stream_packet_ack', {
              trace: session.getTraceId(),
              reqId,
            })
          }
          return
        }
      }
    }

    // Command-based routing
    switch (msg.cmd) {
      case 'aibot_msg_callback':
        this.handleInboundMessage(msg).catch((err: Error) => {
          this.counters.totalError++
          logEvent(this.instanceId, 'error', 'inbound_handler_error', {
            cat: 'internal',
            err: err.message,
          })
        })
        break
      case 'aibot_event_callback': {
        const eventType: string = msg.body?.event?.eventtype ?? msg.body?.event_type ?? 'unknown'
        if (eventType === 'disconnected_event') {
          // The server is forcing this connection off (new connection took the slot).
          // Tear down immediately so reconnect kicks in — don't wait for ws.on('close').
          logEvent(this.instanceId, 'warn', 'disconnected_event', {
            reason: 'new connection took bot slot',
            activeStreams: this.activeStreamSessions.size,
            cat: 'protocol',
          })
          this.authenticated = false
          // Mark streams broken so any in-flight finish() falls back to push
          this.activeStreamSessions.forEach(s =>
            s.markStreamBroken('disconnected_event: superseded'))
          this.destroySocket()
          if (this.active) this.scheduleReconnect()
        } else {
          logEvent(this.instanceId, 'info', 'event_callback', { eventType })
        }
        break
      }
      default:
        if (msg.cmd) {
          logEvent(this.instanceId, 'info', 'unknown_cmd', { cmd: msg.cmd })
        }
        break
    }
  }

  /** Handle aibot_msg_callback: download media, then dispatch. */
  private async handleInboundMessage(msg: any): Promise<void> {
    if (!this.active || !this.inboundHandler) return

    const body = msg.body
    if (!body) return

    const reqId = msg.headers?.req_id
    const senderId = body.from?.userid
    const senderName = body.from?.name ?? senderId
    const chatId = body.chatid ?? senderId
    const chatType = body.chattype
    const msgId = body.msgid
    const msgType = body.msgtype

    if (!senderId || !chatId) {
      logEvent(this.instanceId, 'warn', 'inbound_drop_missing_fields', {
        hasSender: Boolean(senderId), hasChat: Boolean(chatId), msgId,
      })
      return
    }

    // Trace ID: prefer WeCom msgid (already unique per callback). Fall back to a
    // generated ID for the rare case of missing msgid, so every conversation is
    // grep-able end-to-end via `trace=<id>`.
    const trace: string = msgId || generateTraceId('inbound')
    this.counters.totalInbound++

    if (reqId) {
      this.reqIdMap.set(chatId, { reqId, ts: Date.now() })
    }

    const inboundReceivedAt = Date.now()
    logEvent(this.instanceId, 'info', 'inbound_received', {
      trace,
      chatId,
      chatType,
      from: senderId,
      fromName: senderName !== senderId ? senderName : undefined,
      msgType,
      reqId,
      hasQuote: Boolean(body.quote),
    })

    // ── Download & decrypt media (image / file / video) ────────────────────────
    // Guard by url+aeskey presence, not chatType. WeCom docs say image/file/video
    // are "direct-chat only" but that likely means the server won't send them in group
    // context — if it does send url+aeskey, we should process regardless.
    // The 5-minute URL window means we MUST download here before returning.
    //
    // Each media item is processed independently — a failed download does not
    // discard already-downloaded attachments (per-item error isolation).
    const attachments: InboundAttachment[] = []
    const images: ImageAttachment[] = []

    await this.collectMedia(body, msgType, attachments, images)

    if (body.quote) {
      const quoteMsgType: string = body.quote.msgtype
      const quoteMediaCountBefore = attachments.length + images.length
      await this.collectMedia(body.quote, quoteMsgType, attachments, images)
      const quoteMediaAdded = (attachments.length + images.length) - quoteMediaCountBefore
      if (quoteMediaAdded > 0) {
        logEvent(this.instanceId, 'info', 'inbound_quote_media', {
          trace, count: quoteMediaAdded, quoteMsgType,
        })
      }
    }

    const text = this.extractText(body)
    const mediaPrepMs = Date.now() - inboundReceivedAt

    logEvent(this.instanceId, 'info', 'inbound_parsed', {
      trace,
      chatId,
      textLen: text.length,
      attachments: attachments.length,
      images: images.length,
      mediaPrepMs,
    })

    const chatTypeNorm: 'direct' | 'group' = chatType === 'group' ? 'group' : 'direct'

    const inbound: InboundMessage = {
      body: text,
      from: senderId,
      fromName: senderName,
      channel: 'wecom-bot',
      chatType: chatTypeNorm,
      chatId,
      messageId: msgId,
      timestamp: Date.now(),
      ...(attachments.length > 0 ? { attachments } : {}),
      ...(images.length > 0 ? { images } : {}),
    }

    // Lazily create stream session (supplements may never use it)
    const canStream = Boolean(reqId) && this.getActiveWebSocket() !== null
    let streamSession: WecomStreamSession | null = null
    const ensureStreamSession = (): WecomStreamSession | null => {
      if (!canStream) return null
      if (!streamSession) {
        streamSession = this.createTrackedStreamSession(reqId, chatId, chatTypeNorm, trace)
      }
      return streamSession
    }

    const streaming: StreamingHandle | undefined = canStream
      ? {
          update: async (event: ProgressEvent) => {
            const s = ensureStreamSession()
            if (s) await s.update(event)
          },
          finish: async (finalText: string) => {
            const s = ensureStreamSession()
            if (s) await s.finish(finalText)
          },
          dispose: () => {
            if (streamSession) {
              streamSession.dispose()
              streamSession = null
            }
          },
        }
      : undefined

    const reply: ReplyHandle = {
      channel: 'wecom-bot',
      chatId,
      replyTtlMs: REPLY_WINDOW_MS,

      send: async (replyText: string): Promise<void> => {
        const replied = this.replyToChat(chatId, replyText, trace)
        if (replied) return
        logEvent(this.instanceId, 'info', 'reply_fallback_to_push', { trace, chatId })
        const pushed = await this.queuePush(
          chatId, replyText, chatTypeNorm, `reply:${trace}`, trace,
        )
        if (!pushed) {
          this.counters.totalError++
          throw new Error(
            `[WecomBot:${this.instanceId}] Both replyToChat and queuePush failed for chat ${chatId} ` +
            `(trace=${trace})`
          )
        }
      },

      ...(streaming ? { streaming } : {}),
    }

    // Dispatch boundary — visible in logs so "did the message actually reach
    // the agent runtime?" is answerable without diving into dispatch-inbound.
    this.counters.totalDispatched++
    logEvent(this.instanceId, 'info', 'inbound_dispatch_begin', {
      trace,
      chatId,
      hasStream: canStream,
    })
    try {
      this.inboundHandler(inbound, reply)
      logEvent(this.instanceId, 'info', 'inbound_dispatch_handed_off', {
        trace,
        chatId,
        elapsedMs: Date.now() - inboundReceivedAt,
      })
    } catch (err) {
      this.counters.totalError++
      logEvent(this.instanceId, 'error', 'inbound_dispatch_threw', {
        trace,
        chatId,
        cat: 'internal',
        err: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }

  /** Create a stream session and register it for cleanup on WS close. */
  private createTrackedStreamSession(
    reqId: string,
    chatId: string,
    chatType: 'direct' | 'group',
    trace: string,
  ): WecomStreamSession {
    const session = new WecomStreamSession(this, reqId, chatId, chatType, this.instanceId, trace)
    this.activeStreamSessions.add(session)
    session.onDispose = () => this.activeStreamSessions.delete(session)
    return session
  }

  /** Download and collect media from a message fragment (top-level or quote). */
  private async collectMedia(
    fragment: any,
    fragmentMsgType: string,
    attachments: InboundAttachment[],
    images: ImageAttachment[]
  ): Promise<void> {
    if (fragmentMsgType === 'image' && fragment.image?.url && fragment.image?.aeskey) {
      const result = await downloadAndPrepareImage(fragment.image.url, fragment.image.aeskey, this.instanceId)
      if (result) {
        attachments.push(result.attachment)
        images.push(result.image)
      }
    } else if (fragmentMsgType === 'file' && fragment.file?.url && fragment.file?.aeskey) {
      try {
        const filename = fragment.file.filename || `file_${Date.now()}`
        const localPath = await downloadAndDecrypt(
          fragment.file.url, fragment.file.aeskey, filename, this.instanceId
        )
        attachments.push({ type: 'file', filename, localPath })
      } catch (err) {
        this.counters.totalError++
        logEvent(this.instanceId, 'error', 'media_download_failed', {
          mediaType: 'file',
          cat: 'network',
          err: err instanceof Error ? err.message : String(err),
        })
      }
    } else if (fragmentMsgType === 'video' && fragment.video?.url && fragment.video?.aeskey) {
      try {
        const filename = `video_${Date.now()}.mp4`
        const localPath = await downloadAndDecrypt(
          fragment.video.url, fragment.video.aeskey, filename, this.instanceId
        )
        attachments.push({ type: 'video', filename, localPath })
      } catch (err) {
        this.counters.totalError++
        logEvent(this.instanceId, 'error', 'media_download_failed', {
          mediaType: 'video',
          cat: 'network',
          err: err instanceof Error ? err.message : String(err),
        })
      }
    } else if (fragmentMsgType === 'mixed' && fragment.mixed?.msg_item) {
      const items: any[] = fragment.mixed.msg_item
      for (const item of items) {
        if (item.msgtype === 'image' && item.image?.url && item.image?.aeskey) {
          const result = await downloadAndPrepareImage(item.image.url, item.image.aeskey, this.instanceId)
          if (result) {
            attachments.push(result.attachment)
            images.push(result.image)
          }
        }
      }
    }
  }

  private extractText(body: any): string {
    const mainText = this.extractTextFromFragment(body)

    // Append quoted message context so the AI knows what was referenced
    if (body.quote) {
      const quoteText = this.extractTextFromFragment(body.quote)
      if (quoteText) {
        return mainText
          ? `${mainText}\n\n[Quoted message: ${quoteText}]`
          : `[Quoted message: ${quoteText}]`
      }
    }

    return mainText
  }

  /** Extract human-readable text from a single message fragment (body or quote). */
  private extractTextFromFragment(fragment: any): string {
    switch (fragment.msgtype) {
      case 'text': return fragment.text?.content ?? ''
      case 'image': return '(image)'
      case 'voice': return '(voice message)'
      case 'file': return `(file: ${fragment.file?.filename ?? 'unknown'})`
      case 'video': return '(video)'
      case 'link': return `(link: ${fragment.link?.title ?? fragment.link?.url ?? ''})`
      case 'mixed': {
        // Extract and join all text items from the mixed message
        const items: any[] = fragment.mixed?.msg_item ?? []
        const textParts = items
          .filter((item: any) => item.msgtype === 'text')
          .map((item: any) => (item.text?.content ?? '').trim())
          .filter(Boolean)
        return textParts.length > 0 ? textParts.join(' ') : '(mixed media)'
      }
      default: return `(${fragment.msgtype ?? 'unknown message type'})`
    }
  }

  // ── Heartbeat + Liveness ──────────────────────────────────────

  /**
   * Send a heartbeat ping every HEARTBEAT_INTERVAL_MS. After each ping, arm a
   * liveness check: if no inbound traffic at all (including pong, message, ack)
   * arrives within WS_LIVENESS_TIMEOUT_MS, the WS is treated as a zombie and
   * actively torn down. ws.on('close') will then schedule reconnect.
   *
   * This fixes the "TCP half-open" scenario where ping writes succeed (OS buffer)
   * but the peer has gone away — without this check, the user sees "messages not
   * arriving" with no log signal until the kernel finally times out the socket.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat()
    if (this.livenessTimer) { clearTimeout(this.livenessTimer); this.livenessTimer = null }
    this.heartbeatTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
      const pingReqId = generateReqId('ping')
      try {
        this.ws.send(JSON.stringify({
          cmd: 'ping',
          headers: { req_id: pingReqId },
        }))
        this.lastPingSentAt = Date.now()
      } catch (err) {
        this.counters.totalError++
        logEvent(this.instanceId, 'warn', 'heartbeat_send_failed', {
          cat: 'network',
          err: err instanceof Error ? err.message : String(err),
        })
        return
      }

      // Arm the liveness check. Replace any prior pending timer so we always
      // measure from the most recent ping.
      if (this.livenessTimer) clearTimeout(this.livenessTimer)
      this.livenessTimer = setTimeout(() => {
        this.livenessTimer = null
        // If anything inbound arrived after the ping was sent, the link is alive.
        if (this.lastWsActivityAt >= this.lastPingSentAt) return
        // Zombie detected: tear down and reconnect.
        this.counters.totalLivenessReconnect++
        logEvent(this.instanceId, 'warn', 'liveness_zombie_detected', {
          silenceMs: Date.now() - this.lastWsActivityAt,
          timeoutMs: WS_LIVENESS_TIMEOUT_MS,
          cat: 'network',
        })
        this.authenticated = false
        this.activeStreamSessions.forEach(s => s.markStreamBroken('liveness zombie'))
        // destroySocket fires no 'close' event, so schedule reconnect inline.
        this.destroySocket()
        if (this.active) this.scheduleReconnect()
      }, WS_LIVENESS_TIMEOUT_MS)
    }, HEARTBEAT_INTERVAL_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null }
    if (this.livenessTimer) { clearTimeout(this.livenessTimer); this.livenessTimer = null }
  }

  // ── Reconnect ─────────────────────────────────────────────────

  private scheduleReconnect(): void {
    if (!this.active) return
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logEvent(this.instanceId, 'error', 'reconnect_max_attempts', {
        max: MAX_RECONNECT_ATTEMPTS,
        cat: 'network',
      })
      return
    }
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_DELAY_MS
    )
    this.reconnectAttempts++
    logEvent(this.instanceId, 'info', 'reconnect_scheduled', {
      delayMs: delay,
      attempt: this.reconnectAttempts,
      maxAttempts: MAX_RECONNECT_ATTEMPTS,
    })
    this.reconnectTimer = setTimeout(() => {
      if (this.active) this.connect()
    }, delay)
  }

  // ── req_id Cleanup ────────────────────────────────────────────

  private cleanupExpiredReqIds(): void {
    const now = Date.now()
    let cleaned = 0
    for (const [chatId, entry] of this.reqIdMap) {
      if (now - entry.ts > REPLY_WINDOW_MS) {
        this.reqIdMap.delete(chatId)
        cleaned++
      }
    }
    if (cleaned > 0) {
      logEvent(this.instanceId, 'info', 'reqid_cleanup', {
        cleaned,
        remaining: this.reqIdMap.size,
      })
    }
    // Also prune stale rolling-window entries from frequency tracker — long-idle
    // chats accumulate empty slots otherwise.
    const cutoff = now - FREQ_WINDOW_MS
    for (const [chatId, timestamps] of this.sendTimestampsByChat) {
      if (timestamps.length > 0 && timestamps[timestamps.length - 1] < cutoff) {
        this.sendTimestampsByChat.delete(chatId)
      }
    }
  }
}
