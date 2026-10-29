import { describe, expect, it } from 'vitest'
import { normalizeNativeChatPromptPresets } from './native-chat-prompt-presets'

describe('saved prompt presets', () => {
  it('supports existing profiles and rejects malformed data', () => {
    expect(normalizeNativeChatPromptPresets(undefined)).toEqual([])
    expect(normalizeNativeChatPromptPresets([null, {}, { name: 1, prompt: 'x' }])).toEqual([])
  })
  it('preserves exact prompts and empty slots, with at most nine shortcuts', () => {
    const entries = Array.from({ length: 11 }, (_, index) => ({
      name: String(index),
      prompt: index === 1 ? '' : '\n  exact prompt  \n'
    }))
    expect(normalizeNativeChatPromptPresets(entries)).toEqual(entries.slice(0, 9))
  })
})
