/**
 * Unit tests for KnowledgeService.
 *
 * Tests:
 * - indexDocument + listDocuments
 * - Dedup (same content hash)
 * - Update (different content hash)
 * - removeDocument
 * - search (depends on ftsSearch)
 * - indexArtifact (can mock fs)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { initKnowledgeService, resetKnowledgeServiceForTest } from '../../../../../src/main/platform/memory/knowledge/index'
import type { KnowledgeService } from '../../../../../src/main/platform/memory/knowledge/types'

describe('KnowledgeService', () => {
  let db: Database.Database
  let service: KnowledgeService

  beforeEach(() => {
    resetKnowledgeServiceForTest()
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_documents (
        id TEXT PRIMARY KEY,
        space_id TEXT NOT NULL,
        source TEXT NOT NULL,
        source_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_type TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        chunk_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(space_id, source_path)
      );
      CREATE INDEX IF NOT EXISTS idx_knowledge_documents_space ON knowledge_documents(space_id);
      CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks USING fts5(
        document_id UNINDEXED,
        space_id UNINDEXED,
        chunk_index,
        content,
        tokenize = 'unicode61'
      );
    `)
    service = initKnowledgeService(db)
  })

  afterEach(() => {
    db.close()
    resetKnowledgeServiceForTest()
  })

  describe('indexDocument', () => {
    it('should index a text document and return document metadata', async () => {
      const doc = await service.indexDocument({
        spaceId: 'space-1',
        source: 'upload',
        sourcePath: '/docs/test.txt',
        content: 'Hello world this is a test document for indexing.',
        fileType: 'txt',
      })

      expect(doc.spaceId).toBe('space-1')
      expect(doc.sourcePath).toBe('/docs/test.txt')
      expect(doc.chunkCount).toBeGreaterThanOrEqual(1)
      expect(doc.contentHash).toBeTruthy()
      expect(doc.id).toBeTruthy()
    })

    it('should return the same document on duplicate (same hash)', async () => {
      const content = 'This is some test content for dedup testing.'
      const doc1 = await service.indexDocument({
        spaceId: 'space-1',
        source: 'upload',
        sourcePath: '/docs/test.txt',
        content,
        fileType: 'txt',
      })

      const doc2 = await service.indexDocument({
        spaceId: 'space-1',
        source: 'upload',
        sourcePath: '/docs/test.txt',
        content,
        fileType: 'txt',
      })

      expect(doc2.id).toBe(doc1.id)
      expect(doc2.contentHash).toBe(doc1.contentHash)
    })

    it('should re-index when content changes', async () => {
      const doc1 = await service.indexDocument({
        spaceId: 'space-1',
        source: 'upload',
        sourcePath: '/docs/test.txt',
        content: 'Original content for the document.',
        fileType: 'txt',
      })

      const doc2 = await service.indexDocument({
        spaceId: 'space-1',
        source: 'upload',
        sourcePath: '/docs/test.txt',
        content: 'Completely different updated content here.',
        fileType: 'txt',
      })

      expect(doc2.id).not.toBe(doc1.id)
      expect(doc2.contentHash).not.toBe(doc1.contentHash)
    })
  })

  describe('listDocuments', () => {
    it('should list all documents in a space', async () => {
      await service.indexDocument({
        spaceId: 'space-1',
        source: 'upload',
        sourcePath: '/docs/doc1.txt',
        content: 'First document content for listing test.',
        fileType: 'txt',
      })

      await service.indexDocument({
        spaceId: 'space-1',
        source: 'upload',
        sourcePath: '/docs/doc2.md',
        content: 'Second document with different type.',
        fileType: 'md',
      })

      const docs = await service.listDocuments('space-1')
      expect(docs).toHaveLength(2)
    })

    it('should return empty array for space with no documents', async () => {
      const docs = await service.listDocuments('empty-space')
      expect(docs).toEqual([])
    })

    it('should isolate documents by space', async () => {
      await service.indexDocument({
        spaceId: 'space-1',
        source: 'upload',
        sourcePath: '/docs/doc1.txt',
        content: 'Space 1 document.',
        fileType: 'txt',
      })

      await service.indexDocument({
        spaceId: 'space-2',
        source: 'upload',
        sourcePath: '/docs/doc2.txt',
        content: 'Space 2 document.',
        fileType: 'txt',
      })

      const space1Docs = await service.listDocuments('space-1')
      expect(space1Docs).toHaveLength(1)

      const space2Docs = await service.listDocuments('space-2')
      expect(space2Docs).toHaveLength(1)
    })
  })

  describe('removeDocument', () => {
    it('should remove a document and its chunks', async () => {
      await service.indexDocument({
        spaceId: 'space-1',
        source: 'upload',
        sourcePath: '/docs/to-remove.txt',
        content: 'This document will be removed.',
        fileType: 'txt',
      })

      await service.removeDocument('space-1', '/docs/to-remove.txt')

      const docs = await service.listDocuments('space-1')
      expect(docs).toHaveLength(0)
    })

    it('should not throw when removing non-existent document', async () => {
      await expect(
        service.removeDocument('space-1', '/docs/nonexistent.txt')
      ).resolves.toBeUndefined()
    })
  })

  describe('search', () => {
    it('should find documents by content', async () => {
      await service.indexDocument({
        spaceId: 'space-1',
        source: 'upload',
        sourcePath: '/docs/search-test.txt',
        content: 'The quick brown fox jumps over the lazy dog near the riverbank.',
        fileType: 'txt',
      })

      const results = await service.search({
        scope: 'space',
        spaceId: 'space-1',
        query: 'fox',
        topK: 10,
      })

      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results[0].documentName).toBe('search-test.txt')
    })

    it('should return empty for non-matching queries', async () => {
      await service.indexDocument({
        spaceId: 'space-1',
        source: 'upload',
        sourcePath: '/docs/search-test.txt',
        content: 'The quick brown fox.',
        fileType: 'txt',
      })

      const results = await service.search({
        scope: 'space',
        spaceId: 'space-1',
        query: 'nonexistentwordxyz',
        topK: 10,
      })

      expect(results).toEqual([])
    })
  })

  describe('indexArtifact', () => {
    it('should skip unsupported file types', async () => {
      await service.indexArtifact('space-1', '/docs/image.png')

      const docs = await service.listDocuments('space-1')
      expect(docs).toHaveLength(0)
    })

    it('should handle non-existent files gracefully', async () => {
      await service.indexArtifact('space-1', '/docs/nonexistent.txt')

      const docs = await service.listDocuments('space-1')
      expect(docs).toHaveLength(0)
    })
  })
})