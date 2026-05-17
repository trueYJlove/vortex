/**
 * Unit tests for apps/runtime/im-channels/wecom-content-utf8.
 *
 * Covers UTF-8 sanitization invariants:
 *   - ASCII / valid Chinese / mixed content is preserved verbatim
 *   - Pre-existing U+FFFD characters do not inflate the `replaced` counter
 *   - Empty string is a no-op
 *
 * The "invalid UTF-8 bytes" failure mode that triggered the SDK switch
 * cannot be reproduced from a JavaScript string literal directly (JS
 * strings are UTF-16 internally), but it surfaces when bytes are decoded
 * with the wrong codec before reaching this function. We model that here
 * by decoding a GBK-style byte sequence as latin1 to construct a string
 * whose round-trip through UTF-8 produces U+FFFD replacements.
 */

import { describe, it, expect } from 'vitest'
import {
  ensureUtf8,
  ensureUtf8WithReport,
} from '../../../../../src/main/apps/runtime/im-channels/wecom-content-utf8'

describe('ensureUtf8', () => {
  it('returns ASCII strings unchanged', () => {
    expect(ensureUtf8('hello world')).toBe('hello world')
  })

  it('returns valid Chinese UTF-8 strings unchanged', () => {
    expect(ensureUtf8('你好，世界')).toBe('你好，世界')
  })

  it('returns mixed content unchanged', () => {
    const input = 'Halo 🚀 — 测试 mixed content'
    expect(ensureUtf8(input)).toBe(input)
  })

  it('handles empty string', () => {
    expect(ensureUtf8('')).toBe('')
  })

  it('preserves emojis (4-byte UTF-8 sequences)', () => {
    const input = '✅ Done 🎉'
    expect(ensureUtf8(input)).toBe(input)
  })

  it('passes through pre-existing U+FFFD characters', () => {
    const input = 'before \uFFFD after'
    expect(ensureUtf8(input)).toBe(input)
  })
})

describe('ensureUtf8WithReport', () => {
  it('reports zero replacements for clean input', () => {
    const r = ensureUtf8WithReport('clean ascii + 中文')
    expect(r.text).toBe('clean ascii + 中文')
    expect(r.replaced).toBe(0)
  })

  it('does not count pre-existing U+FFFD as new replacements', () => {
    const input = 'already \uFFFD here'
    const r = ensureUtf8WithReport(input)
    expect(r.text).toBe(input)
    expect(r.replaced).toBe(0)
  })

  it('reports replacements for byte sequences that fail UTF-8 round-trip', () => {
    // Construct a string that contains lone-surrogate code units. When
    // re-encoded as UTF-8 via Buffer.from(str, 'utf8'), Node substitutes
    // the surrogate with U+FFFD bytes, producing a different string on
    // decode — exactly the case we need the sanitizer to flag.
    const loneSurrogate = '\uD800' // high surrogate without a low surrogate
    const input = `head ${loneSurrogate} tail`
    const r = ensureUtf8WithReport(input)
    expect(r.text.includes('\uFFFD')).toBe(true)
    expect(r.replaced).toBeGreaterThan(0)
  })

  it('handles empty string', () => {
    const r = ensureUtf8WithReport('')
    expect(r.text).toBe('')
    expect(r.replaced).toBe(0)
  })
})
