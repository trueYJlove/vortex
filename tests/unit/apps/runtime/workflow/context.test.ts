/**
 * Unit Tests: apps/runtime/workflow — Variable Resolution
 *
 * Covers: resolveVariables (single/multiple/unresolvable references),
 * resolveObject (nested resolution), edge cases.
 */

import { describe, it, expect } from 'vitest'
import { resolveVariables, resolveObject } from '../../../../../src/main/apps/runtime/workflow/context'
import { VariableResolutionError } from '../../../../../src/main/apps/runtime/workflow/types'
import type { WorkflowContext } from '../../../../../src/main/apps/runtime/workflow/types'

function makeContext(overrides?: Partial<WorkflowContext>): WorkflowContext {
  return {
    trigger: { url: 'https://example.com', type: 'schedule' },
    memory: { lowest_price: 99.5, last_check: '2026-07-10' },
    steps: {
      step_1: { price: '120', status: 'ok' },
      step_2: { result: 'done' },
    },
    ...overrides,
  }
}

describe('resolveVariables', () => {
  it("'${step_1.price}' resolves from context.steps", () => {
    const ctx = makeContext()
    expect(resolveVariables('${step_1.price}', ctx)).toBe('120')
  })

  it("'${memory.lowest_price}' resolves from context.memory", () => {
    const ctx = makeContext()
    expect(resolveVariables('${memory.lowest_price}', ctx)).toBe('99.5')
  })

  it("'${trigger.url}' resolves from context.trigger", () => {
    const ctx = makeContext()
    expect(resolveVariables('${trigger.url}', ctx)).toBe('https://example.com')
  })

  it('multiple references in one string', () => {
    const ctx = makeContext()
    const result = resolveVariables(
      'Price: ${step_1.price}, URL: ${trigger.url}',
      ctx
    )
    expect(result).toBe('Price: 120, URL: https://example.com')
  })

  it('no references → returns original string', () => {
    const ctx = makeContext()
    expect(resolveVariables('Hello, world!', ctx)).toBe('Hello, world!')
  })

  it('unresolvable reference → throws VariableResolutionError', () => {
    const ctx = makeContext()
    expect(() => resolveVariables('${step_99.unknown}', ctx)).toThrow(VariableResolutionError)
  })

  it('nested field ${step_1.output.price} → context.steps.step_1.output.price', () => {
    const ctx = makeContext({
      steps: {
        step_1: {
          output: { price: '250' },
        },
      },
    })
    expect(resolveVariables('${step_1.output.price}', ctx)).toBe('250')
  })

  it('unresolvable memory reference → throws', () => {
    const ctx = makeContext()
    expect(() => resolveVariables('${memory.nonexistent}', ctx)).toThrow(VariableResolutionError)
  })

  it('unresolvable trigger reference → throws', () => {
    const ctx = makeContext()
    expect(() => resolveVariables('${trigger.nonexistent}', ctx)).toThrow(VariableResolutionError)
  })

  it('stringify non-string values', () => {
    const ctx = makeContext({
      steps: { calc: { count: 42, active: true } },
    })
    expect(resolveVariables('${calc.count}', ctx)).toBe('42')
    expect(resolveVariables('${calc.active}', ctx)).toBe('true')
  })
})

describe('resolveObject', () => {
  const ctx = makeContext()

  it('resolves all string values in object', () => {
    const input = {
      url: '${trigger.url}',
      price: '${step_1.price}',
      note: 'static text',
    }
    const result = resolveObject(input, ctx)
    expect(result).toEqual({
      url: 'https://example.com',
      price: '120',
      note: 'static text',
    })
  })

  it('leaves non-string values unchanged', () => {
    const input = {
      count: 42,
      active: true,
      items: [1, 2, 3],
    }
    const result = resolveObject(input, ctx)
    expect(result).toEqual(input)
  })

  it('handles nested objects', () => {
    const input = {
      query: {
        url: '${trigger.url}',
        status: '${step_1.status}',
      },
      meta: '${step_2.result}',
    }
    const result = resolveObject(input, ctx)
    expect(result).toEqual({
      query: {
        url: 'https://example.com',
        status: 'ok',
      },
      meta: 'done',
    })
  })

  it('empty object returns empty object', () => {
    expect(resolveObject({}, ctx)).toEqual({})
  })
})