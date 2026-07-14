/**
 * Unit Tests: apps/spec — Workflow Steps Schema & DAG Validation
 *
 * Covers: step schema parsing (llm_call, tool_call, condition),
 * workflow DAG validation (refs, cycles, terminals, duplicates).
 */

import { describe, it, expect } from 'vitest'
import { WorkflowStepSchema } from '../../../../src/main/apps/spec/schema'
import { validateWorkflowSteps } from '../../../../src/main/apps/spec/validate'

describe('workflow steps schema', () => {
  it('valid llm_call step parses', () => {
    const result = WorkflowStepSchema.parse({
      id: 'step_1',
      type: 'llm_call',
      prompt: 'Analyze the data',
      tools: ['web_search'],
      output: { result: 'analysis_result' },
    })
    expect(result.id).toBe('step_1')
    expect(result.type).toBe('llm_call')
  })

  it('valid tool_call step parses', () => {
    const result = WorkflowStepSchema.parse({
      id: 'step_2',
      type: 'tool_call',
      tool: 'web_search',
      params: { query: 'latest prices' },
    })
    expect(result.id).toBe('step_2')
    expect(result.type).toBe('tool_call')
  })

  it('valid condition step parses', () => {
    const result = WorkflowStepSchema.parse({
      id: 'step_3',
      type: 'condition',
      input: '${step_1.analysis_result}',
      cases: [
        { when: { eq: 'positive' }, goto: 'step_4' },
        { when: { eq: 'negative' }, goto: 'step_5' },
      ],
      default: 'step_6',
    })
    expect(result.id).toBe('step_3')
    expect(result.type).toBe('condition')
  })

  it('invalid step type rejected', () => {
    expect(() => WorkflowStepSchema.parse({ id: 'x', type: 'invalid' })).toThrow()
  })

  it('missing required fields rejected', () => {
    // llm_call without prompt
    expect(() => WorkflowStepSchema.parse({ id: 'x', type: 'llm_call' })).toThrow()
  })
})

describe('workflow DAG validation', () => {
  it('linear flow (three llm_call steps) valid', () => {
    const result = validateWorkflowSteps([
      { id: 'a', type: 'llm_call', prompt: 'step a' },
      { id: 'b', type: 'llm_call', prompt: 'step b' },
      { id: 'c', type: 'llm_call', prompt: 'step c' },
    ] as any)
    expect(result.valid).toBe(true)
  })

  it('conditional branch valid', () => {
    const result = validateWorkflowSteps([
      { id: 'a', type: 'condition', input: 'x', cases: [{ when: { eq: 'yes' }, goto: 'b' }, { when: { eq: 'no' }, goto: 'c' }], default: 'b' },
      { id: 'b', type: 'llm_call', prompt: 'yes path' },
      { id: 'c', type: 'llm_call', prompt: 'no path' },
    ] as any)
    expect(result.valid).toBe(true)
  })

  it('goto references non-existent node → error', () => {
    const result = validateWorkflowSteps([
      { id: 'a', type: 'condition', input: 'x', cases: [{ when: { eq: 'yes' }, goto: 'nonexistent' }] },
      { id: 'b', type: 'llm_call', prompt: 'step b' },
    ] as any)
    expect(result.valid).toBe(false)
    expect(result.issues.some(i => i.message.includes('nonexistent'))).toBe(true)
  })

  it('cycle detected → error', () => {
    const result = validateWorkflowSteps([
      { id: 'a', type: 'condition', input: 'x', cases: [{ when: { eq: 'yes' }, goto: 'b' }], default: 'b' },
      { id: 'b', type: 'condition', input: 'y', cases: [{ when: { eq: 'ok' }, goto: 'a' }] },
    ] as any)
    expect(result.valid).toBe(false)
    expect(result.issues.some(i => i.message.includes('Cycle'))).toBe(true)
  })

  it('no terminal node → error', () => {
    const result = validateWorkflowSteps([
      { id: 'a', type: 'condition', input: 'x', cases: [{ when: { eq: 'yes' }, goto: 'b' }], default: 'b' },
      { id: 'b', type: 'condition', input: 'y', cases: [{ when: { eq: 'ok' }, goto: 'a' }] },
    ] as any)
    expect(result.valid).toBe(false)
    expect(result.issues.some(i => i.message.includes('terminal'))).toBe(true)
  })

  it('condition with no cases and no default → error', () => {
    const result = validateWorkflowSteps([
      { id: 'a', type: 'condition', input: 'x', cases: [] },
      { id: 'b', type: 'llm_call', prompt: 'step b' },
    ] as any)
    expect(result.valid).toBe(false)
    expect(result.issues.some(i => i.message.includes('case'))).toBe(true)
  })

  it('empty steps array → valid', () => {
    const result = validateWorkflowSteps([])
    expect(result.valid).toBe(true)
  })
})
