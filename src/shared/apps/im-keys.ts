/**
 * IM session key builders — shared between main process and renderer.
 *
 * The conversation-ID format is the single source of truth for session
 * isolation across all layers: runtime, event routing, store lookups, and
 * renderer subscriptions.  Both sides MUST use these functions instead of
 * constructing the key string inline, so that any future format change is
 * automatically reflected everywhere.
 */

/**
 * Build the virtual conversationId for the native Halo app-chat session.
 * Used for V2 session keying, active session tracking, and renderer event routing.
 *
 * Format: "app-chat:{appId}"
 */
export function getAppChatConversationId(appId: string): string {
  return `app-chat:${appId}`
}

/**
 * Build a fully-qualified session key for IM channel conversations.
 *
 * Format: "app-chat:{appId}:{channel}:{chatType}:{chatId}"
 *
 * This ensures complete session isolation across channels, chat types, and
 * individual chats.  The prefix "app-chat:" keeps the key in the same
 * namespace as native app-chat so the renderer's chat store can handle both
 * uniformly.
 */
export function buildImSessionKey(
  appId: string,
  channel: string,
  chatType: 'direct' | 'group',
  chatId: string
): string {
  return `app-chat:${appId}:${channel}:${chatType}:${chatId}`
}

/**
 * Check whether a conversationId belongs to an IM channel session.
 *
 * IM keys have the form "app-chat:{appId}:{channel}:{chatType}:{chatId}"
 * (5 segments, 4 colons).  Other key formats in the system:
 *   - Native Halo chat:  "app-chat:{appId}"           (2 segments, 1 colon)
 *   - Automation run:    "app-run:{runId}"            (virtual conversation id)
 *
 * Keeping this predicate next to buildImSessionKey ensures the detection
 * logic stays in sync with the key format (single source of truth).
 */
export function isImSessionKey(conversationId: string): boolean {
  // IM keys always start with "app-chat:" and have exactly 5 colon-separated segments
  return conversationId.startsWith('app-chat:') && conversationId.split(':').length === 5
}

/**
 * Check whether a conversationId belongs to the app-chat namespace — native
 * digital-human chat ("app-chat:{appId}") or any IM session under it. Keeps the
 * "app-chat:" prefix knowledge here rather than inlined at call sites.
 */
export function isAppChatKey(conversationId: string): boolean {
  return conversationId.startsWith('app-chat:')
}

/** Prefix for the automation-run virtual conversation id. */
const APP_RUN_PREFIX = 'app-run:'

/**
 * Check whether a conversationId is an automation-run key ("app-run:{runId}").
 *
 * An automation run is a headless execution, not a real user conversation: it
 * emits no renderer events and is observed by reading its JSONL transcript. The
 * renderer chat store uses this predicate only to keep run keys out of the
 * conversation sidebar and Pulse panel, and to evict any transient run session
 * entry on completion.
 */
export function isAppRunKey(conversationId: string): boolean {
  return conversationId.startsWith(APP_RUN_PREFIX)
}
