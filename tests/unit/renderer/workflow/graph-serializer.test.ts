/**
 * Unit Tests: workflow/graph-serializer (stepsToReactFlow / reactFlowToSteps)
 *
 * Covers: linear flow, branch flow, condition edges, roundtrip fidelity,
 * dangling reference cleanup, and Y-position reordering.
 */

import { describe, it, expect } from 'vitest'
import {
  stepsToReactFlow,
  reactFlowToSteps,
  generateStepId,
} from '../../../../src/renderer/components/workflow/workflow-utils'
import type { WorkflowStep, LlmCallStep, ToolCallStep, ConditionStep } from '../../../../src/shared/apps/spec-types'

// ============================================
// Factory helpers
// ============================================

function llm(id: string, prompt = 'prompt'): LlmCallStep {
  return { id, type: 'llm_call', prompt }
}

function tool(id: string, toolName = 'web_search'): ToolCallStep {
  return { id, type: 'tool_call', tool: toolName }
}

function condition(
  id: string,
  cases: Array<{ when: Record<string, string>; goto: string }>,
  def?: string,
): ConditionStep {
  return { id, type: 'condition', input: '${input}', cases, default: def }
}

// ============================================
// Tests
// ============================================

describe('stepsToReactFlow', () => {
  it('empty steps → empty nodes and edges', () => {
    const { nodes, edges } = stepsToReactFlow([])
    expect(nodes).toEqual([])
    expect(edges).toEqual([])
  })

  it('single step → one node, zero edges', () => {
    const { nodes, edges } = stepsToReactFlow([llm('step_1')])
    expect(nodes).toHaveLength(1)
    expect(nodes[0].id).toBe('step_1')
    expect(nodes[0].type).toBe('llm_call')
    expect(edges).toEqual([])
  })

  it('linear steps → sequential edges, vertical positions', () => {
    const steps: WorkflowStep[] = [llm('a'), llm('b'), llm('c')]
    const { nodes, edges } = stepsToReactFlow(steps)

    expect(nodes).toHaveLength(3)
    expect(nodes[0].position.y).toBe(0)
    expect(nodes[1].position.y).toBe(140)
    expect(nodes[2].position.y).toBe(280)

    expect(edges).toHaveLength(2)
    expect(edges[0].source).toBe('a')
    expect(edges[0].target).toBe('b')
    expect(edges[1].source).toBe('b')
    expect(edges[1].target).toBe('c')
  })

  it('condition with branches → goto edges, no sequential edge', () => {
    const steps: WorkflowStep[] = [
      condition('cond', [{ when: { eq: 'yes' }, goto: 'b' }, { when: { eq: 'no' }, goto: 'c' }], 'c'),
      llm('b'),
      llm('c'),
    ]
    const { nodes, edges } = stepsToReactFlow(steps)

    // No sequential edge from cond → b
    const condSources = edges.filter(e => e.source === 'cond')
    expect(condSources).toHaveLength(3) // 2 cases + 1 default
    expect(condSources.some(e => e.target === 'b')).toBe(true)
    expect(condSources.some(e => e.target === 'c')).toBe(true)
    expect(condSources.some(e => e.label === 'default')).toBe(true)
  })

  it('condition without branches → fallback sequential edge', () => {
    const steps: WorkflowStep[] = [
      condition('cond', []),
      llm('b'),
    ]
    const { edges } = stepsToReactFlow(steps)

    const condEdges = edges.filter(e => e.source === 'cond')
    expect(condEdges).toHaveLength(1)
    expect(condEdges[0].target).toBe('b')
  })

  it('condition with default only → default edge', () => {
    const steps: WorkflowStep[] = [
      condition('cond', [], 'b'),
      llm('b'),
    ]
    const { edges } = stepsToReactFlow(steps)

    const condEdges = edges.filter(e => e.source === 'cond')
    expect(condEdges).toHaveLength(1)
    expect(condEdges[0].target).toBe('b')
    expect(condEdges[0].label).toBe('default')
  })
})

describe('reactFlowToSteps', () => {
  it('empty nodes → empty array', () => {
    expect(reactFlowToSteps([], [])).toEqual([])
  })

  it('sorts by Y position', () => {
    const nodes = [
      { id: 'c', type: 'llm_call' as const, position: { x: 0, y: 280 }, data: { step: llm('c'), label: 'c' } },
      { id: 'a', type: 'llm_call' as const, position: { x: 0, y: 0 }, data: { step: llm('a'), label: 'a' } },
      { id: 'b', type: 'llm_call' as const, position: { x: 0, y: 140 }, data: { step: llm('b'), label: 'b' } },
    ]
    const steps = reactFlowToSteps(nodes, [])
    expect(steps.map(s => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('cleans up dangling goto references', () => {
    const nodes = [
      { id: 'a', type: 'condition' as const, position: { x: 0, y: 0 }, data: { step: condition('a', [{ when: { eq: 'yes' }, goto: 'deleted_node' }], 'also_deleted'), label: 'a' } },
      { id: 'b', type: 'llm_call' as const, position: { x: 0, y: 140 }, data: { step: llm('b'), label: 'b' } },
    ]
    const steps = reactFlowToSteps(nodes, [])
    const cond = steps.find(s => s.id === 'a') as ConditionStep
    expect(cond.cases).toHaveLength(0) // dangling goto filtered
    expect(cond.default).toBeUndefined() // dangling default filtered
  })

  it('preserves valid goto references', () => {
    const nodes = [
      { id: 'a', type: 'condition' as const, position: { x: 0, y: 0 }, data: { step: condition('a', [{ when: { eq: 'yes' }, goto: 'b' }], 'c'), label: 'a' } },
      { id: 'b', type: 'llm_call' as const, position: { x: 0, y: 140 }, data: { step: llm('b'), label: 'b' } },
      { id: 'c', type: 'llm_call' as const, position: { x: 0, y: 280 }, data: { step: llm('c'), label: 'c' } },
    ]
    const steps = reactFlowToSteps(nodes, [])
    const cond = steps.find(s => s.id === 'a') as ConditionStep
    expect(cond.cases).toHaveLength(1)
    expect(cond.cases[0].goto).toBe('b')
    expect(cond.default).toBe('c')
  })

  it('preserves step data (tool, prompt, params)', () => {
    const nodes = [
      { id: 'a', type: 'tool_call' as const, position: { x: 0, y: 0 }, data: { step: tool('a', 'web_search'), label: 'a' } },
    ]
    const steps = reactFlowToSteps(nodes, [])
    expect(steps).toHaveLength(1)
    expect(steps[0].type).toBe('tool_call')
    if (steps[0].type === 'tool_call') {
      expect(steps[0].tool).toBe('web_search')
    }
  })
})

describe('roundtrip: steps → nodes/edges → steps', () => {
  it('linear flow roundtrips', () => {
    const original: WorkflowStep[] = [llm('a'), llm('b'), llm('c')]
    const { nodes, edges } = stepsToReactFlow(original)
    const result = reactFlowToSteps(nodes, edges)
    expect(result).toEqual(original)
  })

  it('branch flow roundtrips', () => {
    const original: WorkflowStep[] = [
      condition('cond', [{ when: { eq: 'yes' }, goto: 'b' }, { when: { eq: 'no' }, goto: 'c' }], 'c'),
      llm('b'),
      llm('c'),
    ]
    const { nodes, edges } = stepsToReactFlow(original)
    const result = reactFlowToSteps(nodes, edges)
    expect(result).toEqual(original)
  })

  it('mixed types roundtrips', () => {
    const original: WorkflowStep[] = [
      llm('a', 'analyze'),
      tool('b', 'web_search'),
      condition('c', [{ when: { eq: 'done' }, goto: 'd' }], 'd'),
      llm('d', 'summarize'),
    ]
    const { nodes, edges } = stepsToReactFlow(original)
    const result = reactFlowToSteps(nodes, edges)
    expect(result).toEqual(original)
  })

  it('single node roundtrips', () => {
    const original: WorkflowStep[] = [tool('only', 'read_file')]
    const { nodes, edges } = stepsToReactFlow(original)
    const result = reactFlowToSteps(nodes, edges)
    expect(result).toEqual(original)
  })

  it('condition with no branches and no default roundtrips', () => {
    const original: WorkflowStep[] = [
      condition('cond', []),
      llm('b'),
    ]
    const { nodes, edges } = stepsToReactFlow(original)
    const result = reactFlowToSteps(nodes, edges)
    // After roundtrip, condition should still have empty cases and no default
    const cond = result.find(s => s.id === 'cond') as ConditionStep
    expect(cond.cases).toEqual([])
    expect(cond.default).toBeUndefined()
  })
})

describe('generateStepId', () => {
  it('returns step_1 when no existing ids', () => {
    expect(generateStepId(new Set())).toBe('step_1')
  })

  it('increments past existing ids', () => {
    expect(generateStepId(new Set(['step_1', 'step_2']))).toBe('step_3')
  })

  it('skips gaps in numbering', () => {
    expect(generateStepId(new Set(['step_1', 'step_3']))).toBe('step_2')
  })

  it('handles non-numeric suffixes', () => {
    expect(generateStepId(new Set(['step_abc', 'step_xyz']))).toBe('step_1')
  })

  it('uses custom prefix', () => {
    expect(generateStepId(new Set(), 'node')).toBe('node_1')
    expect(generateStepId(new Set(['node_1', 'node_2']), 'node')).toBe('node_3')
  })
})