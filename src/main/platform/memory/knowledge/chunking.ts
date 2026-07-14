/**
 * Document parsing and chunking for the knowledge base.
 *
 * Supports txt, md, json, csv, and pdf file types.
 * Each type has its own parsing strategy followed by standardized chunking
 * with overlap.
 */

// ============================================================================
// Types
// ============================================================================

export type DocumentFileType = 'txt' | 'md' | 'json' | 'csv' | 'pdf'

export interface Chunk {
  index: number
  content: string
}

// ============================================================================
// Constants
// ============================================================================

const MIN_CHUNK_SIZE = 100
const MAX_CHUNK_SIZE = 2000
const CHUNK_OVERLAP = 200

// ============================================================================
// Public API
// ============================================================================

/**
 * Parse a document's content and split it into chunks suitable for FTS5 indexing.
 *
 * @param content - The raw file content (string).
 * @param fileType - The type of document to parse.
 * @returns An array of Chunk objects with index and content.
 */
export function parseAndChunk(
  content: string | Buffer,
  fileType: DocumentFileType
): Chunk[] {
  // Ensure non-PDF types get a proper string (readFile returns Buffer by default)
  const text = typeof content === 'string' ? content : content.toString('utf-8')

  let rawChunks: string[]

  switch (fileType) {
    case 'txt':
      rawChunks = parseTxt(text)
      break
    case 'md':
      rawChunks = parseMd(text)
      break
    case 'json':
      rawChunks = parseJson(text)
      break
    case 'csv':
      rawChunks = parseCsv(text)
      break
    case 'pdf':
      // PDF requires async parsing; use parseAndChunkAsync instead.
      rawChunks = [text]
      break
    default:
      rawChunks = [text]
  }

  return normalizeChunks(rawChunks)
}

/**
 * Async variant for PDF files. Use this when content is a Buffer and the
 * file type is 'pdf', so PDF parsing does not block the event loop.
 */
export async function parseAndChunkAsync(
  content: string | Buffer,
  fileType: DocumentFileType
): Promise<Chunk[]> {
  if (fileType === 'pdf' && typeof content !== 'string') {
    // Lazy-import to avoid pulling in pdfjs-dist at module load time
    const { parsePdf } = await import('./pdf-parser')
    const buffer = content instanceof Buffer ? content : Buffer.from(content)
    const text = await parsePdf(buffer)
    const rawChunks = text ? splitByFormFeed(text) : []
    return normalizeChunks(rawChunks)
  }
  return parseAndChunk(content, fileType)
}

// ============================================================================
// Type-specific parsers
// ============================================================================

/**
 * Normalize line endings to \n.
 */
function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, '\n')
}

function parseTxt(text: string): string[] {
  const normalized = normalizeEol(text)
  const paragraphs = normalized.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)
  // Merge very short paragraphs into the next one
  const merged: string[] = []
  for (const p of paragraphs) {
    if (merged.length > 0 && merged[merged.length - 1].length < MIN_CHUNK_SIZE) {
      merged[merged.length - 1] += '\n\n' + p
    } else {
      merged.push(p)
    }
  }
  return merged
}

function parseMd(text: string): string[] {
  const normalized = normalizeEol(text)
  const headingRegex = /^##\s/m
  if (!headingRegex.test(normalized)) {
    return parseTxt(text)
  }

  // Split on '## ' headings, keeping the heading as part of the section.
  // Content before the first '##' heading is a preamble; prepend it to
  // the first section if it exists.
  const parts = normalized.split(/(?=^##\s)/m)
  const sections: string[] = []
  let preamble = ''

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    if (/^##\s/.test(trimmed)) {
      sections.push(trimmed)
    } else {
      // Content before the first '##' heading
      preamble = trimmed
    }
  }

  if (preamble && sections.length > 0) {
    sections[0] = preamble + '\n\n' + sections[0]
  } else if (preamble) {
    sections.push(preamble)
  }

  return sections
}

function parseJson(text: string): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return [text]
  }

  const chunks: string[] = []

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (item !== null && item !== undefined) {
        chunks.push(JSON.stringify(item))
      }
    }
  } else if (typeof parsed === 'object' && parsed !== null) {
    for (const value of Object.values(parsed as Record<string, unknown>)) {
      if (value !== null && value !== undefined) {
        chunks.push(JSON.stringify(value))
      }
    }
  } else {
    chunks.push(JSON.stringify(parsed))
  }

  return chunks
}

function parseCsv(text: string): string[] {
  const normalized = normalizeEol(text)
  const lines = normalized.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  if (lines.length === 0) return []
  if (lines.length === 1) return [lines[0]]

  const header = lines[0]
  const dataChunks: string[] = []

  for (let i = 1; i < lines.length; i++) {
    dataChunks.push(`${header}\n${lines[i]}`)
  }

  return dataChunks
}

function splitByFormFeed(text: string): string[] {
  return text.split(/\f/).map(s => s.trim()).filter(s => s.length >= MIN_CHUNK_SIZE)
}

// ============================================================================
// Normalization (merge small + split large + overlap)
// ============================================================================

function normalizeChunks(rawChunks: string[]): Chunk[] {
  if (rawChunks.length === 0) return []

  // Phase 1: Merge small segments with neighbors
  const merged: string[] = []
  for (const raw of rawChunks) {
    if (merged.length > 0 && merged[merged.length - 1].length < MIN_CHUNK_SIZE) {
      merged[merged.length - 1] += '\n\n' + raw
    } else {
      merged.push(raw)
    }
  }

  // Phase 2: Split oversized segments and produce final Chunk[]
  const result: Chunk[] = []
  let chunkIndex = 0

  for (const segment of merged) {
    if (segment.length <= MAX_CHUNK_SIZE) {
      result.push({ index: chunkIndex++, content: segment })
    } else {
      // Split at newline boundaries, apply overlap
      let remaining = segment
      while (remaining.length > MAX_CHUNK_SIZE) {
        const splitAt = remaining.lastIndexOf('\n', MAX_CHUNK_SIZE)
        const cutPos = splitAt > 0 ? splitAt : MAX_CHUNK_SIZE
        const head = remaining.slice(0, cutPos).trim()
        if (head) {
          result.push({ index: chunkIndex++, content: head })
        }
        // Overlap: keep last CHUNK_OVERLAP chars of head as prefix of remainder
        const overlap = head.length > CHUNK_OVERLAP
          ? head.slice(-CHUNK_OVERLAP)
          : head
        remaining = overlap + remaining.slice(cutPos)
      }
      const tail = remaining.trim()
      if (tail) {
        result.push({ index: chunkIndex++, content: tail })
      }
    }
  }

  return result
}

export const __test__ = {
  parseTxt,
  parseMd,
  parseJson,
  parseCsv,
  normalizeChunks,
  MIN_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
  CHUNK_OVERLAP,
}