// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { appearanceAccentTokens, applyAppearanceColors } from './appearance-colors'
import { cssColorContrast } from './terminal-title-contrast'
import {
  nativeChatAppearanceStyle,
  selectNativeChatAppearanceSettings
} from '../components/native-chat/native-chat-appearance-style'

afterEach(() => applyAppearanceColors(undefined))
describe('appearance color application', () => {
  it('removes overrides on reset without leaving a theme-specific value', () => {
    applyAppearanceColors({ tabBackground: '#fff', accentColor: '#abc' })
    expect(document.documentElement.style.getPropertyValue('--tab-background')).toBe('#ffffff')
    expect(document.documentElement.hasAttribute('data-custom-tab')).toBe(true)
    applyAppearanceColors({})
    expect(document.documentElement.style.getPropertyValue('--tab-background')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('')
    expect(document.documentElement.hasAttribute('data-custom-tab')).toBe(false)
  })
  it('keeps primary text and accent links readable across light, dark and tinted canvases', () => {
    for (const accent of [
      '#ffffff',
      '#000000',
      '#808080',
      '#ffff00',
      '#00ffff',
      '#ff00ff',
      '#123456'
    ]) {
      for (const bg of ['#ffffff', '#0a0a0a', '#161616', '#556677', '#aabbcc']) {
        const tokens = appearanceAccentTokens(accent, bg)
        expect(
          cssColorContrast(tokens['--primary-foreground'], tokens['--primary'])
        ).toBeGreaterThanOrEqual(4.5)
        expect(cssColorContrast(tokens['--primary'], bg)).toBeGreaterThanOrEqual(4.5)
        expect(cssColorContrast(tokens['--chat-link'], bg)).toBeGreaterThanOrEqual(4.5)
        expect(cssColorContrast(tokens['--ring'], bg)).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
  it('uses the matched terminal canvas for chat accent and leaves defaults unset', () => {
    expect(nativeChatAppearanceStyle({ theme: 'light' })['--chat-link']).toBeUndefined()
    const settings = {
      theme: 'dark',
      accentColor: '#ffff00',
      nativeChatAppearance: { matchTerminalInterface: true },
      terminalColorOverrides: { background: '#ffffff', foreground: '#000000' }
    } as const
    expect(selectNativeChatAppearanceSettings(settings).accentColor).toBe('#ffff00')
    const style = nativeChatAppearanceStyle(settings)
    expect(style['--chat-link']).toBeDefined()
    expect(cssColorContrast(String(style['--primary']), '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })
})
