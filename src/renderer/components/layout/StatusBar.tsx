/**
 * StatusBar — Compact bottom bar showing contextual information.
 *
 * Left: Context — total tokens, usage %, streaming speed (t/s)
 * Right: System resources — CPU %, Memory usage, Automation status
 *
 * Uses theme tokens only, no hardcoded colors.
 * Height: 24px (compact, VSCode-style).
 */

import { useMemo } from 'react'
import { useTranslation } from '../../i18n'
import { useChatStore } from '../../stores/chat.store'
import { usePerfStore } from '../../stores/perf.store'
import { useAppsStore } from '../../stores/apps.store'
import { useAppStore } from '../../stores/app.store'
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
  const currentConversation = useChatStore(s => s.getCurrentConversation())
  const tokenUsage = useMemo(() => {
    if (!currentConversation?.messages) return null
    return getLastTokenUsage(currentConversation.messages)
  }, [currentConversation?.messages])

  const contextInfo = useMemo(() => {
    if (!tokenUsage) return null

    const contextUsed = tokenUsage.inputTokens + tokenUsage.cacheReadTokens + tokenUsage.cacheCreationTokens
    const contextWindow = tokenUsage.contextWindow > 0 ? tokenUsage.contextWindow : 200_000
    const usagePercent = Math.round((contextUsed / contextWindow) * 100)

    // Speed: outputTokens / duration — only available from last complete turn
    // tokenUsage doesn't carry duration, so derive from message timestamps
    let tokensPerSec: number | null = null
    const messages = currentConversation?.messages
    if (messages && tokenUsage.outputTokens > 0) {
      // Find the last assistant message with tokenUsage
      const lastAssistIdx = messages.findLastIndex(m => m.role === 'assistant' && m.tokenUsage)
      if (lastAssistIdx >= 0) {
        const lastAssistMsg = messages[lastAssistIdx]
        // Find the preceding user message that triggered this assistant response
        const prevUserIdx = findPrecedingUserMessage(messages, lastAssistIdx)
        if (prevUserIdx >= 0) {
          const start = new Date(messages[prevUserIdx].timestamp).getTime()
          const end = new Date(lastAssistMsg.timestamp).getTime()
          const durMs = end - start
          // Only calculate if duration is reasonable (> 100ms to avoid division by very small numbers)
          if (durMs > 100) {
            const durSec = durMs / 1000
            tokensPerSec = Math.round(tokenUsage.outputTokens / durSec)
          }
        }
      }
    }

    return { contextUsed, contextWindow, usagePercent, tokensPerSec }
  }, [tokenUsage, currentConversation?.messages])

  // --- System resources (right side) ---
  const snapshot = usePerfStore(s => s.latestSnapshot)
  const cpuPercent = snapshot?.cpu?.percentCPU ?? null
  const memoryBytes = snapshot?.memory?.rss ?? null

  return (
    <div
      className="fixed bottom-0 inset-x-0 h-6 flex items-center justify-between px-3 border-t border-border bg-background text-[11px] text-muted-foreground select-none z-40 safe-area-bottom"
      style={{ paddingBottom: 'max(0px, var(--sab))' }}
    >
      {/* Left: Context */}
      <div className="flex items-center gap-3 min-w-0">
        {contextInfo ? (
          <>
            <span className="font-medium text-foreground/80">{t('Context')}</span>
            <span>{formatTokenCount(contextInfo.contextUsed)} tokens</span>
            <span>{contextInfo.usagePercent}% {t('used')}</span>
            {contextInfo.tokensPerSec !== null && (
              <span>{contextInfo.tokensPerSec} t/s</span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground/50">{t('Context')}</span>
        )}
      </div>

      {/* Right: Resources + Automation */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {cpuPercent !== null && (
          <span className="hidden sm:inline">
            CPU {Math.round(cpuPercent)}%
          </span>
        )}
        {memoryBytes !== null && (
          <span className="hidden sm:inline">
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
              waitingApp ? 'bg-orange-400' : runningCount > 0 ? 'bg-green-500/70' : 'bg-muted-foreground/30'
            }`} />
            {(waitingApp || runningCount > 0) && (
              <span className="hidden sm:inline">
                {waitingApp ? waitingApp.spec.name : runningCount}
              </span>
            )}
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
