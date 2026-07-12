/**
 * Unit tests for thoughts-to-steps.ts
 *
 * Tests cover filtering, grouping, status inference, title assignment,
 * and duration calculation logic.
 */
import { describe, expect, it } from 'vitest'
import { thoughtsToSteps, type FlowStep, type StepKind, type StepStatus } from '../../../src/renderer/components/chat/thoughts-to-steps'
import type { Thought } from '../../../src/renderer/types'

// ============================================
// Factory helpers
// ============================================

function makeThought(overrides: Partial<Thought> & { type: Thought['type'] }): Thought {
  return {
    id: `t-${Math.random().toString(36).slice(2, 8)}`,
    content: '',
    timestamp: '2026-07-11T00:00:00.000Z',
    ...overrides,
  }
}

function makeThinking(content = 'Thinking step by step...'): Thought {
  return makeThought({ type: 'thinking', content })
}

function makeText(content = 'Hello, world!'): Thought {
  return makeThought({ type: 'text', content })
}

function makeToolUse(overrides?: {
  toolName?: string
  toolInput?: Record<string, unknown>
  toolResult?: { output: string; isError: boolean; timestamp: string }
  isStreaming?: boolean
  isReady?: boolean
  taskProgress?: Thought['taskProgress']
  timestamp?: string
}): Thought {
  return makeThought({
    type: 'tool_use',
    toolName: overrides?.toolName ?? 'Bash',
    toolInput: overrides?.toolInput ?? { command: 'echo hello' },
    toolResult: overrides?.toolResult,
    isStreaming: overrides?.isStreaming,
    isReady: overrides?.isReady,
    taskProgress: overrides?.taskProgress,
    timestamp: overrides?.timestamp ?? '2026-07-11T00:00:00.000Z',
  })
}

function makeError(content = 'Something went wrong'): Thought {
  return makeThought({ type: 'error', content })
}

function makeSystem(content = 'System message'): Thought {
  return makeThought({ type: 'system', content })
}

// Thoughts that should be filtered out
function makeResult(): Thought {
  return makeThought({ type: 'result', content: 'Done.' })
}

function makeToolResult(): Thought {
  return makeThought({ type: 'tool_result', content: 'Tool output', toolOutput: 'some output' })
}

function makeTodoWrite(): Thought {
  return makeThought({
    type: 'tool_use',
    toolName: 'TodoWrite',
    toolInput: { tasks: [] },
  })
}

function makeSubAgent(): Thought {
  return makeThought({
    type: 'tool_use',
    toolName: 'Read',
    toolInput: { file_path: '/test.txt' },
    parentToolUseId: 'parent-123',
  })
}

// ============================================
// Step assertion helpers
// ============================================

function assertStep(
  step: FlowStep,
  expected: {
    kind: StepKind
    title?: string
    status: StepStatus
    thoughtCount?: number
    toolName?: string
  }
) {
  expect(step.kind).toBe(expected.kind)
  if (expected.title !== undefined) {
    expect(step.title).toBe(expected.title)
  }
  expect(step.status).toBe(expected.status)
  if (expected.thoughtCount !== undefined) {
    expect(step.thoughts).toHaveLength(expected.thoughtCount)
  }
  if (expected.toolName !== undefined) {
    expect(step.toolName).toBe(expected.toolName)
  }
}

// ============================================
// Tests
// ============================================

describe('thoughtsToSteps', () => {
  // ---- Empty / Edge ----

  it('returns empty array for empty input', () => {
    expect(thoughtsToSteps([])).toEqual([])
  })

  // ---- Single types ----

  it('converts a single thinking thought to one thinking step', () => {
    const thought = makeThinking()
    const steps = thoughtsToSteps([thought])
    expect(steps).toHaveLength(1)
    assertStep(steps[0], { kind: 'thinking', title: 'Thinking', status: 'completed', thoughtCount: 1 })
    expect(steps[0].id).toBe(thought.id)
    expect(steps[0].startTime).toBe(new Date(thought.timestamp).getTime())
  })

  it('converts a single text thought to one text step', () => {
    const thought = makeText()
    const steps = thoughtsToSteps([thought])
    expect(steps).toHaveLength(1)
    assertStep(steps[0], { kind: 'text', title: 'AI', status: 'completed', thoughtCount: 1 })
  })

  it('converts a single tool_use thought to one tool_call step', () => {
    const thought = makeToolUse({ toolName: 'Bash' })
    const steps = thoughtsToSteps([thought])
    expect(steps).toHaveLength(1)
    assertStep(steps[0], { kind: 'tool_call', title: 'Bash', status: 'streaming', thoughtCount: 1, toolName: 'Bash' })
  })

  it('converts a single error thought to one error step', () => {
    const thought = makeError()
    const steps = thoughtsToSteps([thought])
    expect(steps).toHaveLength(1)
    assertStep(steps[0], { kind: 'error', title: 'Error', status: 'error', thoughtCount: 1 })
  })

  it('converts a single system thought to one system step', () => {
    const thought = makeSystem()
    const steps = thoughtsToSteps([thought])
    expect(steps).toHaveLength(1)
    assertStep(steps[0], { kind: 'system', title: 'System', status: 'completed', thoughtCount: 1 })
  })

  // ---- Merging ----

  it('merges consecutive thinking thoughts into one thinking step', () => {
    const t1 = makeThinking('First part')
    const t2 = makeThinking('Second part')
    const t3 = makeThinking('Third part')
    const steps = thoughtsToSteps([t1, t2, t3])
    expect(steps).toHaveLength(1)
    assertStep(steps[0], { kind: 'thinking', status: 'completed', thoughtCount: 3 })
    expect(steps[0].id).toBe(t1.id)
  })

  it('merges consecutive text thoughts into one text step', () => {
    const t1 = makeText('Part 1')
    const t2 = makeText('Part 2')
    const steps = thoughtsToSteps([t1, t2])
    expect(steps).toHaveLength(1)
    assertStep(steps[0], { kind: 'text', status: 'completed', thoughtCount: 2 })
  })

  it('does not merge across different types', () => {
    const t1 = makeThinking()
    const t2 = makeToolUse({ toolName: 'Bash' })
    const steps = thoughtsToSteps([t1, t2])
    expect(steps).toHaveLength(2)
    expect(steps[0].kind).toBe('thinking')
    expect(steps[1].kind).toBe('tool_call')
  })

  // ---- Status inference ----

  it('infers status completed for tool_call with toolResult and !isError', () => {
    const thought = makeToolUse({
      toolName: 'Bash',
      toolResult: { output: 'Success', isError: false, timestamp: '2026-07-11T00:00:01.000Z' },
    })
    const steps = thoughtsToSteps([thought])
    assertStep(steps[0], { kind: 'tool_call', status: 'completed' })
  })

  it('infers status error for tool_call with toolResult and isError', () => {
    const thought = makeToolUse({
      toolName: 'Bash',
      toolResult: { output: 'Error!', isError: true, timestamp: '2026-07-11T00:00:01.000Z' },
    })
    const steps = thoughtsToSteps([thought])
    assertStep(steps[0], { kind: 'tool_call', status: 'error' })
  })

  it('infers status streaming for tool_call with isStreaming=true', () => {
    const thought = makeToolUse({
      toolName: 'Bash',
      isStreaming: true,
      isReady: false,
    })
    const steps = thoughtsToSteps([thought])
    assertStep(steps[0], { kind: 'tool_call', status: 'streaming' })
  })

  it('infers status running for tool_call with isReady=true and no toolResult', () => {
    const thought = makeToolUse({
      toolName: 'Bash',
      isReady: true,
      isStreaming: false,
    })
    const steps = thoughtsToSteps([thought])
    assertStep(steps[0], { kind: 'tool_call', status: 'running' })
  })

  // ---- Filtering ----

  it('filters out type "result"', () => {
    const thoughts = [makeThinking(), makeResult()]
    const steps = thoughtsToSteps(thoughts)
    expect(steps).toHaveLength(1)
    expect(steps[0].kind).toBe('thinking')
  })

  it('filters out type "tool_result"', () => {
    const thoughts = [makeThinking(), makeToolResult()]
    const steps = thoughtsToSteps(thoughts)
    expect(steps).toHaveLength(1)
    expect(steps[0].kind).toBe('thinking')
  })

  it('filters out TodoWrite tool_use', () => {
    const thoughts = [makeThinking(), makeTodoWrite()]
    const steps = thoughtsToSteps(thoughts)
    expect(steps).toHaveLength(1)
    expect(steps[0].kind).toBe('thinking')
  })

  it('filters out thoughts with non-empty parentToolUseId', () => {
    const thoughts = [makeThinking(), makeSubAgent()]
    const steps = thoughtsToSteps(thoughts)
    expect(steps).toHaveLength(1)
    expect(steps[0].kind).toBe('thinking')
  })

  // ---- Duration ----

  it('calculates duration only when multiple thoughts are merged', () => {
    const t1 = makeThinking()
    const t2 = makeThinking()
    // Override timestamps to be different
    t1.timestamp = '2026-07-11T00:00:00.000Z'
    t2.timestamp = '2026-07-11T00:00:02.500Z'
    const steps = thoughtsToSteps([t1, t2])
    expect(steps).toHaveLength(1)
    expect(steps[0].duration).toBe(2500)
  })

  it('does not set duration for single-thought steps', () => {
    const thought = makeThinking()
    const steps = thoughtsToSteps([thought])
    expect(steps[0].duration).toBeUndefined()
  })

  // ---- Subtitle ----

  it('sets subtitle from getToolFriendlyFormat for tool_call steps', () => {
    const thought = makeToolUse({
      toolName: 'Read',
      toolInput: { file_path: '/src/index.ts' },
    })
    const steps = thoughtsToSteps([thought])
    expect(steps[0].subtitle).toBe('/src/index.ts')
  })

  it('does not set subtitle for non-tool_call steps', () => {
    const thought = makeThinking()
    const steps = thoughtsToSteps([thought])
    expect(steps[0].subtitle).toBeUndefined()
  })

  // ---- TaskProgress ----

  it('preserves taskProgress in tool_call steps', () => {
    const taskProgress: Thought['taskProgress'] = {
      taskId: 'task-1',
      status: 'running',
      toolCount: 3,
      durationMs: 5000,
      lastToolName: 'Read',
    }
    const thought = makeToolUse({
      toolName: 'Task',
      toolInput: { description: 'Do something' },
      taskProgress,
    })
    const steps = thoughtsToSteps([thought])
    expect(steps[0].taskProgress).toEqual(taskProgress)
  })

  // ---- Complete flow ----

  it('correctly handles a mixed sequence of thoughts', () => {
    const thoughts = [
      makeThinking('Step 1'),
      makeThinking('Step 2'),
      makeToolUse({ toolName: 'Read', toolInput: { file_path: '/test.txt' } }),
      makeText('The result is...'),
      makeError('Failed!'),
      makeSystem('Continuing...'),
    ]
    const steps = thoughtsToSteps(thoughts)
    expect(steps).toHaveLength(5)
    expect(steps[0].kind).toBe('thinking')
    expect(steps[0].thoughts).toHaveLength(2)
    expect(steps[1].kind).toBe('tool_call')
    expect(steps[1].toolName).toBe('Read')
    expect(steps[2].kind).toBe('text')
    expect(steps[3].kind).toBe('error')
    expect(steps[4].kind).toBe('system')

    // Non-tool types should have no subtitle
    expect(steps[0].subtitle).toBeUndefined()
    expect(steps[2].subtitle).toBeUndefined()
    expect(steps[3].subtitle).toBeUndefined()
    expect(steps[4].subtitle).toBeUndefined()
  })

  it('returns empty array when all thoughts are filtered out', () => {
    const thoughts = [makeResult(), makeToolResult(), makeTodoWrite(), makeSubAgent()]
    expect(thoughtsToSteps(thoughts)).toEqual([])
  })
})