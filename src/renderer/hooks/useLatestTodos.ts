import { useMemo } from 'react'
import { getLatestTodosFromThoughts, type TodoItem } from '../components/tool/TodoCard'
import type { Thought } from '../types'

/**
 * Extracts the latest todo list from a thoughts array.
 * Returns null when no TodoWrite entries exist.
 */
export function useLatestTodos(thoughts: Thought[]): TodoItem[] | null {
  return useMemo(() => getLatestTodosFromThoughts(thoughts), [thoughts])
}
