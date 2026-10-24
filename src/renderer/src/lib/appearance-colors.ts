import type { AppearanceColors } from '../../../shared/appearance-colors'
import { normalizeAppearanceColors } from '../../../shared/appearance-colors'
import { contrastingColor, isTerminalBackgroundLight } from './terminal-title-contrast'

export function appearanceAccentTokens(accent: string, background: string): Record<string, string> {
  const primary = contrastingColor(accent, background, 6)
  return {
    '--primary': primary,
    '--primary-foreground': isTerminalBackgroundLight(primary) ? '#000000' : '#ffffff',
    '--ring': contrastingColor(accent, background),
    '--chat-focus-ring': contrastingColor(accent, background),
    '--chat-link': contrastingColor(accent, background)
  }
}

export function applyAppearanceColors(settings: AppearanceColors | null | undefined): void {
  const root = document.documentElement
  const colors = normalizeAppearanceColors(settings ?? undefined)
  for (const [key, token] of [
    ['tabBarBackground', 'tab-bar'],
    ['tabBackground', 'tab'],
    ['activeTabBackground', 'active-tab'],
    ['statusBarBackground', 'status-bar']
  ] as const) {
    const color = colors[key]
    root.toggleAttribute(`data-custom-${token}`, Boolean(color))
    if (color) {
      root.style.setProperty(`--${token}-background`, color)
      root.style.setProperty(
        `--${token}-foreground`,
        isTerminalBackgroundLight(color) ? '#000000' : '#ffffff'
      )
    } else {
      root.style.removeProperty(`--${token}-background`)
      root.style.removeProperty(`--${token}-foreground`)
    }
  }
  const tokens = colors.accentColor
    ? appearanceAccentTokens(
        colors.accentColor,
        root.classList.contains('dark') ? '#0a0a0a' : '#ffffff'
      )
    : {}
  for (const token of [
    '--primary',
    '--primary-foreground',
    '--ring',
    '--chat-focus-ring',
    '--chat-link'
  ]) {
    if (tokens[token]) {
      root.style.setProperty(token, tokens[token])
    } else {
      root.style.removeProperty(token)
    }
  }
}
