/**
 * MessageRow - Renders a single persisted message with its thought process.
 *
 * Pure presentational component — no store coupling. Handles both inline
 * thoughts (Thought[]) and separated/lazy thoughts (v2 format with ThoughtsSummary).
 *
 * Shared across: MessageList (main chat), AppChatView, ImChatView, SessionDetailView.
 */

import { memo } from 'react'
import { MessageItem, MessageAvatar, MessageHeader } from './MessageItem'
import { CollapsedThoughtProcess, LazyCollapsedThoughtProcess } from './CollapsedThoughtProcess'
import { TeamSnapshotPanel } from './TeamPanel'
import { InjectionAnnotation } from './InjectionAnnotation'
import type { Message, Thought } from '../../types'

export interface MessageRowProps {
  /** The message to render */
  message: Message

  /** Previous assistant message's cumulative cost (for token usage delta display) */
  previousCost?: number

  /** Whether the thought panel should start expanded (e.g., user previously opened it) */
  defaultThoughtsExpanded?: boolean

  /** Whether the thought panel should start in full-height mode. Useful for debugging views. */
  defaultThoughtsMaximized?: boolean

  /** Callback to lazily load separated thoughts (v2 format).
   *  Called with messageId. If not provided, LazyCollapsedThoughtProcess
   *  falls back to a no-op loader (graceful degradation). */
  onLoadThoughts?: (messageId: string) => Promise<Thought[]>

  /** Hide the "View live feed" button in BrowserTaskCard.
   *  Set true in automation app contexts where Canvas/BrowserView is unavailable. */
  hideBrowserViewButton?: boolean

  /** Mid-turn injection messages associated with this assistant message.
   *  Rendered as a permanent annotation at the bottom of the assistant bubble. */
  injectionMessages?: Message[]

  /** Additional className for the outer wrapper (e.g., width constraints from Virtuoso) */
  className?: string
}

export const MessageRow = memo(function MessageRow({
  message,
  previousCost,
  defaultThoughtsExpanded = false,
  defaultThoughtsMaximized = false,
  onLoadThoughts,
  hideBrowserViewButton = false,
  injectionMessages,
  className = '',
}: MessageRowProps) {
  const hasInlineThoughts = Array.isArray(message.thoughts) && message.thoughts.length > 0
  const hasSeparatedThoughts = message.thoughts === null && !!message.thoughtsSummary

  // Assistant messages with thoughts: show collapsed thoughts above message bubble.
  // Avatar + name/time header sit at the same level so the thinking panel and reply
  // bubble stay left-aligned under the header.
  if (message.role === 'assistant' && (hasInlineThoughts || hasSeparatedThoughts)) {
    return (
      <div className={`flex justify-start items-start gap-2 pb-4 ${className}`}>
        <MessageAvatar isUser={false} />
        <div className="w-[85%]">
          <MessageHeader isUser={false} timestamp={message.timestamp} />
          {hasInlineThoughts ? (
            <CollapsedThoughtProcess
              thoughts={message.thoughts as Thought[]}
              defaultExpanded={defaultThoughtsExpanded}
              defaultMaximized={defaultThoughtsMaximized}
            />
          ) : (
            <LazyCollapsedThoughtProcess
              thoughtsSummary={message.thoughtsSummary!}
              onLoadThoughts={
                onLoadThoughts
                  ? () => onLoadThoughts(message.id)
                  : () => Promise.resolve([])
              }
            />
          )}

          {/* Agent Team snapshot — shows completed team collaboration for this turn.
              Derived from thoughts — automatically persisted and available in history. */}
          {hasInlineThoughts && (
            <TeamSnapshotPanel thoughts={message.thoughts as Thought[]} />
          )}

          {/* Only render bubble if there is text content.
              Assistant events with only tool_use/thinking blocks have empty content —
              rendering MessageItem for those would produce empty visible bubbles. */}
          {message.content && (
            <MessageItem
              message={message}
              previousCost={previousCost}
              hideThoughts
              isInContainer
              hideAvatar
              hideBrowserViewButton={hideBrowserViewButton}
            />
          )}

          {/* Injection annotation — permanently shows mid-turn user messages */}
          {injectionMessages && injectionMessages.length > 0 && (
            <InjectionAnnotation messages={injectionMessages} />
          )}
        </div>
      </div>
    )
  }

  // Regular messages (user, or assistant without thoughts)
  // Avatar + header sit at the same level, bubble below.
  const hasInjections = injectionMessages && injectionMessages.length > 0
  if (message.role === 'assistant' && hasInjections) {
    return (
      <div className={`pb-4 ${className}`}>
        <div className="flex justify-start items-start gap-2">
          <MessageAvatar isUser={false} />
          <div className="w-[85%]">
            <MessageHeader isUser={false} timestamp={message.timestamp} />
            <MessageItem
              message={message}
              previousCost={previousCost}
              hideBrowserViewButton={hideBrowserViewButton}
              isInContainer
              hideAvatar
            />
            <InjectionAnnotation messages={injectionMessages} />
          </div>
        </div>
      </div>
    )
  }

  // For regular user/assistant messages without thoughts: render avatar+header
  // above the bubble. MessageItem renders only the bubble (hideAvatar + isInContainer
  // suppress its own avatar/wrapper) so the row controls alignment consistently.
  return (
    <div className={`pb-4 ${className}`}>
      <div className={`flex items-start gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
        {message.role === 'user' && (
          <div className="w-[85%] flex flex-col items-end">
            <MessageHeader isUser={true} timestamp={message.timestamp} />
            <MessageItem
              message={message}
              previousCost={previousCost}
              hideBrowserViewButton={hideBrowserViewButton}
              isInContainer
              hideAvatar
            />
          </div>
        )}
        {message.role === 'user' && <MessageAvatar isUser={true} />}
        {message.role === 'assistant' && <MessageAvatar isUser={false} />}
        {message.role === 'assistant' && (
          <div className="w-[85%]">
            <MessageHeader isUser={false} timestamp={message.timestamp} />
            <MessageItem
              message={message}
              previousCost={previousCost}
              hideBrowserViewButton={hideBrowserViewButton}
              isInContainer
              hideAvatar
            />
          </div>
        )}
      </div>
    </div>
  )
})
