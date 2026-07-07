/**
 * StreamingBubble - Displays streaming content in a scrollable viewport.
 *
 * Extracted from MessageList.tsx for reuse across chat surfaces
 * (main conversation chat, App/digital-human chat, etc.).
 *
 * `content` (streamingContent) is cumulative — the SDK appends every text
 * delta from the start of generation. We render it verbatim inside a
 * max-height viewport that auto-scrolls to the bottom as new tokens arrive,
 * so long replies stay bounded and the latest text is always visible.
 */

import { useEffect, useRef } from 'react'
import { MarkdownRenderer } from './MarkdownRenderer'
import { useTranslation } from '../../i18n'
import type { Thought } from '../../types'

interface StreamingBubbleProps {
  content: string
  isStreaming: boolean
  thoughts: Thought[]
  textBlockVersion?: number
}

export function StreamingBubble({
  content,
  isStreaming,
  thoughts: _thoughts,
  textBlockVersion: _textBlockVersion = 0
}: StreamingBubbleProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const { t } = useTranslation()

  // Keep the latest content in view as tokens stream in.
  // The SDK pushes deltas every ~100ms; anchoring to scrollHeight keeps the
  // cursor visible without the height-measurement thrash that used to stall
  // the viewport (the previous JS-driven height control was the freeze root cause).
  useEffect(() => {
    const el = viewportRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [content])

  if (!content) return null

  return (
    <div className="rounded-2xl px-4 py-3 message-assistant message-working w-full overflow-hidden">
      {/* Working indicator */}
      <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-border/30 working-indicator-fade">
        <span className="text-xs text-muted-foreground/70">{t('Vortex is working')}</span>
      </div>

      {/* Bounded viewport: long replies scroll instead of stretching the bubble.
           `scrollbar-overlay` keeps the layout stable when the bar appears/disappears. */}
      <div ref={viewportRef} className="max-h-[400px] overflow-y-auto scrollbar-overlay">
        <div className="break-words leading-relaxed">
          <MarkdownRenderer content={content} mode="streaming" />
          {isStreaming && (
            <span className="inline-block w-0.5 h-5 ml-0.5 bg-primary streaming-cursor align-middle" />
          )}
          {!isStreaming && (
            <span className="waiting-dots ml-1 text-muted-foreground/60" />
          )}
        </div>
      </div>
    </div>
  )
}
