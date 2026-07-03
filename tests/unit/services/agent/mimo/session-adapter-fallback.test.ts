import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const subscribeMock = vi.fn()
const getMimoInstalledSkillsMock = vi.fn(() => [] as string[])
const getMimoSkillContentMock = vi.fn(() => null as string | null)

vi.mock('../../../../../src/main/services/agent/mimo/transport', () => ({
  startMimoServer: vi.fn(async () => ({
    url: 'http://127.0.0.1:43210',
    client: {
      session: {
        create: vi.fn(async () => ({ data: { id: 'mimo-session-1' } })),
        abort: vi.fn(async () => ({})),
      },
      config: {
        providers: vi.fn(async () => ({ data: {} })),
        update: vi.fn(async () => ({})),
      },
      event: {
        subscribe: subscribeMock,
      },
    },
    close: vi.fn(),
  })),
}))

vi.mock('../../../../../src/main/services/agent/mimo/skill-context', () => ({
  getMimoInstalledSkills: getMimoInstalledSkillsMock,
  getMimoSkillContent: getMimoSkillContentMock,
}))

describe('MimoSession HTTP fallback', () => {
  beforeEach(() => {
    subscribeMock.mockReset()
    getMimoInstalledSkillsMock.mockReset()
    getMimoInstalledSkillsMock.mockReturnValue([])
    getMimoSkillContentMock.mockReset()
    getMimoSkillContentMock.mockReturnValue(null)
    vi.stubGlobal('EventSource', undefined)
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({
        info: {
          id: 'assistant-message-1',
          role: 'assistant',
          modelID: 'mimo-test-model',
          tokens: { input: 10, output: 5, reasoning: 3, cache: { read: 0, write: 0 } },
        },
        parts: [
          { id: 'reasoning-1', type: 'reasoning', text: 'Inspecting the request before answering.' },
          { id: 'text-1', type: 'text', text: 'Done.' },
        ],
      }),
    })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('replays reasoning parts as thinking stream events when realtime events are unavailable', async () => {
    subscribeMock.mockRejectedValueOnce(new Error('subscription unavailable'))

    const { MimoSession } = await import('../../../../../src/main/services/agent/mimo/session-adapter')
    const session = await MimoSession.create({ model: 'mimo-test-model' })

    session.send('hello')

    const frames: any[] = []
    for await (const frame of session.stream()) {
      frames.push(frame)
    }

    const streamEvents = frames
      .filter((frame) => frame?.type === 'stream_event')
      .map((frame) => frame.event)

    expect(streamEvents).toContainEqual({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'thinking', thinking: '' },
    })
    expect(streamEvents).toContainEqual({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'thinking_delta', thinking: 'Inspecting the request before answering.' },
    })
    expect(frames[frames.length - 1]).toMatchObject({ type: 'result', subtype: 'success' })

    await session.close()
  })

  it('emits an error result when the prompt endpoint fails', async () => {
    subscribeMock.mockRejectedValueOnce(new Error('subscription unavailable'))
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: async () => 'Bad Gateway',
    } as Response)

    const { MimoSession } = await import('../../../../../src/main/services/agent/mimo/session-adapter')
    const session = await MimoSession.create({ model: 'mimo-test-model' })

    session.send('hello')

    const frames: any[] = []
    for await (const frame of session.stream()) {
      frames.push(frame)
    }

    expect(frames[frames.length - 1]).toMatchObject({
      type: 'result',
      subtype: 'error',
    })
    expect(frames[frames.length - 1].error.message).toContain('502')

    await session.close()
  })

  it('streams reasoning events before the prompt endpoint completes', async () => {
    let releasePrompt: (() => void) | null = null
    const promptCanComplete = new Promise<void>((resolve) => { releasePrompt = resolve })

    vi.mocked(fetch).mockImplementationOnce(async () => {
      await promptCanComplete
      return {
        ok: true,
        text: async () => JSON.stringify({
          info: { id: 'assistant-message-1', role: 'assistant', modelID: 'mimo-test-model' },
          parts: [{ id: 'text-1', type: 'text', text: 'Done.' }],
        }),
      } as Response
    })

    subscribeMock.mockResolvedValueOnce({
      stream: (async function* () {
        yield {
          type: 'message.updated',
          properties: { info: { id: 'assistant-message-1', role: 'assistant' } },
        }
        yield {
          type: 'message.part.updated',
          properties: { part: { id: 'reasoning-1', type: 'reasoning', text: '' } },
        }
        yield {
          type: 'message.part.delta',
          properties: { partID: 'reasoning-1', field: 'text', delta: 'Thinking while the request is running.' },
        }
        yield {
          type: 'session.idle',
          properties: {},
        }
      })(),
    })

    const { MimoSession } = await import('../../../../../src/main/services/agent/mimo/session-adapter')
    const session = await MimoSession.create({ model: 'mimo-test-model' })

    session.send('hello')

    const iterator = session.stream()
    const nextFrame = () => Promise.race([
      iterator.next(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out waiting for realtime frame')), 50)),
    ])

    const firstFrame = await nextFrame()
    const secondFrame = await nextFrame()
    const thirdFrame = await nextFrame()

    expect(firstFrame.value).toMatchObject({ type: 'system', subtype: 'init' })
    expect(secondFrame.value).toMatchObject({ type: 'stream_event', event: { type: 'message_start' } })
    expect(thirdFrame.value).toMatchObject({
      type: 'stream_event',
      event: {
        type: 'content_block_start',
        content_block: { type: 'thinking', thinking: '' },
      },
    })

    releasePrompt?.()
    await session.close()
  })
})
