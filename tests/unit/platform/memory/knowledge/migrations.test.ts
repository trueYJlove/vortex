/**
 * Unit tests for knowledge/migrations.ts
 *
 * Tests the knowledge_documents and knowledge_chunks FTS5 table creation,
 * column definitions, indexes, namespace isolation, and idempotency.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { knowledgeMigrations } from '../../../../../src/main/platform/memory/knowledge/migrations'
import { createDatabaseManager } from '../../../../../src/main/platform/store/database-manager'

describe('KnowledgeMigrations', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  function applyMigration(): void {
    knowledgeMigrations[0].up(db)
  }

  // ── Schema verification ────────────────────────────────────────────

  it('should create knowledge_documents table with all columns', () => {
    applyMigration()

    const columns = db
      .prepare("PRAGMA table_info('knowledge_documents')")
      .all() as Array<{ name: string; type: string; notnull: number; pk: number }>

    expect(columns).toHaveLength(10)
    expect(columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'id', type: 'TEXT', pk: 1 }),
        expect.objectContaining({ name: 'space_id', type: 'TEXT', notnull: 1 }),
        expect.objectContaining({ name: 'source', type: 'TEXT', notnull: 1 }),
        expect.objectContaining({ name: 'source_path', type: 'TEXT', notnull: 1 }),
        expect.objectContaining({ name: 'file_name', type: 'TEXT', notnull: 1 }),
        expect.objectContaining({ name: 'file_type', type: 'TEXT', notnull: 1 }),
        expect.objectContaining({ name: 'content_hash', type: 'TEXT', notnull: 1 }),
        expect.objectContaining({ name: 'chunk_count', type: 'INTEGER', notnull: 1 }),
        expect.objectContaining({ name: 'created_at', type: 'INTEGER', notnull: 1 }),
        expect.objectContaining({ name: 'updated_at', type: 'INTEGER', notnull: 1 }),
      ])
    )
  })

  it('should enforce UNIQUE constraint on (space_id, source_path)', () => {
    applyMigration()

    db.prepare(`
      INSERT INTO knowledge_documents (id, space_id, source, source_path, file_name, file_type, content_hash, chunk_count, created_at, updated_at)
      VALUES ('id-1', 's1', 'upload', '/a.txt', 'a.txt', 'txt', 'abc', 1, 1000, 1000)
    `).run()

    expect(() =>
      db.prepare(`
        INSERT INTO knowledge_documents (id, space_id, source, source_path, file_name, file_type, content_hash, chunk_count, created_at, updated_at)
        VALUES ('id-2', 's1', 'upload', '/a.txt', 'a.txt', 'txt', 'def', 1, 1000, 1000)
      `).run()
    ).toThrow()
  })

  it('should create idx_knowledge_documents_space index on space_id', () => {
    applyMigration()

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_knowledge_documents_space'")
      .all() as Array<{ name: string }>

    expect(indexes).toHaveLength(1)
  })

  // ── FTS5 ───────────────────────────────────────────────────────────

  it('should create knowledge_chunks FTS5 virtual table', () => {
    applyMigration()

    // FTS5 tables register entries for both the fts table and its content/content_* tables
    const ftsTables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_chunks'")
      .all() as Array<{ name: string }>

    expect(ftsTables).toHaveLength(1)
  })

  it('should support FTS5 queries on knowledge_chunks', () => {
    applyMigration()

    // Insert into FTS5 content table
    db.prepare(
      `INSERT INTO knowledge_chunks (document_id, space_id, chunk_index, content)
       VALUES (?, ?, ?, ?)`
    ).run('doc-1', 's1', 0, 'the quick brown fox')

    const results = db
      .prepare("SELECT rowid, content FROM knowledge_chunks WHERE content MATCH 'fox'")
      .all() as Array<{ content: string }>

    expect(results).toHaveLength(1)
    expect(results[0].content).toBe('the quick brown fox')
  })

  // ── Idempotency ────────────────────────────────────────────────────

  it('should be idempotent when applied multiple times', () => {
    applyMigration()
    applyMigration()
    applyMigration()

    // Tables still exist
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'knowledge_%'")
      .all() as Array<{ name: string }>
    const tableNames = tables.map(t => t.name)
    expect(tableNames).toContain('knowledge_documents')
    expect(tableNames).toContain('knowledge_chunks')

    // No duplicate rows from re-application
    const count = db
      .prepare("SELECT count(*) as count FROM sqlite_master WHERE type='index' AND name='idx_knowledge_documents_space'")
      .get() as { count: number }
    expect(count.count).toBe(1)
  })

  // ── DatabaseManager integration ────────────────────────────────────

  it('should work with DatabaseManager.runMigrations', () => {
    const manager = createDatabaseManager(':memory:')
    const appDb = manager.getAppDatabase()

    manager.runMigrations(appDb, 'knowledge', knowledgeMigrations)

    const row = appDb
      .prepare('SELECT version FROM _migrations WHERE namespace = ?')
      .get('knowledge') as { version: number }
    expect(row.version).toBe(1)

    manager.closeAll()
  })

  it('should be idempotent when run via DatabaseManager', () => {
    const manager = createDatabaseManager(':memory:')
    const appDb = manager.getAppDatabase()

    manager.runMigrations(appDb, 'knowledge', knowledgeMigrations)
    manager.runMigrations(appDb, 'knowledge', knowledgeMigrations)

    const row = appDb
      .prepare('SELECT version FROM _migrations WHERE namespace = ?')
      .get('knowledge') as { version: number }
    expect(row.version).toBe(1)

    // Verify tables exist
    const tables = appDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'knowledge_%'")
      .all() as Array<{ name: string }>
    expect(tables.length).toBeGreaterThanOrEqual(2)

    manager.closeAll()
  })

  // ── Export shape ───────────────────────────────────────────────────

  it('should export exactly one migration (version 1)', () => {
    expect(knowledgeMigrations).toHaveLength(1)
    expect(knowledgeMigrations[0].version).toBe(1)
    expect(knowledgeMigrations[0].description).toBeTruthy()
    expect(knowledgeMigrations[0].up).toBeInstanceOf(Function)
  })
})