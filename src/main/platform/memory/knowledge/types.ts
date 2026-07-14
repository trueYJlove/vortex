export type KnowledgeScope = 'space'
export type DocumentFileType = 'txt' | 'md' | 'json' | 'csv' | 'pdf'
export type DocumentSource = 'upload' | 'artifact'

export interface KnowledgeDocument {
  id: string
  spaceId: string
  source: DocumentSource
  sourcePath: string
  fileName: string
  fileType: DocumentFileType
  contentHash: string
  chunkCount: number
  createdAt: number
  updatedAt: number
}

export interface SearchResult {
  documentId: string
  documentName: string
  chunkIndex: number
  content: string
  score: number
}

export interface KnowledgeSearchParams {
  scope: KnowledgeScope
  spaceId: string
  query: string
  topK?: number
}

export interface KnowledgeService {
  indexDocument(params: {
    spaceId: string
    source: DocumentSource
    sourcePath: string
    content: string | Buffer
    fileType: DocumentFileType
  }): Promise<KnowledgeDocument>

  removeDocument(spaceId: string, sourcePath: string): Promise<void>

  listDocuments(spaceId: string): Promise<KnowledgeDocument[]>

  search(params: KnowledgeSearchParams): Promise<SearchResult[]>

  indexArtifact(spaceId: string, artifactPath: string): Promise<void>
}