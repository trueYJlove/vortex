/**
 * Unit Tests: apps/runtime/workflow/nodes — Condition Node
 *
 * Covers: all operators (eq, neq, contains, matches, gt, lt, gte, lte),
 * case iteration order, default fallback, error cases.
 */

import { describe, it, expect } from 'vitest'
import { executeConditionNode, NoMatchingCaseError } from '../../../../../../src/main/apps/runtime/workflow/nodes/condition'
import type { WorkflowContext } from '../../../../../../src/main/apps/runtime/workflow/types'

const baseCtx: WorkflowContext = {
  trigger: { type: 'schedule' },
  memory: { threshold: 100 },
  steps: {
    step_1: { price: 120, status: 'ok' },
  },
}

describe('executeConditionNode', () => {
  it('eq operator: match → goto target', async () => {
    const result = await executeConditionNode(
      {
        id: 'cond',
        type: 'condition',
        input: '${step_1.status}',
        cases: [{ when: { eq: 'ok' }, goto: 'step_2' }],
        default: 'step_3',
      },
      baseCtx,
    )

    expect(result.status).toBe('completed')
    expect(result.nextNodeId).toBe('step_2')
  })

  it('eq operator: no match → falls through to next case', async () => {
    const result = await executeConditionNode(
      {
        id: 'cond',
        type: 'condition',
        input: '${step_1.status}',
        cases: [
          { when: { eq: 'error' }, goto: 'error_handler' },
          { when: { eq: 'ok' }, goto: 'step_2' },
        ],
        default: 'step_3',
      },
      baseCtx,
    )

    expect(result.nextNodeId).toBe('step_2')
  })

  it('contains operator (string)', async () => {
    const ctx: WorkflowContext = {
      ...baseCtx,
      steps: { step_1: { text: 'hello world' } },
    }

    const result = await executeConditionNode(
      {
        id: 'cond',
        type: 'condition',
        input: '${step_1.text}',
        cases: [{ when: { contains: 'world' }, goto: 'found' }],
      },
      ctx,
    )

    expect(result.nextNodeId).toBe('found')
  })

  it('neq operator', async () => {
    const result = await executeConditionNode(
      {
        id: 'cond',
        type: 'condition',
        input: '${step_1.status}',
        cases: [{ when: { neq: 'error' }, goto: 'step_2' }],
      },
      baseCtx,
    )

    expect(result.nextNodeId).toBe('step_2')
  })

  it('matches operator (regex)', async () => {
    const ctx: WorkflowContext = {
      ...baseCtx,
      steps: { step_1: { email: 'user@example.com' } },
    }

    const result = await executeConditionNode(
      {
        id: 'cond',
        type: 'condition',
        input: '${step_1.email}',
        cases: [{ when: { matches: '^.+@.+\\..+$' }, goto: 'valid' }],
      },
      ctx,
    )

    expect(result.nextNodeId).toBe('valid')
  })

  it('gt operator', async () => {
    const result = await executeConditionNode(
      {
        id: 'cond',
        type: 'condition',
        input: '${step_1.price}',
        cases: [{ when: { gt: 100 }, goto: 'above_threshold' }],
        default: 'below_threshold',
      },
      baseCtx,
    )

    expect(result.nextNodeId).toBe('above_threshold')
  })

  it('lt operator', async () => {
    const result = await executeConditionNode(
      {
        id: 'cond',
        type: 'condition',
        input: '${step_1.price}',
        cases: [{ when: { lt: 200 }, goto: 'affordable' }],
      },
      baseCtx,
    )

    expect(result.nextNodeId).toBe('affordable')
  })

  it('gte operator', async () => {
    const result = await executeConditionNode(
      {
        id: 'cond',
        type: 'condition',
        input: '${step_1.price}',
        cases: [{ when: { gte: 120 }, goto: 'at_least_120' }],
      },
      baseCtx,
    )

    expect(result.nextNodeId).toBe('at_least_120')
  })

  it('lte operator', async () => {
    const result = await executeConditionNode(
      {
        id: 'cond',
        type: 'condition',
        input: '${step_1.price}',
        cases: [{ when: { lte: 120 }, goto: 'at_most_120' }],
      },
      baseCtx,
    )

    expect(result.nextNodeId).toBe('at_most_120')
  })

  it('no case matches, has default → goto default', async () => {
    const result = await executeConditionNode(
      {
        id: 'cond',
        type: 'condition',
        input: '${step_1.status}',
        cases: [{ when: { eq: 'error' }, goto: 'error_handler' }],
        default: 'fallback',
      },
      baseCtx,
    )

    expect(result.nextNodeId).toBe('fallback')
  })

  it('no case matches, no default → throws NoMatchingCaseError', async () => {
    await expect(executeConditionNode(
      {
        id: 'cond',
        type: 'condition',
        input: '${step_1.status}',
        cases: [{ when: { eq: 'error' }, goto: 'error_handler' }],
      },
      baseCtx,
    )).rejects.toThrow(NoMatchingCaseError)
  })

  it('input variable resolved before evaluation', async () => {
    const result = await executeConditionNode(
      {
        id: 'cond',
        type: 'condition',
        input: '${memory.threshold}',
        cases: [{ when: { eq: '100' }, goto: 'step_2' }],
      },
      baseCtx,
    )

    expect(result.nextNodeId).toBe('step_2')
  })
})