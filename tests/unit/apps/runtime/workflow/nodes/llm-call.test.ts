/**
 * Unit Tests: apps/runtime/workflow/nodes — LLM Call Node
 *
 * Covers: prompt resolution, session creation, stream processing,
 * output extraction and mapping, with mocked SDK session.
 */

import { describe, it, expect, vi } from 'vitest'
import { executeLlmCallNode, type SdkSession } from '../../../../../../src/main/apps/runtime/workflow/nodes/llm-call'

async function* mockStream(chunks: unknown[]) {
  for (const chunk of chunks) {
    yield chunk
  }
}

function createMockSession(chunks: unknown[]): SdkSession {
  return {
    send: vi.fn().mockReturnValue(mockStream(chunks)),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

describe('executeLlmCallNode', () => {
  const baseCtx = {
    trigger: { url: 'https://example.com' },
    memory: { last_price: '100' },
    steps: {},
  }

  it('prompt resolved, session created, output extracted', async () => {
    const session = createMockSession([
      { type: 'text', text: 'Analysis complete.' },
    ])

    const result = await executeLlmCallNode(
      { id: 'step_1', type: 'llm_call', prompt: 'Analyze ${trigger.url}' },
      baseCtx,
      {
        createSession: async () => session,
        systemPrompt: 'You are a helpful assistant.',
        mcpServers: {},
      },
    )

    expect(result.nodeId).toBe('step_1')
    expect(result.status).toBe('completed')
    expect(result.output.llm_result).toBe('Analysis complete.')
  })

  it('output mapping extracts fields from JSON response', async () => {
    const jsonResponse = JSON.stringify({ price: 120, trend: 'up' })
    // Mock sends JSON in multiple text chunks
    const session = createMockSession([
      { type: 'text', text: 'Here is the result:\n' },
      { type: 'text', text: jsonResponse },
    ])

    const result = await executeLlmCallNode(
      {
        id: 'step_1',
        type: 'llm_call',
        prompt: 'Get prices',
        output: { price: 'price', trend: 'trend' },
      },
      baseCtx,
      {
        createSession: async () => session,
        systemPrompt: 'You are a helpful assistant.',
        mcpServers: {},
      },
    )

    expect(result.status).toBe('completed')
    expect(result.output.price).toBe(120)
    expect(result.output.trend).toBe('up')
  })

  it('output mapping with non-JSON response falls back to full text', async () => {
    const session = createMockSession([
      { type: 'text', text: 'The answer is 42.' },
    ])

    const result = await executeLlmCallNode(
      {
        id: 'step_1',
        type: 'llm_call',
        prompt: 'Compute',
        output: { answer: 'answer' },
      },
      baseCtx,
      {
        createSession: async () => session,
        systemPrompt: 'You are a helper.',
        mcpServers: {},
      },
    )

    expect(result.status).toBe('completed')
    expect(result.output.llm_result).toBe('The answer is 42.')
    expect(result.output.answer).toBe('The answer is 42.')
  })

  it('closes session even on error', async () => {
    const session = createMockSession([])
    // Make send throw
    vi.mocked(session.send).mockImplementationOnce(() => {
      throw new Error('Stream error')
    })

    let sessionClosed = false
    session.close = vi.fn().mockImplementation(async () => {
      sessionClosed = true
    })

    await expect(executeLlmCallNode(
      { id: 'step_1', type: 'llm_call', prompt: 'Test' },
      baseCtx,
      {
        createSession: async () => session,
        systemPrompt: 'Assistant.',
        mcpServers: {},
      },
    )).rejects.toThrow('Stream error')

    expect(sessionClosed).toBe(true)
  })

  it('content_block_delta chunks are collected', async () => {
    const session = createMockSession([
      { type: 'content_block_delta', content: 'Hello' },
      { type: 'content_block_delta', content: ' World' },
    ])

    const result = await executeLlmCallNode(
      { id: 's1', type: 'llm_call', prompt: 'Say hi' },
      baseCtx,
      {
        createSession: async () => session,
        systemPrompt: 'Be nice.',
        mcpServers: {},
      },
    )

    expect(result.output.llm_result).toBe('Hello World')
  })
})