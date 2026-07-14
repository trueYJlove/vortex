/**
 * KnowledgeService -- document indexing, FTS5 search, and knowledge management.
 *
 * Singleton pattern: use initKnowledgeService(db) to get or create the instance.
 *
 * All database operations use transactions. All async I/O uses try/catch.
 * Logging uses console.log with [Memory] prefix.
 */

import type Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import { extname, basename } from 'path'
import { existsSync } from 'fs'
import { parseAndChunkAsync } from './chunking'
import { ftsSearch } from './fts'
import type {
  KnowledgeService,
  KnowledgeDocument,
  SearchResult,
  KnowledgeSearchParams,
  DocumentSource,
  DocumentFileType,
} from './types'

// ============================================================================
// Module-level singleton
// ============================================================================

let instance: KnowledgeService | null = null

export function initKnowledgeService(db: Database.Database): KnowledgeService {
  if (instance) return instance
  instance = createKnowledgeService(db)
  return instance
}

export function resetKnowledgeServiceForTest(): void {
  instance = null
}

export function getKnowledgeService(): KnowledgeService | null {
  return instance
}

// ============================================================================
// Supported file extensions for artifact indexing
// ============================================================================

const EXTENSION_MAP: Record<string, DocumentFileType> = {
  '.txt': 'txt',
  '.md': 'md',
  '.json': 'json',
  '.csv': 'csv',
  '.pdf': 'pdf',
}

const SUPPORTED_EXTENSIONS = new Set(Object.keys(EXTENSION_MAP))

// ============================================================================
// Implementation
// ============================================================================

function createKnowledgeService(db: Database.Database): KnowledgeService {
  const service: KnowledgeService = {

    // ── indexDocument ─────────────────────────────────────────────────────
    async indexDocument(params: {
      spaceId: string
      source: DocumentSource
      sourcePath: string
      content: string | Buffer
      fileType: DocumentFileType
    }): Promise<KnowledgeDocument> {
      const { spaceId, source, sourcePath, content, fileType } = params

      // Compute content hash. Node's Hash.update accepts Buffer directly,
      // which preserves raw bytes — critical for PDF and other binary formats.
      // Converting to a string first would corrupt non-ASCII bytes.
      const hasher = createHash('sha256')
      if (typeof content === 'string') {
        hasher.update(content, 'utf8')
      } else {
        hasher.update(content)
      }
      const contentHash = hasher.digest('hex')

      // Check if document already exists
      const existing = db.prepare(
        'SELECT id, content_hash FROM knowledge_documents WHERE space_id = ? AND source_path = ?'
      ).get(spaceId, sourcePath) as { id: string; content_hash: string } | undefined

      if (existing) {
        if (existing.content_hash === contentHash) {
          // Same content, skip re-indexing
          console.log(`[Memory] Document already indexed with same hash: ${sourcePath}`)
          const doc = db.prepare(
            'SELECT * FROM knowledge_documents WHERE id = ?'
          ).get(existing.id) as KnowledgeDocumentRow
          return rowToDocument(doc)
        }

        // Content changed, remove old chunks
        console.log(`[Memory] Document content changed, re-indexing: ${sourcePath}`)
        db.transaction(() => {
          db.prepare('DELETE FROM knowledge_chunks WHERE document_id = ?').run(existing.id)
          db.prepare('DELETE FROM knowledge_documents WHERE id = ?').run(existing.id)
        })()
      }

      // Parse and chunk the document
      const chunks = await parseAndChunkAsync(content, fileType)
      const fileName = sourcePath.split('/').pop() || sourcePath.split('\\').pop() || sourcePath

      // Insert document and chunks in a transaction
      const documentId = randomUUID()
      const now = Math.floor(Date.now() / 1000)

      db.transaction(() => {
        db.prepare(`
          INSERT INTO knowledge_documents (id, space_id, source, source_path, file_name, file_type, content_hash, chunk_count, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(documentId, spaceId, source, sourcePath, fileName, fileType, contentHash, chunks.length, now, now)

        const insertChunk = db.prepare(`
          INSERT INTO knowledge_chunks (document_id, space_id, chunk_index, content)
          VALUES (?, ?, ?, ?)
        `)

        for (const chunk of chunks) {
          insertChunk.run(documentId, spaceId, chunk.index, chunk.content)
        }
      })()

      console.log(`[Memory] Indexed document: ${sourcePath} (${chunks.length} chunks)`)

      return {
        id: documentId,
        spaceId,
        source,
        sourcePath,
        fileName,
        fileType,
        contentHash,
        chunkCount: chunks.length,
        createdAt: now,
        updatedAt: now,
      }
    },

    // ── removeDocument ────────────────────────────────────────────────────
    async removeDocument(spaceId: string, sourcePath: string): Promise<void> {
      db.transaction(() => {
        const doc = db.prepare(
          'SELECT id FROM knowledge_documents WHERE space_id = ? AND source_path = ?'
        ).get(spaceId, sourcePath) as { id: string } | undefined

        if (doc) {
          db.prepare('DELETE FROM knowledge_chunks WHERE document_id = ?').run(doc.id)
          db.prepare('DELETE FROM knowledge_documents WHERE id = ?').run(doc.id)
          console.log(`[Memory] Removed document: ${sourcePath}`)
        }
      })()
    },

    // ── listDocuments ─────────────────────────────────────────────────────
    async listDocuments(spaceId: string): Promise<KnowledgeDocument[]> {
      const rows = db.prepare(
        'SELECT * FROM knowledge_documents WHERE space_id = ? ORDER BY created_at DESC'
      ).all(spaceId) as KnowledgeDocumentRow[]

      return rows.map(rowToDocument)
    },

    // ── search ────────────────────────────────────────────────────────────
    async search(params: KnowledgeSearchParams): Promise<SearchResult[]> {
      const { spaceId, query, topK = 5 } = params
      return ftsSearch(db, spaceId, query, topK)
    },

    // ── indexArtifact ─────────────────────────────────────────────────────
    async indexArtifact(spaceId: string, artifactPath: string): Promise<void> {
      try {
        if (!existsSync(artifactPath)) {
          console.log(`[Memory] Artifact file not found: ${artifactPath}`)
          return
        }

        const ext = extname(artifactPath).toLowerCase()
        if (!SUPPORTED_EXTENSIONS.has(ext)) {
          console.log(`[Memory] Skipping unsupported file type: ${artifactPath}`)
          return
        }

        const fileType = EXTENSION_MAP[ext]
        const content = fileType !== 'pdf'
          ? await readFile(artifactPath, 'utf-8')
          : await readFile(artifactPath)
        const fileName = basename(artifactPath)

        await service.indexDocument({
          spaceId,
          source: 'artifact',
          sourcePath: artifactPath,
          content,
          fileType,
        })

        console.log(`[Memory] Indexed artifact: ${fileName}`)
      } catch (err) {
        console.warn('[Memory] Failed to index artifact:', err instanceof Error ? err.message : err)
      }
    },
  }

  return service
}

// ============================================================================
// Internal helpers
// ============================================================================

interface KnowledgeDocumentRow {
  id: string
  space_id: string
  source: string
  source_path: string
  file_name: string
  file_type: string
  content_hash: string
  chunk_count: number
  created_at: number
  updated_at: number
}

function rowToDocument(row: KnowledgeDocumentRow): KnowledgeDocument {
  return {
    id: row.id,
    spaceId: row.space_id,
    source: row.source as DocumentSource,
    sourcePath: row.source_path,
    fileName: row.file_name,
    fileType: row.file_type as DocumentFileType,
    contentHash: row.content_hash,
    chunkCount: row.chunk_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// Re-export types for external consumers
export type { KnowledgeService, SearchResult, KnowledgeDocument, KnowledgeSearchParams, DocumentFileType }