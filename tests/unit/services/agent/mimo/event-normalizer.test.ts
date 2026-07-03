import { describe, expect, it } from 'vitest'
import { MimoEventNormalizer } from '../../../../../src/main/services/agent/mimo/event-normalizer'

const event = (type: string, properties: Record<string, any>) => ({ type, properties })
const streamEvents = (frames: any[]) => frames.filter(frame => frame?.type === 'stream_event').map(frame => frame.event)

describe('MimoEventNormalizer', () => {
  it('emits thinking deltas for reasoning parts', () => {
    const normalizer = new MimoEventNormalizer({ sessionId: 'session-1', model: 'mimo-test' })

    const frames = [
      ...normalizer.normalize(event('message.updated', { info: { id: 'message-1', role: 'assistant' } })),
      ...normalizer.normalize(event('message.part.updated', { part: { id: 'reasoning-1', type: 'reasoning', text: '' } })),
      ...normalizer.normalize(event('message.part.delta', { partID: 'reasoning-1', field: 'text', delta: 'Thinking now.' })),
    ]

    expect(streamEvents(frames)).toContainEqual({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'thinking', thinking: '' },
    })
    expect(streamEvents(frames)).toContainEqual({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'thinking_delta', thinking: 'Thinking now.' },
    })
  })

  it('emits tool input json deltas before closing a tool block', () => {
    const normalizer = new MimoEventNormalizer({ sessionId: 'session-1', model: 'mimo-test' })

    const frames = [
      ...normalizer.normalize(event('message.updated', { info: { id: 'message-1', role: 'assistant' } })),
      ...normalizer.normalize(event('message.part.updated', {
        part: {
          id: 'tool-part-1',
          type: 'tool',
          callID: 'tool-call-1',
          tool: 'read',
          state: { input: { file_path: '/tmp/a.txt' } },
        },
      })),
    ]

    expect(streamEvents(frames)).toContainEqual({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 'tool-call-1', name: 'Read', input: {} },
    })
    expect(streamEvents(frames)).toContainEqual({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: JSON.stringify({ file_path: '/tmp/a.txt' }) },
    })
  })

  it('emits assistant aggregate before matching tool result', () => {
    const normalizer = new MimoEventNormalizer({ sessionId: 'session-1', model: 'mimo-test' })

    const frames = [
      ...normalizer.normalize(event('message.updated', { info: { id: 'message-1', role: 'assistant' } })),
      ...normalizer.normalize(event('message.part.updated', {
        part: {
          id: 'tool-part-1',
          type: 'tool',
          callID: 'tool-call-1',
          tool: 'read',
          state: { input: { file_path: '/tmp/a.txt' } },
        },
      })),
      ...normalizer.normalize(event('message.part.updated', {
        part: {
          id: 'tool-part-1',
          type: 'tool',
          callID: 'tool-call-1',
          tool: 'read',
          state: { status: 'completed', input: { file_path: '/tmp/a.txt' }, output: 'file text' },
        },
      })),
    ]

    const assistantIndex = frames.findIndex(frame => frame?.type === 'assistant')
    const resultIndex = frames.findIndex(frame => frame?.type === 'user')

    expect(assistantIndex).toBeGreaterThan(-1)
    expect(resultIndex).toBeGreaterThan(-1)
    expect(assistantIndex).toBeLessThan(resultIndex)
    expect(frames[assistantIndex]).toMatchObject({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'tool-call-1', name: 'Read', input: { file_path: '/tmp/a.txt' } },
        ],
      },
    })
  })
})
