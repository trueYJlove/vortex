/**
 * Unit Tests: apps/runtime/workflow/nodes — Tool Call Node
 *
 * Covers: param resolution, tool handler lookup, error handling.
 */

import { describe, it, expect, vi } from 'vitest'
import { executeToolCallNode, type ToolHandler } from '../../../../../../src/main/apps/runtime/workflow/nodes/tool-call'

describe('executeToolCallNode', () => {
  const baseCtx = {
    trigger: { url: 'https://example.com' },
    memory: { api_key: 'test-key' },
    steps: {
      step_1: { price: '120' },
    },
  }

  it('params resolved, tool called, output returned', async () => {
    const handler: ToolHandler = vi.fn().mockResolvedValue({ result: 'success' })

    const result = await executeToolCallNode(
      {
        id: 'step_2',
        type: 'tool_call',
        tool: 'my_tool',
        params: { url: '${trigger.url}' },
      },
      baseCtx,
      { tools: { my_tool: handler } },
    )

    expect(result.nodeId).toBe('step_2')
    expect(result.status).toBe('completed')
    expect(result.output).toEqual({ result: { result: 'success' } })
    expect(handler).toHaveBeenCalledWith({ url: 'https://example.com' })
  })

  it('tool error → NodeRunResult with error status', async () => {
    const handler: ToolHandler = vi.fn().mockRejectedValue(new Error('Tool failed'))

    const result = await executeToolCallNode(
      {
        id: 'step_2',
        type: 'tool_call',
        tool: 'failing_tool',
        params: {},
      },
      baseCtx,
      { tools: { failing_tool: handler } },
    )

    expect(result.status).toBe('error')
    expect(result.error).toBe('Tool failed')
  })

  it('missing tool → error with message', async () => {
    const result = await executeToolCallNode(
      {
        id: 'step_2',
        type: 'tool_call',
        tool: 'nonexistent_tool',
        params: {},
      },
      baseCtx,
      { tools: {} },
    )

    expect(result.status).toBe('error')
    expect(result.error).toContain('nonexistent_tool')
  })

  it('empty params if step.params is undefined', async () => {
    const handler: ToolHandler = vi.fn().mockResolvedValue(null)

    const result = await executeToolCallNode(
      {
        id: 'step_2',
        type: 'tool_call',
        tool: 'noop_tool',
      },
      baseCtx,
      { tools: { noop_tool: handler } },
    )

    expect(result.status).toBe('completed')
    expect(handler).toHaveBeenCalledWith({})
  })
})