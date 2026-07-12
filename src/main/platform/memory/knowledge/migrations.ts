import type { Migration } from '../../store/types'

export const knowledgeMigrations: Migration[] = [
  {
    version: 1,
    description: 'Create knowledge_documents and knowledge_chunks tables',
    up(db) {
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
    },
  },
]