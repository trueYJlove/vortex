/**
 * knowledgeApi — knowledge base domain slice of the unified api object.
 */
import { httpRequest, isElectron } from './_shared'
import type { ApiResponse } from './_shared'

export interface KnowledgeDocument {
  id: string
  spaceId: string
  source: string
  sourcePath: string
  fileName: string
  fileType: string
  contentHash: string
  chunkCount: number
  createdAt: number
  updatedAt: number
}

export interface KnowledgeSearchResult {
  documentId: string
  documentName: string
  chunkIndex: number
  content: string
  score: number
}

export interface UploadResult {
  indexed: number
  skipped: number
  errors?: Array<{ file: string; error: string }>
}

export const knowledgeApi = {
  knowledgeList: async (spaceId: string): Promise<ApiResponse<KnowledgeDocument[]>> => {
    if (isElectron()) {
      return window.halo.knowledgeList(spaceId)
    }
    return httpRequest('GET', `/api/knowledge/${spaceId}`)
  },

  knowledgeSearch: async (params: { spaceId: string; query: string; topK?: number }): Promise<ApiResponse<KnowledgeSearchResult[]>> => {
    if (isElectron()) {
      return window.halo.knowledgeSearch(params)
    }
    return httpRequest('POST', `/api/knowledge/${params.spaceId}/search`, params)
  },

  knowledgeDelete: async (params: { spaceId: string; sourcePath: string }): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.halo.knowledgeDelete(params)
    }
    return httpRequest('DELETE', `/api/knowledge/${params.spaceId}`, params)
  },

  knowledgeUpload: async (params: { spaceId: string; files?: Array<{ name: string; content: string; type: string }> }): Promise<ApiResponse<UploadResult>> => {
    if (isElectron()) {
      return window.halo.knowledgeUpload({ spaceId: params.spaceId })
    }
    return httpRequest('POST', `/api/knowledge/${params.spaceId}/upload`, { files: params.files })
  },

  knowledgeReindex: async (spaceId: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.halo.knowledgeReindex(spaceId)
    }
    return httpRequest('POST', `/api/knowledge/${spaceId}/reindex`)
  },
}