/**
 * ThoughtProcess - Displays agent reasoning process in real-time
 * Shows thinking, tool usage, and intermediate results as they happen
 *
 * TodoWrite is rendered separately at the bottom (above "processing...")
 * to keep it always visible and avoid duplicate renders
 */

import { useState, useRef, useEffect, useMemo, memo, type RefObject } from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Braces,
  Pin,
  List,
  GitBranch,
} from 'lucide-react'
import { TodoCard } from '../tool/TodoCard'
import { ToolResultViewer } from './tool-result'
import { SubAgentTimeline } from './SubAgentTimeline'
import { ErrorContent } from './ErrorContent'
import {
  truncateText,
  getThoughtIcon,
  getThoughtColor,
  getThoughtLabelKey,
  getToolFriendlyFormat,
} from './thought-utils'
import { thoughtsToSteps, type FlowStep } from './thoughts-to-steps'
import { StepCard } from './StepCard'
import { useSmartScroll } from '../../hooks/useSmartScroll'
import { useLazyVisible } from '../../hooks/useLazyVisible'
import { useLatestTodos } from '../../hooks/useLatestTodos'
import type { Thought } from '../../types'
import { useTranslation } from '../../i18n'

interface ThoughtProcessProps {
  thoughts: Thought[]
  isThinking: boolean
}

// i18n static keys for extraction (DO NOT REMOVE)
// prettier-ignore
void function _i18nActionKeys(t: (k: string) => string) {
  t('Generating {{tool}}...'); t('Reading {{file}}...'); t('Writing {{file}}...');
  t('Editing {{file}}...'); t('Searching {{pattern}}...'); t('Matching {{pattern}}...');
  t('Executing {{command}}...'); t('Fetching {{url}}...'); t('Searching {{query}}...');
  t('Updating tasks...'); t('Executing {{task}}...'); t('Waiting for user response...');
  t('Processing...'); t('Thinking...');
}

// Get human-friendly action summary for collapsed header (isThinking=true only)
// Shows what the agent is currently doing with key details (filename, command, etc.)
function getActionSummaryData(thoughts: Thought[]): { key: string; params?: Record<string, string> } {
  // Search from end to find the most recent main-agent action (skip sub-agent thoughts)
  for (let i = thoughts.length - 1; i >= 0; i--) {
    const th = thoughts[i]
    if (th.parentToolUseId) continue  // Skip sub-agent thoughts
    if (th.type === 'tool_use' && th.toolName) {
      // If tool is still streaming (not ready), show generating
      if (th.isStreaming || !th.isReady) {
        return { key: 'Generating {{tool}}...', params: { tool: th.toolName } }
      }
      const input = th.toolInput
      switch (th.toolName) {
        case 'Read': return { key: 'Reading {{file}}...', params: { file: extractFileName(input?.file_path) } }
        case 'Write': return { key: 'Writing {{file}}...', params: { file: extractFileName(input?.file_path) } }
        case 'Edit': return { key: 'Editing {{file}}...', params: { file: extractFileName(input?.file_path) } }
        case 'Grep': return { key: 'Searching {{pattern}}...', params: { pattern: extractSearchTerm(input?.pattern) } }
        case 'Glob': return { key: 'Matching {{pattern}}...', params: { pattern: extractSearchTerm(input?.pattern) } }
        case 'Bash': return { key: 'Executing {{command}}...', params: { command: extractCommand(input?.command) } }
        case 'WebFetch': return { key: 'Fetching {{url}}...', params: { url: extractUrl(input?.url) } }
        case 'WebSearch': return { key: 'Searching {{query}}...', params: { query: extractSearchTerm(input?.query) } }
        case 'TodoWrite': return { key: 'Updating tasks...' }
        case 'Task':
          if (input?.subagent_type === 'web-searcher') {
            return { key: 'Searching {{query}}...', params: { query: extractSearchTerm(input?.prompt) } }
          }
          return { key: 'Executing {{task}}...', params: { task: extractSearchTerm(input?.description) } }
        case 'NotebookEdit': return { key: 'Editing {{file}}...', params: { file: extractFileName(input?.notebook_path) } }
        case 'AskUserQuestion': return { key: 'Waiting for user response...' }
        default: return { key: 'Processing...' }
      }
    }
    // If most recent is thinking, show thinking status
    if (th.type === 'thinking') {
      return { key: 'Thinking...' }
    }
  }
  return { key: 'Thinking...' }
}

// Extract filename from path (e.g., "/foo/bar/config.json" -> "config.json")
function extractFileName(path: unknown): string {
  if (typeof path !== 'string' || !path) return 'file'
  const name = path.split(/[/\\]/).pop() || path
  return truncateText(name, 20)
}

// Extract command summary (e.g., "npm install lodash --save" -> "npm install...")
function extractCommand(cmd: unknown): string {
  if (typeof cmd !== 'string' || !cmd) return 'command'
  // Get first part of command (before first space or first 20 chars)
  const firstPart = cmd.split(' ').slice(0, 2).join(' ')
  return truncateText(firstPart, 20)
}

// Extract search term or pattern
function extractSearchTerm(term: unknown): string {
  if (typeof term !== 'string' || !term) return '...'
  return truncateText(term, 15)
}

// Extract domain from URL
function extractUrl(url: unknown): string {
  if (typeof url !== 'string' || !url) return 'page'
  try {
    const domain = new URL(url).hostname.replace('www.', '')
    return truncateText(domain, 20)
  } catch {
    return truncateText(url, 20)
  }
}


// Static elapsed time — only mounted after thinking completes
function TimerDisplay({ startTime }: { startTime: number | null }) {
  const elapsed = startTime ? ((Date.now() - startTime) / 1000).toFixed(1) : '0.0'
  return <span>{elapsed}s</span>
}

// Individual thought item (for non-special tools)
const ThoughtItem = memo(function ThoughtItem({ thought, isLast, allThoughts, isThinking }: { thought: Thought; isLast: boolean; allThoughts?: Thought[]; isThinking?: boolean }) {
  const [showRawJson, setShowRawJson] = useState(false)
  const [showResult, setShowResult] = useState(true)  // Tool result collapsed by default shows summary
  const [isContentExpanded, setIsContentExpanded] = useState(false)  // For thinking content expand
  const { t } = useTranslation()
  const color = getThoughtColor(thought.type, thought.isError)
  const Icon = getThoughtIcon(thought.type, thought.toolName)

  // Determine content and display mode based on thought type and streaming state
  const isStreaming = thought.isStreaming ?? false
  const isToolReady = thought.isReady ?? true  // Default true for backward compatibility
  const hasToolResult = thought.type === 'tool_use' && thought.toolResult

  // For tool_use: show friendly format when ready, "Generating..." when streaming
  // For thinking: show content directly with streaming placeholder
  let displayContent = ''
  let needsTruncate = false
  const maxPreviewLength = 150

  if (thought.type === 'tool_use') {
    if (!isToolReady) {
      // Tool still streaming - status shown in header, content shows placeholder
      displayContent = '...'
    } else {
      // Tool ready - show friendly format
      displayContent = getToolFriendlyFormat(thought.toolName || '', thought.toolInput)
    }
    needsTruncate = displayContent.length > maxPreviewLength
  } else if (thought.type === 'thinking') {
    // Thinking content - show with placeholder if empty
    displayContent = thought.content || (isStreaming ? '...' : '')
    needsTruncate = displayContent.length > maxPreviewLength
  } else if (thought.type === 'tool_result') {
    displayContent = (thought.toolOutput || '').substring(0, 200)
    needsTruncate = displayContent.length > maxPreviewLength
  } else {
    displayContent = thought.content || ''
    needsTruncate = displayContent.length > maxPreviewLength
  }

  // Always truncate content - use JSON button to see full content
  const truncatedContent = needsTruncate ? displayContent.substring(0, maxPreviewLength) : displayContent

  // Status indicator for tool_use - now includes execution status
  // Tool errors use warning style (amber) instead of error style (red) because
  // these are internal AI feedback (e.g. "read file first"), not user-facing errors.
  // The AI will auto-recover from these, so a softer visual treatment avoids misleading users.
  const getToolStatus = () => {
    if (thought.type !== 'tool_use') return null
    if (!isToolReady) return { label: t('Generating'), color: 'text-amber-400', icon: 'loading' }
    if (hasToolResult) {
      return thought.toolResult!.isError
        ? { label: t('Hint'), color: 'text-amber-500', icon: 'warning' }
        : { label: t('Done'), color: 'text-green-400', icon: 'success' }
    }
    return { label: t('Running'), color: 'text-blue-400', icon: 'running' }
  }
  const toolStatus = getToolStatus()


  return (
    <div className="flex gap-3 group animate-fade-in">
      {/* Timeline line */}
      <div className="flex flex-col items-center">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
          thought.isError || thought.toolResult?.isError ? 'bg-amber-500/20' : isStreaming ? 'bg-primary/20' : 'bg-primary/10'
        } ${thought.toolResult?.isError ? 'text-amber-500' : color}`}>
          {hasToolResult ? (
            thought.toolResult!.isError ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />
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
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs font-medium ${thought.toolResult?.isError ? 'text-amber-500' : color}`}>
            {(() => {
              const label = getThoughtLabelKey(thought.type)
              return label === 'AI' ? label : t(label)
            })()}
            {thought.toolName && ` - ${thought.toolName}`}
          </span>
          {toolStatus && (
            <span className={`text-xs ${toolStatus.color}`}>
              {toolStatus.label}
            </span>
          )}
          {/* Time - hidden on mobile */}
          <span className="hidden sm:inline text-xs text-muted-foreground/50">
            {new Date(thought.timestamp).toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })}
          </span>
          {/* Duration - hidden on mobile */}
          {thought.duration && (
            <span className="hidden sm:inline text-xs text-muted-foreground/40">
              ({(thought.duration / 1000).toFixed(1)}s)
            </span>
          )}
        </div>

        {/* Content area with actions on the right */}
        <div className="flex items-end gap-3">
          {/* Content - takes available space */}
          <div className="flex-1 min-w-0">
            {thought.type === 'error' ? (
              thought.content && <ErrorContent content={thought.content} />
            ) : (
              displayContent && (
                <div
                  className={`text-sm ${
                    thought.type === 'thinking' ? 'text-muted-foreground/70 italic' : 'text-foreground/80'
                  } whitespace-pre-wrap break-words`}
                >
                  {isContentExpanded || !needsTruncate ? displayContent : truncatedContent + '...'}
                  {(thought.type === 'thinking' || thought.type === 'text') && needsTruncate && (
                    <button
                      onClick={() => setIsContentExpanded(!isContentExpanded)}
                      className="ml-1 text-primary/60 hover:text-primary not-italic"
                    >
                      {isContentExpanded ? t('Collapse') : t('Expand')}
                    </button>
                  )}
                </div>
              )
            )}
          </div>

          {/* Actions - right aligned, compact buttons */}
          {((thought.type === 'tool_use' && isToolReady && thought.toolInput && Object.keys(thought.toolInput).length > 0) || hasToolResult) && (
            <div className="flex items-center gap-0.5 shrink-0 text-[9px]">
              {/* Raw JSON button */}
              {thought.type === 'tool_use' && isToolReady && thought.toolInput && Object.keys(thought.toolInput).length > 0 && (
                <button
                  onClick={() => setShowRawJson(!showRawJson)}
                  className={`
                    flex items-center gap-0.5 px-1 py-px rounded transition-colors
                    ${showRawJson
                      ? 'bg-primary/20 text-primary'
                      : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50'
                    }
                  `}
                  title={showRawJson ? t('Hide raw JSON') : t('Show raw JSON')}
                >
                  <Braces size={10} />
                </button>
              )}

              {/* Show/Hide result button */}
              {hasToolResult && thought.toolResult!.output && (
                <button
                  onClick={() => setShowResult(!showResult)}
                  className="flex items-center gap-0.5 px-1 py-px rounded text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50 transition-colors"
                  title={showResult ? t('Hide tool result') : t('Show tool result')}
                >
                  {showResult ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                  {showResult ? t('Hide') : t('Result')}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Raw JSON display (for tool_use) */}
        {thought.type === 'tool_use' && showRawJson && thought.toolInput && (
          <pre className="mt-2 p-2 rounded bg-muted/30 text-xs text-muted-foreground overflow-x-auto">
            {JSON.stringify(thought.toolInput, null, 2)}
          </pre>
        )}

        {/* Tool result display (merged under tool_use) - Smart rendering */}
        {hasToolResult && showResult && thought.toolResult!.output && (
          <ToolResultViewer
            toolName={thought.toolName || ''}
            toolInput={thought.toolInput}
            output={thought.toolResult!.output}
            isError={thought.toolResult!.isError}
          />
        )}

        {/* Sub-agent nested timeline for Task/Agent tool calls */}
        {thought.type === 'tool_use' && (thought.toolName === 'Task' || thought.toolName === 'Agent') && allThoughts && (
          <SubAgentTimeline
            thoughts={allThoughts}
            parentToolUseId={thought.id}
            taskProgress={thought.taskProgress}
            isThinking={isThinking ?? false}
          />
        )}
      </div>
    </div>
  )
})

// Lazy wrapper: defers rendering of ThoughtItem until it enters the scroll viewport.
// Once visible, stays rendered permanently (no unmount on scroll-away).
// Estimated height placeholder prevents layout jumps.
const THOUGHT_ITEM_ESTIMATED_HEIGHT = 60

function LazyThoughtItem({
  thought,
  isLast,
  scrollContainerRef,
  eager = false,
  allThoughts,
  isThinking,
}: {
  thought: Thought
  isLast: boolean
  scrollContainerRef: RefObject<HTMLDivElement | null>
  eager?: boolean
  allThoughts?: Thought[]
  isThinking?: boolean
}) {
  const [ref, isVisible] = useLazyVisible('200px', scrollContainerRef, eager)

  if (isVisible) {
    return <ThoughtItem thought={thought} isLast={isLast} allThoughts={allThoughts} isThinking={isThinking} />
  }

  return (
    <div ref={ref} style={{ minHeight: THOUGHT_ITEM_ESTIMATED_HEIGHT }} />
  )
}

// Lazy wrapper for StepCard — same pattern as LazyThoughtItem. Defers mounting
// until the placeholder enters the scroll viewport to keep step view smooth for
// long reasoning chains.
const STEP_CARD_ESTIMATED_HEIGHT = 80

function LazyStepCard({
  step,
  isLast,
  scrollContainerRef,
  eager = false,
  allThoughts,
  isThinking,
}: {
  step: FlowStep
  isLast: boolean
  scrollContainerRef: RefObject<HTMLDivElement | null>
  eager?: boolean
  allThoughts?: Thought[]
  isThinking?: boolean
}) {
  const [ref, isVisible] = useLazyVisible('200px', scrollContainerRef, eager)

  if (isVisible) {
    return <StepCard step={step} isLast={isLast} allThoughts={allThoughts} isThinking={isThinking} />
  }

  return (
    <div ref={ref} style={{ minHeight: STEP_CARD_ESTIMATED_HEIGHT }} />
  )
}

export function ThoughtProcess({ thoughts, isThinking }: ThoughtProcessProps) {
  // Start collapsed, but auto-expand when streaming starts
  const [isExpanded, setIsExpanded] = useState(false)
  const [hasAutoExpanded, setHasAutoExpanded] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [viewMode, setViewMode] = useState<'list' | 'steps'>('list')
  const contentRef = useRef<HTMLDivElement>(null)
  const { t } = useTranslation()

  // Auto-expand when isThinking becomes true (streaming started)
  // Only do this once per session to avoid annoying user who manually collapsed
  useEffect(() => {
    if (isThinking && !hasAutoExpanded && thoughts.length > 0) {
      setIsExpanded(true)
      setHasAutoExpanded(true)
    }
  }, [isThinking, hasAutoExpanded, thoughts.length])

  // Reset auto-expand flag when thoughts are cleared (new session)
  useEffect(() => {
    if (thoughts.length === 0) {
      setHasAutoExpanded(false)
      setAutoScroll(true)
    }
  }, [thoughts.length])

  // Calculate elapsed time from first thought's timestamp
  // This is more reliable than tracking component mount time
  const startTime = useMemo(() => {
    if (thoughts.length > 0) {
      return new Date(thoughts[0].timestamp).getTime()
    }
    return null
  }, [thoughts.length > 0 ? thoughts[0]?.timestamp : null])

  const latestTodos = useLatestTodos(thoughts)

  // Filter thoughts for display (exclude TodoWrite, tool_result, result, and sub-agent thoughts)
  // tool_result is now merged into tool_use, no need to show separately
  // Sub-agent thoughts (parentToolUseId set) are rendered nested inside their parent Task thought
  const displayThoughts = useMemo(() => {
    return thoughts.filter(t => {
      if (t.type === 'result') return false
      if (t.type === 'tool_result') return false  // Merged into tool_use
      if (t.parentToolUseId) return false  // Sub-agent thoughts rendered via SubAgentTimeline
      // Exclude TodoWrite tool_use (shown separately at bottom)
      if (t.toolName === 'TodoWrite') return false
      return true
    })
  }, [thoughts])

  // Convert filtered thoughts to grouped FlowSteps for step view mode.
  // Only compute when step view is active — thoughtsToSteps is O(n) and
  // would otherwise run on every streaming chunk even in list view.
  const steps = useMemo(
    () => viewMode === 'steps' ? thoughtsToSteps(displayThoughts) : [],
    [displayThoughts, viewMode],
  )

  // Auto-scroll follows streaming content with instant scroll — smooth animation
  // conflicts with rapid content updates and layout reflows (expand/collapse),
  // causing visible jitter. Instant scroll snaps cleanly without fighting layout.
  const { handleScroll: smartHandleScroll } = useSmartScroll({
    containerRef: contentRef,
    threshold: 50,
    deps: [thoughts],
    behavior: 'auto',
    enabled: autoScroll
  })

  const lastScrollTopRef = useRef(0)

  const handleScroll = () => {
    const container = contentRef.current
    if (container) {
      const { scrollTop, scrollHeight, clientHeight } = container
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight
      if (scrollTop < lastScrollTopRef.current && distanceFromBottom > 50) {
        setAutoScroll(false)
      }
      lastScrollTopRef.current = scrollTop
    }
    smartHandleScroll()
  }

  // Don't render if no thoughts and not thinking
  if (thoughts.length === 0 && !isThinking) {
    return null
  }

  // Only count system-level errors (type: 'error'), not tool execution failures (tool_result with isError)
  // Tool failures are normal during agent investigation and should not affect overall status
  const errorCount = thoughts.filter(t => t.type === 'error').length

  // Check if there's content to show in the scrollable area
  const hasDisplayContent = displayThoughts.length > 0 || (latestTodos && latestTodos.length > 0)

  return (
    <div className="animate-fade-in mb-4">
      <div
        className={`
          relative rounded-xl border overflow-hidden transition-all duration-300
          ${isThinking
            ? 'border-primary/40 bg-primary/5'
            : errorCount > 0
              ? 'border-destructive/30 bg-destructive/5'
              : 'border-border/50 bg-card/30'
          }
        `}
      >
        {/* Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
        >
          {/* Status indicator */}
          {isThinking ? (
            <Loader2 size={16} className="text-primary animate-spin" />
          ) : (
            <CheckCircle2
              size={16}
              className={errorCount > 0 ? 'text-destructive' : 'text-primary'}
            />
          )}

          {/* Title: action summary when thinking, "Thought process" when done */}
          <span className={`text-sm font-medium ${isThinking ? 'text-primary' : 'text-foreground'}`}>
            {isThinking ? (() => {
              const data = getActionSummaryData(thoughts)
              return t(data.key, data.params)
            })() : t('Already thought')}
          </span>

          {/* Stats: only show elapsed time when thinking is complete */}
          {!isThinking && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
              <TimerDisplay startTime={startTime} />
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Auto-scroll toggle — only when expanded and streaming */}
          {isExpanded && isThinking && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setAutoScroll(prev => {
                  const next = !prev
                  if (next) {
                    // Scrolling to bottom immediately when enabling
                    requestAnimationFrame(() => {
                      const el = contentRef.current
                      if (el) el.scrollTop = el.scrollHeight
                    })
                  }
                  return next
                })
              }}
              className={`p-1 rounded transition-colors ${
                autoScroll
                  ? 'text-primary hover:bg-primary/10'
                  : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50'
              }`}
              title={autoScroll ? t('Auto-scroll on') : t('Auto-scroll off')}
            >
              <Pin size={14} className={autoScroll ? '' : 'rotate-45'} />
            </button>
          )}

          {/* View mode toggle — only when expanded */}
          {isExpanded && (
            <div className="flex items-center gap-0.5 mr-1">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setViewMode('list')
                }}
                className={`p-1 rounded transition-colors ${
                  viewMode === 'list'
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50'
                }`}
                title={t('List view')}
              >
                <List size={14} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setViewMode('steps')
                }}
                className={`p-1 rounded transition-colors ${
                  viewMode === 'steps'
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50'
                }`}
                title={t('Step view')}
              >
                <GitBranch size={14} />
              </button>
            </div>
          )}

          {/* Expand icon */}
          <ChevronDown
            size={16}
            className={`text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Content */}
        {isExpanded && (
          <div className="border-t border-border/30 thought-content">
            {/* Scrollable thought items */}
            {hasDisplayContent && (
              <div
                ref={contentRef}
                onScroll={handleScroll}
                className={`px-4 pt-3 ${isMaximized ? 'max-h-[80vh]' : 'max-h-[300px]'} overflow-auto scrollbar-overlay transition-all duration-200`}
              >
                {viewMode === 'list' ? (
                  displayThoughts.map((thought, index) => {
                    const isLast = index === displayThoughts.length - 1 && !latestTodos && !isThinking
                    const isRecentItem = index >= displayThoughts.length - 3
                    const isTaskThought = thought.type === 'tool_use' && (thought.toolName === 'Task' || thought.toolName === 'Agent')
                    return (
                      <LazyThoughtItem
                        key={thought.id}
                        thought={thought}
                        isLast={isLast}
                        scrollContainerRef={contentRef}
                        eager={isRecentItem}
                        allThoughts={isTaskThought ? thoughts : undefined}
                        isThinking={isTaskThought ? isThinking : undefined}
                      />
                    )
                  })
                ) : (
                  steps.map((step, index) => {
                    const isLast = index === steps.length - 1 && !isThinking
                    const isTaskStep = step.kind === 'tool_call' && (step.toolName === 'Task' || step.toolName === 'Agent')
                    const isRecentStep = index >= steps.length - 3
                    return (
                      <LazyStepCard
                        key={step.id}
                        step={step}
                        isLast={isLast}
                        scrollContainerRef={contentRef}
                        eager={isRecentStep}
                        allThoughts={isTaskStep ? thoughts : undefined}
                        isThinking={isTaskStep ? isThinking : undefined}
                      />
                    )
                  })
                )}
              </div>
            )}

            {/* TodoCard - fixed at bottom, only one instance */}
            {latestTodos && latestTodos.length > 0 && (
              <div className={`px-4 ${hasDisplayContent ? 'pt-2' : 'pt-3'} pb-3`}>
                <TodoCard todos={latestTodos} isAgentActive={isThinking} />
              </div>
            )}

            {/* Maximize toggle - bottom right, heuristic: show when likely to overflow */}
            {(displayThoughts.length > 8 || isMaximized) && (
              <div className="flex justify-end px-4 pb-2">
                <button
                  onClick={() => setIsMaximized(!isMaximized)}
                  className="flex items-center gap-0.5 px-1 py-px rounded text-xs text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50 transition-colors"
                  title={isMaximized ? t('Compact view') : t('Full view')}
                >
                  {isMaximized ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {isMaximized ? t('Compact') : t('Full')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// i18n static keys for extraction (DO NOT REMOVE)
// prettier-ignore
void function _i18nStepKeys(t: (k: string) => string) {
  t('List view'); t('Step view');
}
