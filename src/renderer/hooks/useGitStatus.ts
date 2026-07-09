import { useState, useCallback, useEffect, useRef } from 'react'
import { api } from '../api'
import type { GitFileStatus } from '../../shared/rpc/contracts/git.contract'
import { useChatStore } from '../stores/chat.store'

interface UseGitStatusResult {
  files: GitFileStatus[]
  branch: string | null
  refresh: () => void
  isEmpty: boolean
}

export function useGitStatus(spaceId: string): UseGitStatusResult {
  const [files, setFiles] = useState<GitFileStatus[]>([])
  const [branch, setBranch] = useState<string | null>(null)
  const prevIsGeneratingRef = useRef(false)

  const fetchStatus = useCallback(async () => {
    try {
      const result = await api.gitStatus(spaceId)
      if (result.success && result.data) {
        setFiles(result.data.files)
        setBranch(result.data.branch)
      }
    } catch (err) {
      console.error('[useGitStatus] Failed to fetch git status:', err)
    }
  }, [spaceId])

  // Fetch on mount
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Auto-refresh when AI response completes (isGenerating transitions true -> false)
  useEffect(() => {
    const unsub = useChatStore.subscribe((state) => {
      const spaceState = state.currentSpaceId
        ? state.spaceStates.get(state.currentSpaceId)
        : null
      const session = spaceState?.currentConversationId
        ? state.sessions.get(spaceState.currentConversationId)
        : undefined
      const isGenerating = session?.isGenerating ?? false

      if (prevIsGeneratingRef.current && !isGenerating) {
        fetchStatus()
      }
      prevIsGeneratingRef.current = isGenerating
    })

    return unsub
  }, [fetchStatus])

  return {
    files,
    branch,
    refresh: fetchStatus,
    isEmpty: files.length === 0,
  }
}
