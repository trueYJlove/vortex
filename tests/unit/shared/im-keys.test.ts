/**
 * Unit tests for the conversation-id key builders in shared/apps/im-keys.ts.
 *
 * These keys are the single source of truth for session isolation + event
 * routing across the renderer chat store, runtime, and IM channels. The critical
 * invariant is that the three key families never collide:
 *   - "app-chat:{appId}"                          native digital-human chat
 *   - "app-chat:{appId}:{channel}:{type}:{chatId}" IM session
 *   - "app-run:{runId}"                            automation run live stream
 */

import { describe, it, expect } from 'vitest'
import {
  getAppChatConversationId,
  buildImSessionKey,
  isImSessionKey,
  isAppRunKey,
} from '../../../src/shared/apps/im-keys'

describe('im-keys: app-run key', () => {
  it('isAppRunKey only matches the app-run prefix', () => {
    expect(isAppRunKey('app-run:abc')).toBe(true)
    expect(isAppRunKey('app-run:550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(isAppRunKey('app-chat:app1')).toBe(false)
    expect(isAppRunKey('app-chat:app1:wecom-bot:direct:user-1')).toBe(false)
    expect(isAppRunKey('some-real-conversation-uuid')).toBe(false)
    expect(isAppRunKey('')).toBe(false)
  })
})

describe('im-keys: family isolation (no cross-collision)', () => {
  it('an app-run key is neither an IM key nor an app-chat key', () => {
    const runKey = 'app-run:run-xyz'
    expect(isAppRunKey(runKey)).toBe(true)
    expect(isImSessionKey(runKey)).toBe(false)
    expect(runKey.startsWith('app-chat:')).toBe(false)
  })

  it('an IM key is not an app-run key', () => {
    const imKey = buildImSessionKey('app1', 'wecom-bot', 'direct', 'user-1')
    expect(imKey).toBe('app-chat:app1:wecom-bot:direct:user-1')
    expect(isImSessionKey(imKey)).toBe(true)
    expect(isAppRunKey(imKey)).toBe(false)
  })

  it('a native app-chat key is neither an IM key nor an app-run key', () => {
    const chatKey = getAppChatConversationId('app1')
    expect(chatKey).toBe('app-chat:app1')
    expect(isImSessionKey(chatKey)).toBe(false)
    expect(isAppRunKey(chatKey)).toBe(false)
  })

  it('isImSessionKey requires exactly 5 colon-separated segments', () => {
    // group chat ids that themselves contain no colon
    expect(isImSessionKey('app-chat:a:feishu:group:room')).toBe(true)
    // too few segments
    expect(isImSessionKey('app-chat:a:feishu:group')).toBe(false)
  })
})
