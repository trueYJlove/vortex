/**
 * StreamingSection - Renders the real-time streaming content area.
 *
 * Pure presentational component — no store coupling. Composes
 * ThoughtProcess + BrowserTaskCard + StreamingBubble + AskUserQuestionCard.
 *
 * Shared across: MessageList (main chat), AppChatView, ImChatView.
 */

import { ThoughtProcess } from './ThoughtProcess'
import { StreamingBubble } from './StreamingBubble'
import { BrowserTaskCard } from '../tool/BrowserTaskCard'
import { AskUserQuestionCard } from './AskUserQuestionCard'
import type { Thought, PendingQuestion } from '../../types'
import type { BrowserToolCall } from './useBrowserToolCalls'

export interface StreamingSectionProps {
  /** Accumulated streaming text content */
  streamingContent: string

  /** Whether tokens are actively arriving */
  isStreaming: boolean

  /** Real-time thought array */
  thoughts: Thought[]

  /** Whether the agent is in a thinking phase */
  isThinking: boolean

  /** Increments on each new text block (for StreamingBubble reset) */
  textBlockVersion?: number

  /** Browser tool calls extracted from streaming thoughts */
  browserToolCalls?: BrowserToolCall[]

  /** Whether to show the "View live feed" button on BrowserTaskCard.
   *  Set false in automation app contexts where Canvas/BrowserView is unavailable. */
  showBrowserViewButton?: boolean

  /** Active question from AskUserQuestion tool */
  pendingQuestion?: PendingQuestion | null

  /** Callback when user answers a pending question */
  onAnswerQuestion?: (answers: Record<string, string>) => void

  /** Additional className for the outer wrapper */
  className?: string
}

export function StreamingSection({
  streamingContent,
  isStreaming,
  thoughts,
  isThinking,
  textBlockVersion = 0,
  browserToolCalls = [],
  showBrowserViewButton = true,
  pendingQuestion,
  onAnswerQuestion,
  className = '',
}: StreamingSectionProps) {
  return (
    <div className={`flex justify-start animate-fade-in pb-4 ${className}`}>
      <div className="w-[85%] relative">
        {/* Real-time thought process */}
        {(thoughts.length > 0 || isThinking) && (
          <ThoughtProcess thoughts={thoughts} isThinking={isThinking} />
        )}

        {/* Real-time browser task card */}
        {browserToolCalls.length > 0 && (
          <div className="mb-4">
            <BrowserTaskCard
              browserToolCalls={browserToolCalls}
              isActive={isThinking}
              showViewButton={showBrowserViewButton}
            />
          </div>
        )}

        {/* Streaming text content with scroll animation */}
        <StreamingBubble
          content={streamingContent}
          isStreaming={isStreaming}
          thoughts={thoughts}
          textBlockVersion={textBlockVersion}
        />

        {/* AskUserQuestion card — shown when AI needs user input */}
        {pendingQuestion && onAnswerQuestion && (
          <AskUserQuestionCard
            pendingQuestion={pendingQuestion}
            onAnswer={onAnswerQuestion}
          />
        )}
      </div>
    </div>
  )
}
