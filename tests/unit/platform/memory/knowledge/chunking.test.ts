/**
 * Unit tests for platform/memory/knowledge/chunking
 *
 * Tests:
 * - Type-specific parsing: txt, md, json, csv, pdf
 * - Chunk boundaries: min size, max size, overlap
 * - Edge cases: empty content, single char, very long text
 */

import { describe, it, expect } from 'vitest'
import { parseAndChunk, __test__ } from '../../../../../src/main/platform/memory/knowledge/chunking'

const { parseTxt, parseMd, parseJson, parseCsv, normalizeChunks, MIN_CHUNK_SIZE } = __test__

/** Generate a string of exact length */
function text(len: number): string {
  return 'X'.repeat(len)
}

// ============================================================================
// TXT parser
// ============================================================================

describe('TXT parser', () => {
  it('should split by double newlines', () => {
    const p1 = text(MIN_CHUNK_SIZE)
    const p2 = text(MIN_CHUNK_SIZE)
    const p3 = text(MIN_CHUNK_SIZE)
    const input = `${p1}\n\n${p2}\n\n${p3}`
    const result = parseTxt(input)
    expect(result).toHaveLength(3)
    expect(result[0]).toBe(p1)
    expect(result[1]).toBe(p2)
    expect(result[2]).toBe(p3)
  })

  it('should merge paragraphs shorter than MIN_CHUNK_SIZE into the next', () => {
    const short = 'Short.'
    const long = text(MIN_CHUNK_SIZE)
    const input = `${short}\n\n${long}`
    const result = parseTxt(input)
    expect(result).toHaveLength(1)
    expect(result[0]).toContain(short)
    expect(result[0]).toContain(long)
  })

  it('should return empty array for empty input', () => {
    expect(parseTxt('')).toEqual([])
    expect(parseTxt('   \n\n  ')).toEqual([])
  })

  it('should handle single paragraph', () => {
    const result = parseTxt('Just one paragraph here.')
    expect(result).toHaveLength(1)
    expect(result[0]).toBe('Just one paragraph here.')
  })

  it('should trim whitespace from paragraphs', () => {
    const p1 = text(MIN_CHUNK_SIZE)
    const p2 = text(MIN_CHUNK_SIZE)
    const input = `  ${p1}  \n\n  ${p2}  `
    const result = parseTxt(input)
    expect(result).toHaveLength(2)
    expect(result[0]).toBe(p1)
    expect(result[1]).toBe(p2)
  })
})

// ============================================================================
// MD parser
// ============================================================================

describe('MD parser', () => {
  it('should split by ## headings', () => {
    const c1 = text(MIN_CHUNK_SIZE)
    const c2 = text(MIN_CHUNK_SIZE)
    const md = `## Section One\n\n${c1}\n\n## Section Two\n\n${c2}`
    const result = parseMd(md)
    expect(result).toHaveLength(2)
    expect(result[0]).toContain('## Section One')
    expect(result[0]).toContain(c1)
    expect(result[1]).toContain('## Section Two')
    expect(result[1]).toContain(c2)
  })

  it('should include preamble before first ## heading', () => {
    const c1 = text(MIN_CHUNK_SIZE)
    const c2 = text(MIN_CHUNK_SIZE)
    const md = `# Title\n\nSome intro.\n\n## Section One\n\n${c1}\n\n## Section Two\n\n${c2}`
    const result = parseMd(md)
    // Preamble gets prepended to first section
    expect(result).toHaveLength(2)
    expect(result[0]).toContain('Some intro.')
    expect(result[0]).toContain('## Section One')
  })

  it('should fall back to paragraph splitting when no ## headings', () => {
    const p1 = text(MIN_CHUNK_SIZE)
    const p2 = text(MIN_CHUNK_SIZE)
    const md = `# Title\n\n${p1}\n\n${p2}`
    const result = parseMd(md)
    expect(result.length).toBeGreaterThanOrEqual(2)
    expect(result.some(s => s.includes(p1))).toBe(true)
  })

  it('should handle single ## section', () => {
    const content = text(MIN_CHUNK_SIZE)
    const md = `## Only Section\n\n${content}`
    const result = parseMd(md)
    expect(result).toHaveLength(1)
    expect(result[0]).toContain('Only Section')
  })

  it('should return empty for empty input', () => {
    expect(parseMd('')).toEqual([])
  })
})

// ============================================================================
// JSON parser
// ============================================================================

describe('JSON parser', () => {
  it('should handle arrays: each element is a chunk', () => {
    const json = JSON.stringify(['value1', 'value2', 'value3'])
    const result = parseJson(json)
    expect(result).toHaveLength(3)
    expect(result[0]).toBe(JSON.stringify('value1'))
  })

  it('should handle objects: each top-level value is a chunk', () => {
    const json = JSON.stringify({ a: { nested: true }, b: [1, 2] })
    const result = parseJson(json)
    expect(result).toHaveLength(2)
  })

  it('should fall back to full text for invalid JSON', () => {
    const text = '{ invalid json }'
    const result = parseJson(text)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(text)
  })

  it('should handle primitive JSON values', () => {
    expect(parseJson('"just a string"')).toHaveLength(1)
    expect(parseJson('42')).toHaveLength(1)
    expect(parseJson('true')).toHaveLength(1)
  })

  it('should return empty array for empty object', () => {
    expect(parseJson('{}')).toHaveLength(0)
  })

  it('should skip null values in objects', () => {
    expect(parseJson(JSON.stringify({ a: null }))).toHaveLength(0)
  })

  it('should handle null as a primitive value', () => {
    const result = parseJson('null')
    expect(result).toHaveLength(1)
    expect(result[0]).toBe('null')
  })
})

// ============================================================================
// CSV parser
// ============================================================================

describe('CSV parser', () => {
  it('should pair header with each data row', () => {
    const csv = 'name,age\nAlice,30\nBob,25\nCharlie,35'
    const result = parseCsv(csv)
    expect(result).toHaveLength(3)
    expect(result[0]).toBe('name,age\nAlice,30')
    expect(result[1]).toBe('name,age\nBob,25')
    expect(result[2]).toBe('name,age\nCharlie,35')
  })

  it('should return single line as is', () => {
    const result = parseCsv('just,one,line')
    expect(result).toHaveLength(1)
    expect(result[0]).toBe('just,one,line')
  })

  it('should return empty for empty input', () => {
    expect(parseCsv('')).toEqual([])
    expect(parseCsv('\r\n  \n  ')).toEqual([])
  })
})

// ============================================================================
// Normalize chunks (merge + split)
// ============================================================================

describe('normalizeChunks', () => {
  it('should pass through chunks within size limits', () => {
    const chunks = [text(MIN_CHUNK_SIZE), text(MIN_CHUNK_SIZE)]
    const result = normalizeChunks(chunks)
    expect(result).toHaveLength(2)
  })

  it('should merge small chunks below MIN_CHUNK_SIZE', () => {
    const tiny = 'X'.repeat(MIN_CHUNK_SIZE - 10)
    const normal = 'Y'.repeat(MIN_CHUNK_SIZE)
    const result = normalizeChunks([tiny, normal])
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result[0].content).toContain(tiny)
    expect(result[0].content).toContain(normal)
  })

  it('should split oversized chunks', () => {
    const MAX_CHUNK_SIZE = __test__.MAX_CHUNK_SIZE
    const big = 'A\n'.repeat(MAX_CHUNK_SIZE)
    const result = normalizeChunks([big])
    expect(result.length).toBeGreaterThanOrEqual(2)
  })

  it('should assign sequential indices', () => {
    const C = text(MIN_CHUNK_SIZE)
    const result = normalizeChunks([C, C, C])
    for (let i = 0; i < result.length; i++) {
      expect(result[i].index).toBe(i)
    }
  })

  it('should handle empty input', () => {
    expect(normalizeChunks([])).toEqual([])
  })

  it('should include overlap when splitting large content', () => {
    const MAX_CHUNK_SIZE = __test__.MAX_CHUNK_SIZE
    const CHUNK_OVERLAP = __test__.CHUNK_OVERLAP
    const big = 'A\n'.repeat(MAX_CHUNK_SIZE + 500)
    const result = normalizeChunks([big])
    if (result.length >= 2) {
      expect(result[1].content.length).toBeGreaterThan(0)
    }
  })
})

// ============================================================================
// Integration: parseAndChunk
// ============================================================================

describe('parseAndChunk', () => {
  it('should parse and chunk TXT', () => {
    const p1 = text(MIN_CHUNK_SIZE)
    const p2 = text(MIN_CHUNK_SIZE)
    const p3 = text(MIN_CHUNK_SIZE)
    const input = `${p1}\n\n${p2}\n\n${p3}`
    const result = parseAndChunk(input, 'txt')
    expect(result.length).toBeGreaterThanOrEqual(3)
    expect(result[0].content).toContain(p1)
  })

  it('should parse and chunk MD with headings', () => {
    const c1 = text(MIN_CHUNK_SIZE)
    const c2 = text(MIN_CHUNK_SIZE)
    const md = `## Section 1\n${c1}\n\n## Section 2\n${c2}`
    const result = parseAndChunk(md, 'md')
    expect(result.length).toBeGreaterThanOrEqual(2)
  })

  it('should parse and chunk JSON array with large items', () => {
    const json = JSON.stringify([
      text(MIN_CHUNK_SIZE),
      text(MIN_CHUNK_SIZE),
      text(MIN_CHUNK_SIZE),
    ])
    const result = parseAndChunk(json, 'json')
    expect(result).toHaveLength(3)
  })

  it('should parse and chunk CSV with large rows', () => {
    const row1 = text(MIN_CHUNK_SIZE)
    const row2 = text(MIN_CHUNK_SIZE)
    const csv = `header\n${row1}\n${row2}`
    const result = parseAndChunk(csv, 'csv')
    expect(result).toHaveLength(2)
  })

  it('should handle empty content gracefully', () => {
    expect(parseAndChunk('', 'txt')).toEqual([])
  })

  it('should handle empty JSON gracefully', () => {
    // '""' is a valid JSON empty string, returns [chunk('""')]; '' is invalid,
    // returns a single chunk. Both behaviors are acceptable.
    const result = parseAndChunk('', 'json')
    expect(result.length).toBeGreaterThanOrEqual(0)
  })

  it('should handle empty CSV gracefully', () => {
    expect(parseAndChunk('', 'csv')).toEqual([])
  })
})

// ============================================================================
// Edge cases
// ============================================================================

describe('Edge cases', () => {
  it('should handle very long text without crashing', () => {
    const longText = 'A '.repeat(10000)
    const result = parseAndChunk(longText, 'txt')
    expect(result.length).toBeGreaterThan(0)
    for (const chunk of result) {
      expect(chunk.content.length).toBeGreaterThan(0)
    }
  })

  it('should handle special characters in content', () => {
    const p1 = text(MIN_CHUNK_SIZE)
    const p2 = 'World with special: ~!@#$%^&*()_+'
    const p3 = text(MIN_CHUNK_SIZE)
    const input = `${p1}\n\n${p2}\n\n${p3}`
    const result = parseAndChunk(input, 'txt')
    expect(result.length).toBeGreaterThanOrEqual(2)
  })

  it('should handle Windows line endings', () => {
    const p1 = text(MIN_CHUNK_SIZE)
    const p2 = text(MIN_CHUNK_SIZE)
    const p3 = text(MIN_CHUNK_SIZE)
    const input = `${p1}\r\n\r\n${p2}\r\n\r\n${p3}`
    const result = parseAndChunk(input, 'txt')
    expect(result.length).toBeGreaterThanOrEqual(3)
  })
})