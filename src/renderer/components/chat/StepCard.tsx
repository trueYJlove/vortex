/**
 * StepCard - Displays a single FlowStep in the step view mode.
 *
 * Renders a card with header (icon, title, status, duration) and expandable
 * content area. Content rendering varies by step kind:
 * - thinking: italic text with expand/collapse for long content
 * - tool_call: JSON button + ToolResultViewer + SubAgentTimeline (for Task/Agent)
 * - error: ErrorContent
 * - system: muted text
 */

import { useState, useMemo, memo } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Braces,
  CheckCircle2,
  Loader2,
  Circle,
  AlertTriangle,
  Clock,
} from 'lucide-react'
import type { Thought } from '../../types'
import { useTranslation } from '../../i18n'
import { getThoughtIcon, getThoughtColor, truncateText } from './thought-utils'
import { ToolResultViewer } from './tool-result'
import { SubAgentTimeline } from './SubAgentTimeline'
import { ErrorContent } from './ErrorContent'
import type { FlowStep } from './thoughts-to-steps'

interface StepCardProps {
  step: FlowStep
  allThoughts?: Thought[]
  isLast: boolean
  isThinking?: boolean
}

// i18n static keys for extraction (DO NOT REMOVE)
// prettier-ignore
void function _i18nStepCardKeys(t: (k: string) => string) {
  t('Collapse'); t('Expand');
}

// ============================================
// Status badge component
// ============================================

function StatusBadge({ step }: { step: FlowStep }) {
  const { t } = useTranslation()

  switch (step.status) {
    case 'streaming':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-blue-400">
          <Loader2 size={11} className="animate-spin" />
        </span>
      )
    case 'running':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-blue-400">
          <Circle size={10} />
          <span>{t('Running')}</span>
        </span>
      )
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-green-400">
          <CheckCircle2 size={11} />
          <span>{t('Done')}</span>
        </span>
      )
    case 'error':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-amber-500">
          <AlertTriangle size={11} />
          <span>{t('Hint')}</span>
        </span>
      )
  }
}

// ============================================
// Duration display
// ============================================

function DurationDisplay({ duration }: { duration?: number }) {
  if (duration === undefined) return null
  const seconds = (duration / 1000).toFixed(1)
  return (
    <span className="hidden sm:inline text-xs text-muted-foreground/40">
      <Clock size={10} className="inline mr-0.5" />
      {seconds}s
    </span>
  )
}

// ============================================
// StepCard
// ============================================

/**
 * Custom memo comparator for StepCard.
 *
 * thoughtsToSteps() rebuilds every FlowStep object on each streaming chunk,
 * so shallow reference equality always fails and memo() is bypassed — every
 * mounted card re-renders on every chunk, which is the main source of step-view
 * jank. This comparator checks the semantic fields that actually affect render
 * output, so unchanged steps skip re-render even when the step object itself
 * is a new reference.
 */
function areStepCardPropsEqual(prev: StepCardProps, next: StepCardProps): boolean {
  if (prev.isLast !== next.isLast) return false
  if (prev.isThinking !== next.isThinking) return false
  // allThoughts is only passed for Task/Agent steps; reference changes on every
  // chunk, but those steps are rare and need fresh sub-agent data, so let them
  // re-render when the reference differs.
  if (prev.allThoughts !== next.allThoughts) return false

  const a = prev.step
  const b = next.step
  if (a.id !== b.id) return false
  if (a.status !== b.status) return false
  if (a.duration !== b.duration) return false
  if (a.toolResult !== b.toolResult) return false
  if (a.toolInput !== b.toolInput) return false
  if (a.taskProgress !== b.taskProgress) return false
  if (a.subtitle !== b.subtitle) return false
  if (a.thoughts.length !== b.thoughts.length) return false
  // Group boundaries: if first and last thought objects are the same, the
  // group content hasn't changed (thoughts are only ever appended to a group).
  if (a.thoughts[0] !== b.thoughts[0]) return false
  if (a.thoughts[a.thoughts.length - 1] !== b.thoughts[b.thoughts.length - 1]) return false
  return true
}

export const StepCard = memo(function StepCard({ step, allThoughts, isLast, isThinking }: StepCardProps) {
  const { t } = useTranslation()

  // Default expanded while streaming/running; collapsed when completed/error
  const defaultExpanded = step.status === 'streaming' || step.status === 'running'
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const [showRawJson, setShowRawJson] = useState(false)
  const [showResult, setShowResult] = useState(true)

  const color = getThoughtColor(
    step.kind === 'tool_call' ? 'tool_use' : step.kind,
    step.status === 'error'
  )

  // Compute mapping from step kinds to thought types for icon/color utils
  const thoughtTypeForIcon = step.kind === 'tool_call' ? 'tool_use' as const
    : step.kind === 'error' ? 'error' as const
    : step.kind === 'thinking' ? 'thinking' as const
    : step.kind === 'text' ? 'text' as const
    : step.kind === 'system' ? 'system' as const
    : 'tool_use' as const

  const Icon = getThoughtIcon(thoughtTypeForIcon, step.toolName)

  const isTaskOrAgent = step.kind === 'tool_call' && (step.toolName === 'Task' || step.toolName === 'Agent')
  const hasResult = step.kind === 'tool_call' && !!step.toolResult
  const hasInput = step.kind === 'tool_call' && !!step.toolInput && Object.keys(step.toolInput).length > 0

  // For thinking content: expand/collapse long text
  const [isContentExpanded, setIsContentExpanded] = useState(false)
  const maxPreviewLength = 150

  let displayContent = ''
  let needsTruncate = false

  if (step.kind === 'thinking') {
    displayContent = step.thoughts.map(t => t.content).join('\n') || ''
    needsTruncate = displayContent.length > maxPreviewLength
  } else if (step.kind === 'text') {
    displayContent = step.thoughts.map(t => t.content).join('\n') || ''
    needsTruncate = displayContent.length > maxPreviewLength
  } else if (step.kind === 'system') {
    displayContent = step.thoughts.map(t => t.content).join('\n') || ''
    needsTruncate = displayContent.length > maxPreviewLength
  } else if (step.kind === 'tool_call' && step.subtitle) {
    displayContent = step.subtitle
    needsTruncate = displayContent.length > maxPreviewLength
  }

  const truncatedContent = needsTruncate
    ? displayContent.substring(0, maxPreviewLength)
    : displayContent

  return (
    <div className="flex gap-3 group animate-fade-in">
      {/* Timeline line */}
      <div className="flex flex-col items-center">
        <div className={`
          w-7 h-7 rounded-full flex items-center justify-center shrink-0
          ${step.status === 'error'
            ? 'bg-amber-500/20'
            : step.status === 'streaming'
              ? 'bg-primary/20'
              : 'bg-primary/10'
          }
          ${step.status === 'error' ? 'text-amber-500' : color}
        `}>
          {hasResult ? (
            step.toolResult!.isError ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />
          ) : (
            <Icon size={14} />
          )}
        </div>
        {!isLast && (
          <div className="w-0.5 flex-1 bg-border/30 mt-1" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 pb-4 min-w-0">
        {/* Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex flex-wrap items-center gap-2 mb-1 text-left"
        >
          <span className={`text-xs font-medium ${step.status === 'error' ? 'text-amber-500' : color}`}>
            {t(step.title)}
          </span>

          {/* Status */}
          <StatusBadge step={step} />

          {/* Duration */}
          <DurationDisplay duration={step.duration} />

          {/* Subtitle (only for tool_call) */}
          {step.kind === 'tool_call' && step.subtitle && !isExpanded && (
            <span className="hidden sm:inline text-xs text-muted-foreground/50 truncate min-w-0 flex-1 ml-1">
              {truncateText(step.subtitle, 60)}
            </span>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Expand/collapse */}
          <ChevronDown
            size={14}
            className={`text-muted-foreground/50 transition-transform duration-150 shrink-0 ${
              isExpanded ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="mt-1 space-y-2">
            {/* Thinking content */}
            {step.kind === 'thinking' && displayContent && (
              <div className="text-sm text-muted-foreground/70 italic whitespace-pre-wrap break-words">
                {isContentExpanded || !needsTruncate ? displayContent : truncatedContent + '...'}
                {needsTruncate && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsContentExpanded(!isContentExpanded) }}
                    className="ml-1 text-primary/60 hover:text-primary not-italic"
                  >
                    {isContentExpanded ? t('Collapse') : t('Expand')}
                  </button>
                )}
              </div>
            )}

            {/* AI text content — same layout as thinking but without italic */}
            {step.kind === 'text' && displayContent && (
              <div className="text-sm text-foreground/80 whitespace-pre-wrap break-words">
                {isContentExpanded || !needsTruncate ? displayContent : truncatedContent + '...'}
                {needsTruncate && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsContentExpanded(!isContentExpanded) }}
                    className="ml-1 text-primary/60 hover:text-primary"
                  >
                    {isContentExpanded ? t('Collapse') : t('Expand')}
                  </button>
                )}
              </div>
            )}

            {/* System content */}
            {step.kind === 'system' && displayContent && (
              <div className="text-sm text-muted-foreground/60 whitespace-pre-wrap break-words">
                {displayContent}
              </div>
            )}

            {/* Error content */}
            {step.kind === 'error' && (
              <div className="text-sm">
                <ErrorContent content={step.thoughts.map(t => t.content).join('\n')} />
              </div>
            )}

            {/* Tool call content: JSON + result */}
            {step.kind === 'tool_call' && (
              <div>
                {/* Friendly subtitle */}
                {step.subtitle && (
                  <div className="text-sm text-muted-foreground/70 mb-2 whitespace-pre-wrap break-words font-mono">
                    {truncatedContent}
                  </div>
                )}

                {/* Action buttons */}
                {hasInput && (
                  <div className="flex items-center gap-0.5 mb-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowRawJson(!showRawJson) }}
                      className={`
                        flex items-center gap-0.5 px-1 py-px rounded transition-colors text-[9px]
                        ${showRawJson
                          ? 'bg-primary/20 text-primary'
                          : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50'
                        }
                      `}
                      title={showRawJson ? t('Hide raw JSON') : t('Show raw JSON')}
                    >
                      <Braces size={10} />
                    </button>

                    {/* Show/Hide result button */}
                    {hasResult && step.toolResult!.output && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowResult(!showResult) }}
                        className="flex items-center gap-0.5 px-1 py-px rounded text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50 transition-colors text-[9px]"
                        title={showResult ? t('Hide tool result') : t('Show tool result')}
                      >
                        {showResult ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                        {showResult ? t('Hide') : t('Result')}
                      </button>
                    )}
                  </div>
                )}

                {/* Raw JSON */}
                {showRawJson && step.toolInput && (
                  <pre className="p-2 rounded bg-muted/30 text-xs text-muted-foreground overflow-x-auto mb-2"
                    onClick={(e) => e.stopPropagation()}>
                    {JSON.stringify(step.toolInput, null, 2)}
                  </pre>
                )}

                {/* Tool result */}
                {hasResult && showResult && step.toolResult!.output && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <ToolResultViewer
                      toolName={step.toolName || ''}
                      toolInput={step.toolInput}
                      output={step.toolResult!.output}
                      isError={step.toolResult!.isError}
                    />
                  </div>
                )}

                {/* Sub-agent timeline for Task/Agent */}
                {isTaskOrAgent && allThoughts && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <SubAgentTimeline
                      thoughts={allThoughts}
                      parentToolUseId={step.id}
                      taskProgress={step.taskProgress}
                      isThinking={isThinking ?? false}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}, areStepCardPropsEqual)