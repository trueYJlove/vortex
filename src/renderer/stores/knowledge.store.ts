/**
 * Knowledge Store — manages knowledge base document state for the current space.
 */
import { create } from 'zustand'
import { api } from '../api'
import type { KnowledgeDocument, KnowledgeSearchResult, UploadResult } from '../api/knowledge.api'

export interface IndexingStatus {
  type: 'indexing' | 'complete' | 'error'
  message: string
  sourcePath?: string
}

interface KnowledgeState {
  // Data
  documents: KnowledgeDocument[]
  searchResults: KnowledgeSearchResult[]
  isSearching: boolean
  isLoading: boolean
  isUploading: boolean
  error: string | null
  indexingStatus: IndexingStatus | null

  // Actions
  loadDocuments: (spaceId: string) => Promise<void>
  searchDocuments: (spaceId: string, query: string, topK?: number) => Promise<void>
  clearSearch: () => void
  deleteDocument: (spaceId: string, sourcePath: string) => Promise<void>
  uploadDocuments: (spaceId: string) => Promise<UploadResult | undefined>
  reindexDocuments: (spaceId: string) => Promise<void>
  subscribeToStatus: () => () => void
}

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  documents: [],
  searchResults: [],
  isSearching: false,
  isLoading: false,
  isUploading: false,
  error: null,
  indexingStatus: null,

  loadDocuments: async (spaceId: string) => {
    set({ isLoading: true, error: null })
    try {
      const res = await api.knowledgeList(spaceId)
      if (res.success && res.data) {
        set({ documents: res.data as KnowledgeDocument[], isLoading: false })
      } else {
        set({ error: res.error || 'Failed to load documents', isLoading: false })
      }
    } catch (err) {
      set({ error: String(err), isLoading: false })
    }
  },

  searchDocuments: async (spaceId: string, query: string, topK?: number) => {
    if (!query.trim()) {
      set({ searchResults: [], isSearching: false })
      return
    }
    set({ isSearching: true, error: null })
    try {
      const res = await api.knowledgeSearch({ spaceId, query, topK })
      if (res.success && res.data) {
        set({ searchResults: res.data as KnowledgeSearchResult[], isSearching: false })
      } else {
        set({ error: res.error || 'Search failed', isSearching: false })
      }
    } catch (err) {
      set({ error: String(err), isSearching: false })
    }
  },

  clearSearch: () => {
    set({ searchResults: [], isSearching: false })
  },

  deleteDocument: async (spaceId: string, sourcePath: string) => {
    set({ error: null })
    try {
      const res = await api.knowledgeDelete({ spaceId, sourcePath })
      if (res.success) {
        set(state => ({
          documents: state.documents.filter(d => d.sourcePath !== sourcePath),
        }))
      } else {
        set({ error: res.error || 'Failed to delete document' })
      }
    } catch (err) {
      set({ error: String(err) })
    }
  },

  uploadDocuments: async (spaceId: string) => {
    set({ isUploading: true, error: null })
    try {
      const res = await api.knowledgeUpload({ spaceId })
      if (res.success && res.data) {
        const result = res.data as UploadResult
        if (result.indexed === 0 && result.skipped > 0) {
          const errMsg = result.errors?.length
            ? result.errors.map(e => e.error).join('; ')
            : `All files failed to index (${result.skipped} skipped)`
          set({ error: errMsg, isUploading: false })
        } else {
          await get().loadDocuments(spaceId)
          set({ isUploading: false })
        }
        return result
      } else {
        set({ error: res.error || 'Upload failed', isUploading: false })
      }
    } catch (err) {
      set({ error: String(err), isUploading: false })
    }
  },

  reindexDocuments: async (spaceId: string) => {
    set({ isLoading: true, error: null })
    try {
      const res = await api.knowledgeReindex(spaceId)
      if (res.success) {
        await get().loadDocuments(spaceId)
      } else {
        set({ error: res.error || 'Reindex failed', isLoading: false })
      }
    } catch (err) {
      set({ error: String(err), isLoading: false })
    }
  },

  subscribeToStatus: () => {
    if (typeof window === 'undefined' || !window.halo?.onKnowledgeStatus) {
      return () => {}
    }
    const unsubscribe = window.halo.onKnowledgeStatus((status) => {
      set({ indexingStatus: status })
    })
    return unsubscribe
  },
}))