/**
 * apps/runtime/im-channels -- WeCom content UTF-8 sanitizer
 *
 * Pure-function utility for ensuring WeCom stream/markdown content payloads
 * contain only valid UTF-8 sequences.
 *
 * Background: WeCom's official protocol requires that the `markdown.content`
 * and `stream.content` fields "必须是 utf8 编码" (must be UTF-8). Tool output
 * from external commands on Windows (wmic, systeminfo running in a GBK
 * locale, etc.) can produce byte sequences that are not valid UTF-8. When
 * these bytes get concatenated into a stream-reply content string, the
 * WeCom client may silently refuse to render further stream updates — the
 * user sees "已完成思考" and progress lines but the final answer never
 * appears.
 *
 * The sanitizer round-trips the input through Buffer<->string with explicit
 * UTF-8 encoding. The Node.js TextDecoder used internally replaces any
 * invalid byte sequence with U+FFFD (REPLACEMENT CHARACTER), which is the
 * standard Unicode behaviour and renders fine in WeCom clients.
 *
 * This module is intentionally zero-dependency and small enough to unit-test
 * in isolation.
 */

/** Unicode REPLACEMENT CHARACTER (U+FFFD) — produced for invalid UTF-8 bytes. */
const REPLACEMENT_CHAR = '\uFFFD'

/**
 * Sanitize a string so that it contains only valid UTF-8 sequences when
 * encoded. Invalid byte sequences are replaced with U+FFFD.
 *
 * Implementation note: we round-trip via a UTF-8 Buffer using the strict
 * `TextDecoder('utf-8', { fatal: false })` semantics. JavaScript strings are
 * conceptually UTF-16, but if a caller has constructed a string by decoding
 * legacy bytes with the wrong codec (e.g. interpreting GBK as latin1) the
 * resulting code points may include lone surrogates or sequences that
 * cannot be re-encoded losslessly. The round-trip surfaces those as U+FFFD.
 *
 * @param input - Possibly malformed string content
 * @returns A string whose byte representation is valid UTF-8 end-to-end.
 */
export function ensureUtf8(input: string): string {
  if (input.length === 0) return input
  // Encode -> decode round-trip; Node's TextDecoder replaces invalid bytes.
  const buf = Buffer.from(input, 'utf8')
  return new TextDecoder('utf-8', { fatal: false }).decode(buf)
}

/**
 * Same as {@link ensureUtf8} but also reports how many additional U+FFFD
 * replacement characters were introduced by sanitization. Useful for
 * logging when content actually had to be cleansed.
 *
 * @param input - Possibly malformed string content
 * @returns `{ text, replaced }` where `replaced` is the number of new
 *          replacement characters introduced (does not count pre-existing
 *          U+FFFD already present in `input`).
 */
export function ensureUtf8WithReport(input: string): {
  text: string
  replaced: number
} {
  if (input.length === 0) return { text: input, replaced: 0 }
  const preCount = countReplacements(input)
  const text = ensureUtf8(input)
  const postCount = countReplacements(text)
  const replaced = Math.max(0, postCount - preCount)
  return { text, replaced }
}

/** Count occurrences of U+FFFD in a string. Linear scan, no regex allocation. */
function countReplacements(s: string): number {
  let count = 0
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) === 0xfffd) count++
  }
  return count
}

/** Exported for tests. */
export const __TESTING__ = { REPLACEMENT_CHAR }
