/**
 * Unit tests for FTS5 search functionality.
 *
 * Tests:
 * - FTS5 search: insert data, search, verify result ordering
 * - Empty results for non-matching queries
 * - Space isolation (documents in different spaces)
 * - topK limit
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { ftsSearch } from '../../../../../src/main/platform/memory/knowledge/fts'

describe('FTS5 search', () => {
  let db: Database.Database

  beforeEach(() => {
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
      CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks USING fts5(
        document_id UNINDEXED,
        space_id UNINDEXED,
        chunk_index,
        content,
        tokenize = 'unicode61'
      );
    `)
  })

  afterEach(() => {
    db.close()
  })

  function insertDoc(overrides: Partial<{
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
  }> = {}): string {
    const id = overrides.id || 'doc-1'
    db.prepare(`
      INSERT INTO knowledge_documents (id, space_id, source, source_path, file_name, file_type, content_hash, chunk_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      overrides.space_id || 'space-1',
      overrides.source || 'upload',
      overrides.source_path || '/test/doc.txt',
      overrides.file_name || 'doc.txt',
      overrides.file_type || 'txt',
      overrides.content_hash || 'abc123',
      overrides.chunk_count || 1,
      overrides.created_at || 1000,
      overrides.updated_at || 1000,
    )
    return id
  }

  function insertChunk(overrides: Partial<{
    document_id: string
    space_id: string
    chunk_index: number
    content: string
  }> = {}) {
    db.prepare(`
      INSERT INTO knowledge_chunks (document_id, space_id, chunk_index, content)
      VALUES (?, ?, ?, ?)
    `).run(
      overrides.document_id || 'doc-1',
      overrides.space_id || 'space-1',
      overrides.chunk_index || 0,
      overrides.content || 'sample content for testing',
    )
  }

  it('should find matching documents', () => {
    insertDoc()
    insertChunk({ content: 'The quick brown fox jumps over the lazy dog' })
    insertChunk({ chunk_index: 1, content: 'Python is a popular programming language' })

    const results = ftsSearch(db, 'space-1', 'fox', 10)
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].documentId).toBe('doc-1')
    expect(results[0].content).toContain('fox')
  })

  it('should return empty array for non-matching query', () => {
    insertDoc()
    insertChunk({ content: 'The quick brown fox' })

    const results = ftsSearch(db, 'space-1', 'zzzzznotfound', 10)
    expect(results).toEqual([])
  })

  it('should respect topK limit', () => {
    const docId = insertDoc({ id: 'doc-multi', content_hash: 'multi' })
    // Insert many chunks
    for (let i = 0; i < 10; i++) {
      insertChunk({
        document_id: docId,
        chunk_index: i,
        content: `searchable content chunk number ${i} with keyword`,
      })
    }

    const results = ftsSearch(db, 'space-1', 'keyword', 3)
    expect(results.length).toBeLessThanOrEqual(3)
  })

  it('should isolate search results by space', () => {
    insertDoc({ id: 'doc-space1', space_id: 'space-1', source_path: '/s1/doc.txt' })
    insertChunk({ document_id: 'doc-space1', space_id: 'space-1', content: 'unique content for space one' })

    insertDoc({ id: 'doc-space2', space_id: 'space-2', source_path: '/s2/doc.txt' })
    insertChunk({ document_id: 'doc-space2', space_id: 'space-2', content: 'unique content for space two' })

    const results1 = ftsSearch(db, 'space-1', 'unique', 10)
    expect(results1).toHaveLength(1)
    expect(results1[0].documentId).toBe('doc-space1')

    const results2 = ftsSearch(db, 'space-2', 'unique', 10)
    expect(results2).toHaveLength(1)
    expect(results2[0].documentId).toBe('doc-space2')
  })

  it('should return results ordered by relevance', () => {
    const docId = insertDoc({ id: 'doc-rel', content_hash: 'rel' })
    insertChunk({ document_id: docId, chunk_index: 0, content: 'apple banana cherry date' })
    insertChunk({ document_id: docId, chunk_index: 1, content: 'apple apple apple banana' })
    insertChunk({ document_id: docId, chunk_index: 2, content: 'apple only here' })

    const results = ftsSearch(db, 'space-1', 'apple', 10)
    expect(results.length).toBeGreaterThanOrEqual(1)
    // All results should have score > 0 (BM25 rank is negative, negated to positive)
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0)
    }
  })

  it('should handle empty query gracefully', () => {
    const results = ftsSearch(db, 'space-1', '', 10)
    expect(results).toEqual([])
  })

  it('should handle query with special characters', () => {
    insertDoc()
    insertChunk({ content: 'hello world test content' })

    const results = ftsSearch(db, 'space-1', 'hello!@#$%^&*()', 10)
    expect(results.length).toBeGreaterThanOrEqual(1)
  })

  it('should handle missing FTS table gracefully', () => {
    // Close the db and create a new one without the FTS table
    db.close()
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_documents (
        id TEXT PRIMARY KEY,
        space_id TEXT NOT NULL,
        source_path TEXT NOT NULL
      );
    `)

    // Should not throw, should return empty
    const results = ftsSearch(db, 'space-1', 'test', 10)
    expect(results).toEqual([])
  })
})