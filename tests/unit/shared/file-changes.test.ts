/**
 * Tests for the FileChangesSummary boundary normalizer.
 *
 * Why: persisted summaries may be malformed (legacy builds, partial writes).
 * The renderer must never crash on bad input.
 */

import { describe, it, expect } from 'vitest'
import { normalizeFileChangesSummary } from '../../../src/shared/file-changes'

describe('normalizeFileChangesSummary', () => {
  it('returns undefined for non-object or empty input', () => {
    expect(normalizeFileChangesSummary(undefined)).toBeUndefined()
    expect(normalizeFileChangesSummary(null)).toBeUndefined()
    expect(normalizeFileChangesSummary({})).toBeUndefined()
  })

  it('regression: tolerates missing edited/created arrays (was the red-screen bug)', () => {
    expect(normalizeFileChangesSummary({ created: [{ file: 'a.ts', lines: 10 }] })).toEqual({
      edited: [],
      created: [{ file: 'a.ts', lines: 10 }],
      totalFiles: 1,
      totalAdded: 10,
      totalRemoved: 0,
    })
  })

  it('drops items missing a valid file path and coerces non-numeric stats', () => {
    const result = normalizeFileChangesSummary({
      edited: [
        { file: 'a.ts', added: 'x' as any, removed: NaN as any },
        { file: '', added: 1, removed: 1 },
        null as any,
      ],
      created: [],
    })
    expect(result?.edited).toEqual([{ file: 'a.ts', added: 0, removed: 0 }])
  })

  it('passes through a well-formed summary unchanged', () => {
    const input = {
      edited: [{ file: 'a.ts', added: 3, removed: 1 }],
      created: [{ file: 'b.ts', lines: 8 }],
      totalFiles: 2,
      totalAdded: 11,
      totalRemoved: 1,
    }
    expect(normalizeFileChangesSummary(input)).toEqual(input)
  })
})
