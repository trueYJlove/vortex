import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMock = {
  listConversations: vi.fn(),
  deleteConversation: vi.fn(),
  createConversation: vi.fn(),
  ensureSessionWarm: vi.fn(async () => ({ success: true })),
}

vi.mock('../../../src/renderer/api', () => ({ api: apiMock }))
vi.mock('../../../src/renderer/services/canvas-lifecycle', () => ({
  canvasLifecycle: {
    enterSpace: vi.fn(),
    showActiveBrowserView: vi.fn(),
    hideAllBrowserViews: vi.fn(),
  },
}))

describe('chat clear conversations', () => {
  beforeEach(() => {
    vi.resetModules()
    apiMock.listConversations.mockReset()
    apiMock.deleteConversation.mockReset()
    apiMock.createConversation.mockReset()
    apiMock.ensureSessionWarm.mockReset()
    apiMock.ensureSessionWarm.mockResolvedValue({ success: true })
  })

  it('clears all conversations in a space and creates a fresh selected conversation', async () => {
    const { useChatStore } = await import('../../../src/renderer/stores/chat.store')

    apiMock.listConversations.mockResolvedValue({
      success: true,
      data: [
        { id: 'conversation-1', spaceId: 'space-1', title: 'One', createdAt: 'a', updatedAt: 'a', messageCount: 1, starred: true },
        { id: 'conversation-2', spaceId: 'space-1', title: 'Two', createdAt: 'b', updatedAt: 'b', messageCount: 2 },
      ],
    })
    apiMock.deleteConversation.mockResolvedValue({ success: true })
    apiMock.createConversation.mockResolvedValue({
      success: true,
      data: {
        id: 'fresh-conversation',
        spaceId: 'space-1',
        title: 'New Conversation',
        createdAt: '2026-07-03T00:00:00.000Z',
        updatedAt: '2026-07-03T00:00:00.000Z',
        messages: [],
      },
    })

    useChatStore.setState({
      currentSpaceId: 'space-1',
      spaceStates: new Map([
        ['space-1', {
          currentConversationId: 'conversation-1',
          conversations: [
            { id: 'conversation-1', spaceId: 'space-1', title: 'One', createdAt: 'a', updatedAt: 'a', messageCount: 1, starred: true },
            { id: 'conversation-2', spaceId: 'space-1', title: 'Two', createdAt: 'b', updatedAt: 'b', messageCount: 2 },
          ],
        }],
      ]),
      conversationCache: new Map([
        ['conversation-1', { id: 'conversation-1' } as any],
        ['conversation-2', { id: 'conversation-2' } as any],
      ]),
      sessions: new Map([
        ['conversation-1', { isGenerating: false } as any],
        ['conversation-2', { isGenerating: false } as any],
      ]),
      unseenCompletions: new Map([['conversation-1', { spaceId: 'space-1', title: 'One' }]]),
      pulseReadAt: new Map([['conversation-2', { readAt: 1, originalStatus: 'error', spaceId: 'space-1', title: 'Two' }]]),
    } as any)

    const result = await useChatStore.getState().clearConversations('space-1')

    expect(result).toBe(true)
    expect(apiMock.listConversations).toHaveBeenCalledWith('space-1')
    expect(apiMock.deleteConversation).toHaveBeenCalledWith('space-1', 'conversation-1')
    expect(apiMock.deleteConversation).toHaveBeenCalledWith('space-1', 'conversation-2')
    expect(apiMock.createConversation).toHaveBeenCalledWith('space-1')
    expect(useChatStore.getState().spaceStates.get('space-1')?.conversations.map(c => c.id)).toEqual(['fresh-conversation'])
    expect(useChatStore.getState().spaceStates.get('space-1')?.currentConversationId).toBe('fresh-conversation')
    expect(useChatStore.getState().conversationCache.has('conversation-1')).toBe(false)
    expect(useChatStore.getState().conversationCache.has('conversation-2')).toBe(false)
    expect(useChatStore.getState().sessions.has('conversation-1')).toBe(false)
    expect(useChatStore.getState().sessions.has('conversation-2')).toBe(false)
    expect(useChatStore.getState().unseenCompletions.has('conversation-1')).toBe(false)
    expect(useChatStore.getState().pulseReadAt.has('conversation-2')).toBe(false)
  })

  it('deletes conversations from the backend list instead of the loaded local list', async () => {
    const { useChatStore } = await import('../../../src/renderer/stores/chat.store')

    apiMock.listConversations.mockResolvedValue({
      success: true,
      data: [
        { id: 'conversation-1', spaceId: 'space-1', title: 'One', createdAt: 'a', updatedAt: 'a', messageCount: 1 },
        { id: 'conversation-2', spaceId: 'space-1', title: 'Two', createdAt: 'b', updatedAt: 'b', messageCount: 2 },
      ],
    })
    apiMock.deleteConversation.mockResolvedValue({ success: true })
    apiMock.createConversation.mockResolvedValue({
      success: true,
      data: {
        id: 'fresh-conversation',
        spaceId: 'space-1',
        title: 'New Conversation',
        createdAt: '2026-07-03T00:00:00.000Z',
        updatedAt: '2026-07-03T00:00:00.000Z',
        messages: [],
      },
    })

    useChatStore.setState({
      currentSpaceId: 'space-1',
      spaceStates: new Map([
        ['space-1', {
          currentConversationId: 'conversation-1',
          conversations: [
            { id: 'conversation-1', spaceId: 'space-1', title: 'One', createdAt: 'a', updatedAt: 'a', messageCount: 1 },
          ],
        }],
      ]),
    } as any)

    const result = await useChatStore.getState().clearConversations('space-1')

    expect(result).toBe(true)
    expect(apiMock.deleteConversation).toHaveBeenCalledWith('space-1', 'conversation-1')
    expect(apiMock.deleteConversation).toHaveBeenCalledWith('space-1', 'conversation-2')
  })

  it('reloads local state when any backend deletion fails after a partial deletion', async () => {
    const { useChatStore } = await import('../../../src/renderer/stores/chat.store')

    apiMock.listConversations
      .mockResolvedValueOnce({
        success: true,
        data: [
          { id: 'conversation-1', spaceId: 'space-1', title: 'One', createdAt: 'a', updatedAt: 'a', messageCount: 1 },
          { id: 'conversation-2', spaceId: 'space-1', title: 'Two', createdAt: 'b', updatedAt: 'b', messageCount: 2 },
        ],
      })
      .mockResolvedValueOnce({
        success: true,
        data: [
          { id: 'conversation-2', spaceId: 'space-1', title: 'Two', createdAt: 'b', updatedAt: 'b', messageCount: 2 },
        ],
      })
    apiMock.deleteConversation
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false })

    useChatStore.setState({
      currentSpaceId: 'space-1',
      spaceStates: new Map([
        ['space-1', {
          currentConversationId: 'conversation-1',
          conversations: [
            { id: 'conversation-1', spaceId: 'space-1', title: 'One', createdAt: 'a', updatedAt: 'a', messageCount: 1 },
            { id: 'conversation-2', spaceId: 'space-1', title: 'Two', createdAt: 'b', updatedAt: 'b', messageCount: 2 },
          ],
        }],
      ]),
      conversationCache: new Map([
        ['conversation-1', { id: 'conversation-1' } as any],
        ['conversation-2', { id: 'conversation-2' } as any],
      ]),
    } as any)

    const result = await useChatStore.getState().clearConversations('space-1')

    expect(result).toBe(false)
    expect(apiMock.createConversation).not.toHaveBeenCalled()
    expect(apiMock.listConversations).toHaveBeenCalledTimes(2)
    expect(useChatStore.getState().spaceStates.get('space-1')?.conversations.map(c => c.id)).toEqual(['conversation-2'])
    expect(useChatStore.getState().spaceStates.get('space-1')?.currentConversationId).toBe('conversation-2')
    expect(useChatStore.getState().conversationCache.has('conversation-1')).toBe(false)
    expect(useChatStore.getState().conversationCache.has('conversation-2')).toBe(true)
  })

  it('reloads local state when a delete request throws after a partial deletion', async () => {
    const { useChatStore } = await import('../../../src/renderer/stores/chat.store')

    apiMock.listConversations
      .mockResolvedValueOnce({
        success: true,
        data: [
          { id: 'conversation-1', spaceId: 'space-1', title: 'One', createdAt: 'a', updatedAt: 'a', messageCount: 1 },
          { id: 'conversation-2', spaceId: 'space-1', title: 'Two', createdAt: 'b', updatedAt: 'b', messageCount: 2 },
        ],
      })
      .mockResolvedValueOnce({
        success: true,
        data: [
          { id: 'conversation-2', spaceId: 'space-1', title: 'Two', createdAt: 'b', updatedAt: 'b', messageCount: 2 },
        ],
      })
    apiMock.deleteConversation
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('disk unavailable'))

    useChatStore.setState({
      currentSpaceId: 'space-1',
      spaceStates: new Map([
        ['space-1', {
          currentConversationId: 'conversation-1',
          conversations: [
            { id: 'conversation-1', spaceId: 'space-1', title: 'One', createdAt: 'a', updatedAt: 'a', messageCount: 1 },
            { id: 'conversation-2', spaceId: 'space-1', title: 'Two', createdAt: 'b', updatedAt: 'b', messageCount: 2 },
          ],
        }],
      ]),
      conversationCache: new Map([
        ['conversation-1', { id: 'conversation-1' } as any],
        ['conversation-2', { id: 'conversation-2' } as any],
      ]),
    } as any)

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const result = await useChatStore.getState().clearConversations('space-1')

    expect(result).toBe(false)
    expect(apiMock.listConversations).toHaveBeenCalledTimes(2)
    expect(useChatStore.getState().spaceStates.get('space-1')?.conversations.map(c => c.id)).toEqual(['conversation-2'])
    expect(useChatStore.getState().spaceStates.get('space-1')?.currentConversationId).toBe('conversation-2')
    expect(useChatStore.getState().conversationCache.has('conversation-1')).toBe(false)
    expect(useChatStore.getState().conversationCache.has('conversation-2')).toBe(true)
    consoleError.mockRestore()
  })

  it('reloads conversations and reports failure when creating the fresh conversation fails', async () => {
    const { useChatStore } = await import('../../../src/renderer/stores/chat.store')

    apiMock.listConversations
      .mockResolvedValueOnce({
        success: true,
        data: [
          { id: 'conversation-1', spaceId: 'space-1', title: 'One', createdAt: 'a', updatedAt: 'a', messageCount: 1 },
          { id: 'conversation-2', spaceId: 'space-1', title: 'Two', createdAt: 'b', updatedAt: 'b', messageCount: 2 },
        ],
      })
      .mockResolvedValueOnce({ success: true, data: [] })
    apiMock.deleteConversation.mockResolvedValue({ success: true })
    apiMock.createConversation.mockResolvedValue({ success: false })

    useChatStore.setState({
      currentSpaceId: 'space-1',
      spaceStates: new Map([
        ['space-1', {
          currentConversationId: 'conversation-1',
          conversations: [
            { id: 'conversation-1', spaceId: 'space-1', title: 'One', createdAt: 'a', updatedAt: 'a', messageCount: 1 },
            { id: 'conversation-2', spaceId: 'space-1', title: 'Two', createdAt: 'b', updatedAt: 'b', messageCount: 2 },
          ],
        }],
      ]),
    } as any)

    const result = await useChatStore.getState().clearConversations('space-1')

    expect(result).toBe(false)
    expect(apiMock.listConversations).toHaveBeenCalledTimes(2)
    expect(useChatStore.getState().spaceStates.get('space-1')?.conversations).toEqual([])
    expect(useChatStore.getState().spaceStates.get('space-1')?.currentConversationId).toBeNull()
  })
})
