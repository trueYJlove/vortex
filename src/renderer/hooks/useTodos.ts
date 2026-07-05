import { useMemo } from 'react'
import { useChatStore } from '../stores/chat.store'
import { getLatestTodosFromThoughts, getTodoStats, type TodoItem } from '../components/tool/TodoCard'

/**
 * Returns the current conversation's todo list (from thoughts or cached messages).
 * Returns null when no todos exist.
 */
export function useTodos(): TodoItem[] | null {
  return useChatStore(state => {
    const spaceState = state.spaceStates.get(state.currentSpaceId ?? '')
    const conversationId = spaceState?.currentConversationId
    if (!conversationId) return null

    const sessionTodos = getLatestTodosFromThoughts(state.sessions.get(conversationId)?.thoughts)
    if (sessionTodos?.length) return sessionTodos

    const conversation = state.conversationCache.get(conversationId)
    if (!conversation) return null

    for (let index = conversation.messages.length - 1; index >= 0; index -= 1) {
      const messageTodos = getLatestTodosFromThoughts(conversation.messages[index].thoughts)
      if (messageTodos?.length) return messageTodos
    }

    return null
  })
}

/**
 * Returns todo stats for the current conversation, or null if no todos.
 */
export function useTodoStats() {
  const todos = useTodos()
  return useMemo(() => todos ? getTodoStats(todos) : null, [todos])
}
