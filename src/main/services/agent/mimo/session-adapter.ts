import { randomUUID } from 'crypto'
import { startMimoServer, type MimoServerHandle } from './transport'
import { MimoEventNormalizer } from './event-normalizer'
import { getMimoInstalledSkills, getMimoSkillContent } from './skill-context'

interface AdapterOptions {
  spaceId?: string
  conversationId?: string
  resume?: string
}

export class MimoSession {
  private server: MimoServerHandle | null = null
  private sessionId: string | null = null
  private normalizer: MimoEventNormalizer | null = null
  private readonly instanceId: string
  private readonly opts: AdapterOptions
  private closed = false
  private notificationQueue: any[] = []
  private notificationWaiters: Array<() => void> = []
  private exitListeners = new Set<(error?: Error) => void>()
  private currentAbortController: AbortController | null = null
  private eventAbortController: AbortController | null = null
  private sseEventsReceived = false
  private turnFinished = false
  private installedSkills: string[] = []

  readonly query: {
    transport: {
      isReady: () => boolean
      ready: boolean
      onExit?: (cb: (error?: Error) => void) => () => void
    }
    supportedCommands: () => Promise<unknown[]>
  }

  private constructor(instanceId: string, opts: AdapterOptions) {
    this.instanceId = instanceId
    this.opts = opts

    const isReady = (): boolean => !this.closed && this.server !== null && this.sessionId !== null

    this.query = {
      transport: {
        isReady,
        get ready() { return isReady() },
        onExit: (cb) => {
          this.exitListeners.add(cb)
          return () => this.exitListeners.delete(cb)
        },
      },
      supportedCommands: async () => this.installedSkills.map(name => ({ name, type: 'skill' })),
    }
  }

  static async create(sdkOptions: Record<string, any>): Promise<MimoSession> {
    const instanceId = randomUUID()
    const adapter = new MimoSession(instanceId, {
      spaceId: sdkOptions.spaceId,
      conversationId: sdkOptions.conversationId,
      resume: sdkOptions.resume,
    })
    await adapter.start(sdkOptions)
    return adapter
  }

  private async start(sdkOptions: Record<string, any>): Promise<void> {
    this.installedSkills = getMimoInstalledSkills()
    const modelId = sdkOptions.model ?? 'mimo'

    // Build server config: system prompt + command registration
    const config: Record<string, any> = {}

    config.agent = {
      general: {
        prompt: [
          'You are a helpful AI coding assistant integrated into Halo.',
          '',
          '## Skills',
          'You have access to skills invoked via slash commands (e.g., /brainstorming).',
          'When a user invokes a skill, its instructions are provided in the message.',
          'Follow those instructions carefully to complete the user\'s request.',
          'You have access to tools: Bash, Read, Write, Edit, Grep, Glob, TodoWrite.',
          'Use them as instructed by the skill content.',
          '',
          '## Task Planning',
          'For multi-step tasks, use the TodoWrite tool to create a task plan before starting work.',
          'This helps the user track your progress. Update todo statuses as you complete each step.',
        ].join('\n'),
      },
    }

    // Register installed skills as MiMo commands
    if (this.installedSkills.length > 0) {
      const commandEntries: Record<string, any> = {}
      for (const skillName of this.installedSkills) {
        const skillContent = getMimoSkillContent(skillName)
        if (skillContent) {
          commandEntries[skillName] = {
            template: skillContent,
            description: `Skill: ${skillName}`,
          }
        }
      }
      if (Object.keys(commandEntries).length > 0) {
        config.command = commandEntries
      }
    }

    // Start server with system prompt + commands
    const server = await startMimoServer({
      signal: sdkOptions.signal,
      config,
    })
    this.server = server

    const sessionInfo = await server.client.session.create({
      body: {},
    })
    this.sessionId = sessionInfo.data?.id ?? null

    if (!this.sessionId) {
      throw new Error('[MiMo] Failed to create session: no session ID returned')
    }

    // Query providers and enable reasoning if needed
    try {
      const providersResp = await server.client.config.providers()
      const providers = providersResp.data as any
      if (providers) {
        for (const [provId, provConfig] of Object.entries(providers) as [string, any][]) {
          for (const [mId, modelCfg] of Object.entries(provConfig?.models ?? {}) as [string, any][]) {
            if ((mId === modelId || modelCfg?.id === modelId) && !modelCfg?.reasoning) {
              console.log(`[MiMo] Enabling reasoning for ${provId}/${mId}`)
              await server.client.config.update({
                body: {
                  provider: {
                    [provId]: {
                      models: { [mId]: { reasoning: true } },
                    },
                  },
                },
              }).catch((e) => console.log(`[MiMo] config.update failed:`, e))
            }
          }
        }
      }
    } catch (err) {
      console.log(`[MiMo] Could not query/update provider config:`, err)
    }

    this.normalizer = new MimoEventNormalizer({
      sessionId: this.sessionId,
      model: modelId,
      mcpServers: sdkOptions.mcpServers ?? [],
      slashCommands: this.installedSkills,
      skills: this.installedSkills,
    })

    this.subscribeToEvents()
  }

  private subscribeToEvents(): void {
    if (!this.server) return

    const abortController = new AbortController()
    this.eventAbortController = abortController

    void this.server.client.event.subscribe({}, {
      signal: abortController.signal,
      sseMaxRetryAttempts: 0,
    }).then(({ stream }) => this.consumeEventStream(stream, abortController.signal))
      .catch((err) => {
        if (!abortController.signal.aborted) {
          console.log('[MiMo] event subscription failed:', err)
        }
      })
  }

  private async consumeEventStream(stream: AsyncIterable<any>, signal: AbortSignal): Promise<void> {
    try {
      for await (const event of stream) {
        if (signal.aborted || this.closed) return
        this.handleSSEEvent(event)
      }
    } catch (err) {
      if (!signal.aborted) {
        console.log('[MiMo] event stream stopped:', err)
      }
    }
  }

  private handleSSEEvent(event: { type: string; properties: Record<string, any> }): void {
    if (!this.normalizer) return

    if (event.type === 'session.idle') {
      this.finishTurn()
      return
    }

    if (event.type === 'session.error') {
      const errorMsg = event.properties?.error?.message ?? 'Session error'
      this.pushNotification(
        this.normalizer.createResult(true, errorMsg),
      )
      this.turnFinished = true
      return
    }

    this.sseEventsReceived = true

    if (event.type === 'message.updated') {
      const info = event.properties?.info
      if (info?.role === 'assistant') {
        const frames = this.normalizer.normalize(event)
        for (const frame of frames) this.pushNotification(frame)
      }
    } else if (event.type === 'message.part.updated' || event.type === 'message.part.delta') {
      const frames = this.normalizer.normalize(event)
      for (const frame of frames) this.pushNotification(frame)
    }
  }

  private finishTurn(errorMessage?: string): void {
    if (!this.normalizer || this.turnFinished) return
    this.turnFinished = true

    const closeFrames = this.normalizer.closeAllOpenBlocks()
    for (const frame of closeFrames) this.pushNotification(frame)

    const msgDeltaStop = this.normalizer.createMessageDeltaAndStop()
    for (const frame of msgDeltaStop) this.pushNotification(frame)
    this.pushNotification(this.normalizer.createResult(!!errorMessage, errorMessage))
  }

  private pushNotification(frame: any): void {
    this.notificationQueue.push(frame)
    this.wakeNotificationWaiters()
  }

  private wakeNotificationWaiters(): void {
    const waiters = [...this.notificationWaiters]
    this.notificationWaiters = []
    for (const w of waiters) w()
  }

  send(message: any): void {
    if (this.closed) throw new Error('[MiMo] session is closed')
    if (!this.server || !this.sessionId) throw new Error('[MiMo] session not initialized')

    const text = typeof message === 'string' ? message : message?.text ?? JSON.stringify(message)

    this.normalizer?.reset()
    this.sseEventsReceived = false
    this.turnFinished = false

    const abortController = new AbortController()
    this.currentAbortController = abortController

    void this.sendPrompt(text, abortController.signal).catch((err) => {
      if (abortController.signal.aborted) return
      console.error(`[MiMo] prompt failed:`, err)
      this.finishTurn(err instanceof Error ? err.message : String(err))
    })
  }

  private async sendPrompt(text: string, signal: AbortSignal): Promise<void> {
    if (!this.server || !this.sessionId) return

    // Fallback: if MiMo's command system didn't inject skill content,
    // inject it into the user message text directly.
    let effectiveText = text
    const slashMatch = text.match(/^\/(\S+)(.*)$/s)
    if (slashMatch) {
      const skillName = slashMatch[1]
      const userArgs = slashMatch[2].trim()
      const skillContent = getMimoSkillContent(skillName)
      if (skillContent) {
        effectiveText = `<skill name="${skillName}">\n${skillContent}\n</skill>\n\nThe user invoked the /${skillName} skill. Follow the instructions above to complete the user's request.`
        if (userArgs) {
          effectiveText += `\n\nUser input: ${userArgs}`
        }
        console.log(`[MiMo] Injecting skill content for /${skillName} (${skillContent.length} chars)`)
      }
    }

    const body: Record<string, any> = {
      parts: [{ type: 'text', text: effectiveText }],
    }

    const response = await fetch(
      `${this.server.url}/session/${this.sessionId}/message`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      },
    )

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      if (response.status === 409) {
        throw new Error('[MiMo] session is busy, please wait for the current turn to complete')
      }
      throw new Error(`[MiMo] prompt failed: ${response.status} ${body}`)
    }

    const raw = await response.text()
    const trimmed = raw.trim()
    if (!trimmed) {
      throw new Error('[MiMo] empty response from prompt endpoint')
    }

    const result = JSON.parse(trimmed)
    console.log('[MiMo] prompt result:', JSON.stringify(result).substring(0, 500))

    if (!this.sseEventsReceived) {
      // Emit system.init so the consumer's onTurnInit fires
      this.pushNotification(this.normalizer!.createSystemInit())

      const assistantMsg = result?.info
      const parts = result?.parts ?? []

      if (assistantMsg?.role === 'assistant') {
        this.pushNotification({
          type: 'stream_event',
          event: {
            type: 'message_start',
            message: {
              id: assistantMsg.id ?? 'mimo-msg',
              type: 'message',
              role: 'assistant',
              content: [],
              model: assistantMsg.modelID ?? 'mimo',
              stop_reason: null,
              usage: { input_tokens: 0, output_tokens: 0 },
            },
          },
        })
      }

      for (const part of parts) {
        const frames = this.normalizer!.createCompletePartFrames(part)
        for (const frame of frames) this.pushNotification(frame)
      }

      if (assistantMsg?.tokens) {
        this.normalizer!['state'].tokenUsage = {
          input: assistantMsg.tokens.input ?? 0,
          output: assistantMsg.tokens.output ?? 0,
          reasoning: assistantMsg.tokens.reasoning ?? 0,
          cache: {
            read: assistantMsg.tokens.cache?.read ?? 0,
            write: assistantMsg.tokens.cache?.write ?? 0,
          },
        }
      }
    }

    this.finishTurn()
  }

  async *stream(): AsyncIterable<any> {
    while (!this.closed || this.notificationQueue.length > 0) {
      if (this.notificationQueue.length === 0) {
        await new Promise<void>((resolve) => {
          this.notificationWaiters.push(resolve)
          if (this.closed) resolve()
        })
        continue
      }
      const next = this.notificationQueue.shift()
      yield next
      if (next && next.type === 'result') return
    }
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true

    this.currentAbortController?.abort()
    this.currentAbortController = null

    if (this.eventAbortController) {
      this.eventAbortController.abort()
      this.eventAbortController = null
    }

    if (this.server) {
      try {
        if (this.sessionId) {
          await this.server.client.session.abort({
            path: { sessionID: this.sessionId },
          }).catch(() => {})
        }
      } catch { /* best-effort */ }

      this.server.close()
      this.server = null
    }

    this.wakeNotificationWaiters()
  }

  async interrupt(): Promise<void> {
    if (this.currentAbortController) {
      this.currentAbortController.abort()
      this.currentAbortController = null
    }
    if (this.server && this.sessionId) {
      try {
        await this.server.client.session.abort({
          path: { sessionID: this.sessionId },
        })
      } catch { /* best-effort */ }
    }
  }
}
