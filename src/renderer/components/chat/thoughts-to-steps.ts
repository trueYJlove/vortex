/**
 * thoughts-to-steps - Converts a flat array of agent thoughts into grouped FlowSteps.
 *
 * Pure function module with no React dependencies. Each FlowStep represents a
 * logical unit of agent work (thinking, tool call, text output, error, system).
 */
import type { Thought, TaskProgress } from '../../types'
import { getToolFriendlyFormat } from './thought-utils'

// ============================================
// Types
// ============================================

export type StepKind = 'thinking' | 'tool_call' | 'text' | 'error' | 'system'
export type StepStatus = 'streaming' | 'running' | 'completed' | 'error'

export interface FlowStep {
  id: string
  kind: StepKind
  /** Untranslated English title, e.g. 'Thinking', 'AI', toolName */
  title: string
  /** Human-friendly summary from getToolFriendlyFormat (only for tool_call) */
  subtitle?: string
  /** Raw thoughts that compose this step */
  thoughts: Thought[]
  startTime: number
  duration?: number
  status: StepStatus
  toolName?: string
  toolInput?: Record<string, unknown>
  toolResult?: { output: string; isError: boolean; timestamp: string }
  taskProgress?: TaskProgress
}

// ============================================
// Step title helpers
// ============================================

function getStepTitle(kind: StepKind, toolName?: string): string {
  switch (kind) {
    case 'thinking':
      return 'Thinking'
    case 'text':
      return 'AI'
    case 'tool_call':
      return toolName ?? 'Tool call'
    case 'error':
      return 'Error'
    case 'system':
      return 'System'
  }
}

// ============================================
// Status inference
// ============================================

function inferStepStatus(kind: StepKind, thoughts: Thought[]): StepStatus {
  const hasStreaming = thoughts.some(t => t.isStreaming === true)

  if (kind === 'tool_call') {
    const toolResult = thoughts[thoughts.length - 1]?.toolResult
    if (toolResult) {
      return toolResult.isError ? 'error' : 'completed'
    }
    if (hasStreaming) return 'streaming'
    // tool_use with isReady and no toolResult yet → running
    if (thoughts.some(t => t.isReady === true)) return 'running'
    return 'streaming'
  }

  if (kind === 'error') return 'error'
  if (hasStreaming) return 'streaming'
  return 'completed'
}

// ============================================
// Grouping logic
// ============================================

/**
 * Map a thought type to its corresponding StepKind.
 * tool_use and tool_result both map to 'tool_call' (tool_result is merged).
 */
function thoughtTypeToStepKind(type: Thought['type']): StepKind | null {
  switch (type) {
    case 'thinking':
      return 'thinking'
    case 'text':
      return 'text'
    case 'tool_use':
      return 'tool_call'
    case 'error':
      return 'error'
    case 'system':
      return 'system'
    // tool_result is merged into the preceding tool_use; result is filtered out.
    case 'tool_result':
    case 'result':
      return null
  }
}

// ============================================
// Main conversion
// ============================================

/**
 * Convert a flat array of agent thoughts into a structured list of FlowSteps.
 *
 * Filtering rules:
 * - Excludes type 'result' and 'tool_result'
 * - Excludes toolName 'TodoWrite'
 * - Excludes thoughts with a non-empty parentToolUseId (sub-agent thoughts)
 *
 * Grouping rules:
 * - Consecutive thoughts of the same kind are merged into one step.
 * - Each tool_use becomes its own step (tool_result is merged into the tool_use).
 * - Errors and system thoughts each get their own step.
 * - Types are never merged across boundaries.
 */
export function thoughtsToSteps(thoughts: Thought[]): FlowStep[] {
  if (thoughts.length === 0) return []

  // 1. Filter
  const filtered = thoughts.filter(t => {
    if (t.type === 'result') return false
    if (t.type === 'tool_result') return false
    if (t.toolName === 'TodoWrite') return false
    if (t.parentToolUseId) return false
    return true
  })

  if (filtered.length === 0) return []

  // 2. Group by type (sequential, no cross-type merging)
  const groups: Thought[][] = []
  let currentGroup: Thought[] = [filtered[0]]

  for (let i = 1; i < filtered.length; i++) {
    const prevKind = thoughtTypeToStepKind(filtered[i - 1].type)
    const currKind = thoughtTypeToStepKind(filtered[i].type)

    if (prevKind !== null && currKind !== null && prevKind === currKind) {
      currentGroup.push(filtered[i])
    } else {
      groups.push(currentGroup)
      currentGroup = [filtered[i]]
    }
  }
  groups.push(currentGroup)

  // 3. Convert each group to a FlowStep
  const steps: FlowStep[] = []

  for (const group of groups) {
    const first = group[0]
    const last = group[group.length - 1]
    const kind = thoughtTypeToStepKind(first.type)

    // Should never happen since we filtered, but guard for safety
    if (kind === null) continue

    const toolName = first.toolName
    const toolInput = first.toolInput
    const toolResult = last.toolResult

    // duration: only when multiple thoughts are merged
    let duration: number | undefined
    if (group.length > 1) {
      const lastTime = new Date(last.timestamp).getTime()
      const firstTime = new Date(first.timestamp).getTime()
      duration = lastTime - firstTime
    }

    const step: FlowStep = {
      id: first.id,
      kind,
      title: getStepTitle(kind, toolName),
      thoughts: group,
      startTime: new Date(first.timestamp).getTime(),
      duration,
      status: inferStepStatus(kind, group),
      toolName,
      toolInput,
      toolResult,
      taskProgress: first.taskProgress,
    }

    // subtitle for tool_call
    if (kind === 'tool_call') {
      step.subtitle = getToolFriendlyFormat(toolName ?? '', toolInput)
    }

    steps.push(step)
  }

  return steps
}