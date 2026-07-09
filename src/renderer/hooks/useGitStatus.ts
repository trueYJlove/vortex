import { useState, useCallback, useEffect, useRef } from 'react'
import { api } from '../api'
import type { GitFileStatus } from '../../shared/rpc/contracts/git.contract'
import { useChatStore } from '../stores/chat.store'

interface UseGitStatusResult {
  files: GitFileStatus[]
  branch: string | null
  refresh: () => void
  isEmpty: boolean
  loading: boolean
}

export function useGitStatus(spaceId: string): UseGitStatusResult {
  const [files, setFiles] = useState<GitFileStatus[]>([])
  const [branch, setBranch] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const prevIsGeneratingRef = useRef(false)
  const spaceIdRef = useRef(spaceId)

  const fetchStatus = useCallback(async () => {
    if (!spaceId) {
      setFiles([])
      setBranch(null)
      setLoading(false)
      return
    }

    setLoading(true)
    spaceIdRef.current = spaceId

    try {
      const result = await api.gitStatus(spaceId)
      // Guard against stale response if spaceId changed mid-flight
      if (spaceIdRef.current !== spaceId) return
      if (result.success && result.data) {
        setFiles(result.data.files)
        setBranch(result.data.branch)
      }
    } catch (err) {
      console.error('[useGitStatus] Failed to fetch git status:', err)
    } finally {
      if (spaceIdRef.current === spaceId) {
        setLoading(false)
      }
    }
  }, [spaceId])

  // Fetch on mount and when spaceId changes
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Auto-refresh when AI response completes (isGenerating transitions true -> false)
  useEffect(() => {
    const unsub = useChatStore.subscribe((state) => {
      // Only auto-refresh for the current space
      if (state.currentSpaceId !== spaceId) return

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
  }, [fetchStatus, spaceId])

  return {
    files,
    branch,
    refresh: fetchStatus,
    isEmpty: files.length === 0,
    loading,
  }
}
