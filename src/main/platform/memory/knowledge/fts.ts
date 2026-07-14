/**
 * FTS5 search utilities for the knowledge base.
 *
 * Handles query escaping, FTS5 MATCH queries, and result ranking.
 */

import type Database from 'better-sqlite3'
import type { SearchResult } from './types'

// Characters that have special meaning in FTS5 syntax and need escaping.
// FTS5 special chars: ^ * " : ( ) { } [ ] ! ~ + -
// Colon is included — queries like "time:zone" would otherwise be parsed
// as a column-filter operator and throw a syntax error.
const FTS5_SPECIAL = /[\*\^"\:\(\)\{\}\[\]\!\~\-\+]/g

/**
 * Escape special characters in an FTS5 query string.
 *
 * FTS5 treats certain characters as operators or syntax. To search for
 * literal occurrences of these characters, they must be escaped by
 * wrapping the entire query in double quotes, or by removing them.
 *
 * This implementation removes (or rather, ignores) special characters
 * since our use case is simple keyword search, not advanced FTS5 queries.
 */
function escapeFts5Query(query: string): string {
  // Remove FTS5 special characters and trim whitespace
  const cleaned = query
    .replace(FTS5_SPECIAL, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return ''

  // For simple keyword search, we prefix each term with a wildcard
  // so "know" matches "knowledge", etc.
  const terms = cleaned.split(' ').filter(Boolean)
  return terms.map(t => `"${t}"*`).join(' ')
}

/**
 * Search the knowledge base using FTS5 full-text search.
 *
 * @param db - better-sqlite3 database instance.
 * @param spaceId - Scopes search to a specific space.
 * @param query - The search query text.
 * @param topK - Maximum number of results to return (default 5).
 * @returns Array of SearchResult objects, ordered by relevance (highest score first).
 */
export function ftsSearch(
  db: Database.Database,
  spaceId: string,
  query: string,
  topK: number = 5
): SearchResult[] {
  // Escape and normalize the query
  const safeQuery = escapeFts5Query(query)
  if (!safeQuery) return []

  const sql = `
    SELECT
      kc.document_id,
      kd.file_name AS document_name,
      kc.chunk_index,
      kc.content,
      rank AS bm25_rank
    FROM knowledge_chunks kc
    JOIN knowledge_documents kd ON kd.id = kc.document_id
    WHERE kc.content MATCH ?
      AND kc.space_id = ?
    ORDER BY rank
    LIMIT ?
  `

  try {
    const rows = db.prepare(sql).all(safeQuery, spaceId, topK) as Array<{
      document_id: string
      document_name: string
      chunk_index: number
      content: string
      bm25_rank: number
    }>

    return rows.map(row => ({
      documentId: row.document_id,
      documentName: row.document_name,
      chunkIndex: row.chunk_index,
      content: row.content,
      // BM25 rank is negative (lower = more relevant); negate for a positive score
      score: -row.bm25_rank,
    }))
  } catch (err) {
    console.warn('[Memory] FTS5 search failed:', err instanceof Error ? err.message : err)
    return []
  }
}