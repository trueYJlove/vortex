/**
 * Unit tests for apps/runtime/im-channels/wecom-bot-default-spec.
 *
 * The helper produces the AutomationSpec that the WeCom scan-auth flow
 * installs after a successful QR approval. Coverage:
 *
 *   1. zh-* locales (zh-CN, zh-TW, ...) → Chinese prompt
 *   2. Other locales (en, en-US, ja, de, ...) → English prompt
 *   3. app.getLocale() throwing → English fallback
 *   4. Stable metadata: name carries the bot prefix, type/version fields fixed
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const getLocaleMock = vi.fn<[], string>()

vi.mock('electron', () => ({
  app: {
    getLocale: () => getLocaleMock(),
  },
}))

import { buildDefaultAssistantSpec } from '../../../../../src/main/apps/runtime/im-channels/wecom-bot-default-spec'

describe('buildDefaultAssistantSpec', () => {
  beforeEach(() => {
    getLocaleMock.mockReset()
  })

  it('uses the Chinese prompt when the locale starts with zh', () => {
    for (const locale of ['zh-CN', 'zh-TW', 'zh-HK', 'zh']) {
      getLocaleMock.mockReturnValueOnce(locale)
      const spec = buildDefaultAssistantSpec('abc')
      expect(spec.system_prompt).toContain('你是一个有用的助手')
      expect(spec.system_prompt).not.toContain('Keep replies concise')
    }
  })

  it('uses the English prompt for non-zh locales', () => {
    for (const locale of ['en', 'en-US', 'ja', 'de', 'fr', 'es', '']) {
      getLocaleMock.mockReturnValueOnce(locale)
      const spec = buildDefaultAssistantSpec('abc')
      expect(spec.system_prompt).toContain('You are a helpful assistant')
      expect(spec.system_prompt).not.toContain('你是一个有用的助手')
    }
  })

  it('falls back to English when app.getLocale throws', () => {
    getLocaleMock.mockImplementationOnce(() => {
      throw new Error('app not ready')
    })
    const spec = buildDefaultAssistantSpec('abc')
    expect(spec.system_prompt).toContain('You are a helpful assistant')
  })

  it('does not mention WeCom or AI in the default prompt', () => {
    for (const locale of ['en-US', 'zh-CN']) {
      getLocaleMock.mockReturnValueOnce(locale)
      const prompt = buildDefaultAssistantSpec('abc').system_prompt ?? ''
      expect(prompt).not.toMatch(/WeCom/i)
      expect(prompt).not.toMatch(/企业微信/)
      expect(prompt).not.toMatch(/\bAI assistant\b/i)
    }
  })

  it('instructs the model to mirror the user message language', () => {
    getLocaleMock.mockReturnValueOnce('en-US')
    expect(buildDefaultAssistantSpec('abc').system_prompt).toMatch(
      /same language as the user's message/i,
    )
    getLocaleMock.mockReturnValueOnce('zh-CN')
    expect(buildDefaultAssistantSpec('abc').system_prompt).toContain(
      '与用户消息相同的语言',
    )
  })

  it('encodes the bot prefix into the app name and keeps fixed metadata', () => {
    getLocaleMock.mockReturnValue('en-US')
    const spec = buildDefaultAssistantSpec('xy12')
    expect(spec.name).toBe('WeCom Assistant xy12')
    expect(spec.type).toBe('automation')
    expect(spec.spec_version).toBe('1')
    expect(spec.version).toBe('1.0')
    expect(spec.author).toBe('Halo')
  })
})
