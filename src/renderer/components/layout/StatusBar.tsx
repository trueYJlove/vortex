/**
 * StatusBar — Compact bottom bar showing contextual information.
 *
 * Left: Context — total tokens, usage %, streaming speed (t/s)
 * Right: System resources — CPU %, Memory usage, Automation status
 *
 * Uses theme tokens only, no hardcoded colors.
 * Height: 24px (compact, VSCode-style).
 */

import { useMemo, useState, useEffect, useRef } from 'react'
import { Command } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { useChatStore } from '../../stores/chat.store'
import { usePerfStore } from '../../stores/perf.store'
import { useAppsStore } from '../../stores/apps.store'
import { useAppStore } from '../../stores/app.store'
import { useCommandPanelStore } from '../../stores/command-panel.store'
import type { Message } from '../../types'

/** Format token count: 1234 → "1,234", 12345 → "12.3K" */
function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

/** Format bytes to human-readable: bytes → "1.2 GB" / "340 MB" */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`
}

/** Get the last assistant message with tokenUsage from a conversation */
function getLastTokenUsage(messages: Message[]): Message['tokenUsage'] | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role === 'assistant' && msg.tokenUsage) return msg.tokenUsage
  }
  return null
}

export function StatusBar() {
  const { t } = useTranslation()
  const { setView } = useAppStore()
  const { apps } = useAppsStore()

  // --- Automation status (right side) ---
  const automationApps = useMemo(() => apps.filter(a => a.spec.type === 'automation'), [apps])
  const runningCount = useMemo(
    () => automationApps.filter(a => a.status === 'active' || a.status === 'error').length,
    [automationApps]
  )
  const waitingApp = useMemo(
    () => automationApps.find(a => a.status === 'waiting_user'),
    [automationApps]
  )

  // --- Context (left side) ---
  // Real-time streaming token usage (updated during generation)
  const streamingTokenUsage = useChatStore(s => {
    const session = s.getCurrentSession()
    return session?.streamingTokenUsage ?? null
  })

  // Timestamps for calculating TTFT and t/s
  const messageSentTime = useChatStore(s => {
    const session = s.getCurrentSession()
    return session?.messageSentTime ?? null
  })
  const firstTokenTime = useChatStore(s => {
    const session = s.getCurrentSession()
    return session?.firstTokenTime ?? null
  })

  // Is currently generating (for real-time updates)
  const isGenerating = useChatStore(s => {
    const session = s.getCurrentSession()
    return session?.isGenerating ?? false
  })

  // Last completed conversation's token usage (for context window info)
  const currentConversation = useChatStore(s => s.getCurrentConversation())
  const lastTokenUsage = useMemo(() => {
    if (!currentConversation?.messages) return null
    return getLastTokenUsage(currentConversation.messages)
  }, [currentConversation?.messages])

  // Use streaming data when available, fallback to last completed
  const tokenUsage = streamingTokenUsage ?? lastTokenUsage

  // Real-time clock for calculating t/s during streaming
  const [currentTime, setCurrentTime] = useState(Date.now())
  const lastTokensPerSecRef = useRef<number | null>(null)

  useEffect(() => {
    if (!isGenerating) return
    const interval = setInterval(() => setCurrentTime(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [isGenerating])

  const contextInfo = useMemo(() => {
    if (!tokenUsage) return null

    const contextUsed = tokenUsage.inputTokens + tokenUsage.cacheReadTokens + tokenUsage.cacheCreationTokens
    // For streaming, we don't have contextWindow in SingleCallUsage, use default
    const contextWindow = 200_000
    const usagePercent = Math.round((contextUsed / contextWindow) * 100)

    // Calculate TTFT (Time to First Token) - only non-negative values, in seconds
    let ttftSec: number | null = null
    if (messageSentTime && firstTokenTime && firstTokenTime >= messageSentTime) {
      ttftSec = (firstTokenTime - messageSentTime) / 1000
    } else if (isGenerating && messageSentTime && !firstTokenTime) {
      // Still waiting for first token - calculate elapsed time
      const elapsed = currentTime - messageSentTime
      if (elapsed > 0) {
        ttftSec = elapsed / 1000
      }
    }

    // Calculate t/s - simplified logic
    let tokensPerSec: number | null = null
    
    // During streaming: calculate if we have first token and output tokens
    if (isGenerating && firstTokenTime && tokenUsage.outputTokens > 0) {
      const elapsedMs = currentTime - firstTokenTime
      if (elapsedMs >= 500) { // Wait at least 500ms
        tokensPerSec = Math.round(tokenUsage.outputTokens / (elapsedMs / 1000))
        lastTokensPerSecRef.current = tokensPerSec
      }
    }
    // After streaming ends: show final speed
    else if (!isGenerating && tokenUsage.outputTokens > 0) {
      // Use last calculated speed if available, otherwise calculate from last token usage
      if (lastTokensPerSecRef.current !== null) {
        tokensPerSec = lastTokensPerSecRef.current
      } else if (firstTokenTime) {
        const elapsedMs = Date.now() - firstTokenTime
        if (elapsedMs > 100) {
          tokensPerSec = Math.round(tokenUsage.outputTokens / (elapsedMs / 1000))
        }
      }
    }

    return { contextUsed, contextWindow, usagePercent, ttftSec, tokensPerSec }
  }, [tokenUsage, isGenerating, messageSentTime, firstTokenTime, currentTime])

  // --- System resources (right side) ---
  const snapshot = usePerfStore(s => s.latestSnapshot)
  const cpuPercent = snapshot?.cpu?.percentCPU ?? null
  const memoryBytes = snapshot?.memory?.rss ?? null
  const openCommandPanel = useCommandPanelStore((s) => s.open)

  return (
    <div
      className="fixed bottom-0 inset-x-0 h-6 hidden sm:flex items-center justify-between px-3 border-t border-border bg-background text-[11px] text-muted-foreground select-none z-40"
      style={{ bottom: 'var(--sab, 0px)' }}
    >
      {/* Left: Context */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 overflow-hidden">
        {contextInfo ? (
          <>
            <span className="font-medium text-foreground/80 hidden sm:inline">{t('Context')}</span>
            <span className="truncate">{formatTokenCount(contextInfo.contextUsed)} tokens</span>
            <span>{contextInfo.usagePercent}% {t('used')}</span>
            {contextInfo.ttftSec !== null && (
              <span>{contextInfo.ttftSec.toFixed(1)}s {t('TTFT')}</span>
            )}
            {contextInfo.tokensPerSec !== null && (
              <span>{contextInfo.tokensPerSec} t/s</span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground/50">{t('Context')}</span>
        )}
      </div>

      {/* Right: Resources + Automation + Command Palette */}
      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        <button
          onClick={openCommandPanel}
          className="flex items-center gap-1 hover:bg-secondary/50 px-1 rounded transition-colors"
          title={t('Command Palette (Ctrl+Shift+P)')}
          aria-label={t('Command Palette')}
        >
          <Command size={12} className="text-muted-foreground" />
          <span className="hidden lg:inline text-muted-foreground/70">{t('Commands')}</span>
        </button>
        {cpuPercent !== null && (
          <span className="hidden sm:inline">
            CPU {Math.round(cpuPercent)}%
          </span>
        )}
        {memoryBytes !== null && (
          <span className="hidden md:inline">
            {t('Memory')} {formatBytes(memoryBytes)}
          </span>
        )}
        {/* Automation status */}
        {automationApps.length > 0 && (
          <button
            onClick={() => setView('apps')}
            className="flex items-center gap-1 hover:bg-secondary/50 px-1 rounded transition-colors"
            title={waitingApp
              ? `${waitingApp.spec.name} — ${t('needs your input')}`
              : runningCount > 0
                ? t('{{count}} apps running', { count: runningCount })
                : t('Digital human')
            }
          >
            <span className={`w-1.5 h-1.5 rounded-full ${
              waitingApp ? 'bg-orange-400 animate-pulse' : runningCount > 0 ? 'bg-green-500/70 animate-pulse' : 'bg-muted-foreground/30'
            }`} />
            <span>
              {waitingApp ? waitingApp.spec.name : runningCount > 0 ? runningCount : t('Apps')}
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

/** Find the index of the nearest preceding user message before `endIdx` */
function findPrecedingUserMessage(messages: Message[], endIdx: number): number {
  for (let i = endIdx - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return i
  }
  return -1
}
