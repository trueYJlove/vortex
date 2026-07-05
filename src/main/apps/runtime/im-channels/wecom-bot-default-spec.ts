/**
 * Default assistant spec for the WeCom scan-auth flow.
 *
 * After a successful QR scan-authorization the renderer asks the main
 * process to install a fresh automation app bound to the new bot. The
 * spec produced here is intentionally minimal — the user can rewrite
 * the system prompt in the app detail page at any time.
 *
 * Why this lives in its own file:
 *   - Both the IPC handler (`src/main/ipc/wecom-bot.ts`) and the HTTP
 *     route (`src/main/http/routes/index.ts`) need the same default,
 *     so a single source of truth avoids drift.
 *   - Construction depends on runtime context (`app.getLocale()`),
 *     so the literal cannot be a plain const.
 *   - Keeping it next to `wecom-bot-scan-auth.ts` colocates all
 *     scan-auth-specific helpers without overloading that module's
 *     responsibility (it owns the long-poll session lifecycle).
 */

import { app } from 'electron'
import type { AutomationSpec } from '../../spec'

const PROMPT_EN = [
  'You are a helpful assistant.',
  'Keep replies concise and clear.',
  "Reply in the same language as the user's message.",
].join('\n')

const PROMPT_ZH = [
  '你是一个有用的助手。',
  '回复请简明清晰。',
  '请使用与用户消息相同的语言回复。',
].join('\n')

/**
 * Pick the prompt language from the Electron app locale. Anything starting
 * with `zh` (zh-CN, zh-TW, zh-HK, ...) maps to Chinese; everything else
 * falls back to English.
 *
 * Defensive: `app.getLocale()` can throw if invoked before the app is
 * ready (some test harnesses). English is the safe fallback.
 */
function resolveSystemPrompt(): string {
  try {
    const locale = app.getLocale()
    return locale.toLowerCase().startsWith('zh') ? PROMPT_ZH : PROMPT_EN
  } catch {
    return PROMPT_EN
  }
}

/**
 * Build the spec for an auto-created WeCom assistant.
 *
 * @param botIdPrefix — short suffix appended to the app name so multiple
 *   scan-auth sessions produce distinguishable entries in the apps list.
 */
export function buildDefaultAssistantSpec(botIdPrefix: string): AutomationSpec {
  return {
    spec_version: '1',
    name: `WeCom Assistant ${botIdPrefix}`,
    version: '1.0',
    author: 'Vortex',
    description: 'Auto-created WeCom Intelligent Bot assistant. Edit the system prompt anytime in the app detail page.',
    type: 'automation',
    system_prompt: resolveSystemPrompt(),
    // No subscriptions — IM message is the trigger.
  }
}
