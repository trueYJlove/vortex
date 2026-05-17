/**
 * Shared privacy-safe error code derivation for analytics.
 *
 * Multiple analytics call sites (run failures in apps.subscriber, model
 * invocation errors in stream-processor, IPC error surfaces) need to reduce a
 * raw error message to a short, dashboard-friendly identifier without
 * leaking the full error text. Centralized here so every site uses the
 * same shape, and the global SENSITIVE_KEYS gate has exactly one source of
 * `errorCode` values to reason about.
 *
 * Strategy: take the first colon / whitespace-delimited token of the
 * trimmed message, capped at 48 chars. Returns undefined for empty input
 * so the analytics provider can drop the key entirely.
 */

/** Maximum length of the derived code. Dashboards bucket by this string. */
const MAX_CODE_LENGTH = 48

/**
 * Derive a short, privacy-safe error code from a raw error message or Error.
 *
 * Returns undefined when the input is empty / unusable. The full message
 * never leaves the main process; only the derived token is forwarded to
 * telemetry providers (and even then, only when allowedSensitiveFields
 * grants 'errorCode').
 */
export function deriveErrorCode(input: unknown): string | undefined {
  let raw: string

  if (input instanceof Error) {
    raw = input.message
  } else if (typeof input === 'string') {
    raw = input
  } else if (input == null) {
    return undefined
  } else {
    // Best-effort stringification — never throw from a telemetry helper.
    try {
      raw = String(input)
    } catch {
      return undefined
    }
  }

  const trimmed = raw.trim()
  if (!trimmed) return undefined

  const firstToken = trimmed.split(/[\s:]+/, 1)[0] ?? trimmed
  return firstToken.slice(0, MAX_CODE_LENGTH)
}
