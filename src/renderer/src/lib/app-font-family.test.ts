import { describe, expect, it } from 'vitest'
import { buildAppFontFamily } from './app-font-family'

describe('app typography', () => {
  it('uses the shared monospace identity when no font is configured', () => {
    for (const font of [undefined, null, '', '  ']) {
      expect(buildAppFontFamily(font)).toBe(
        '"Consolas", "SFMono-Regular", "Liberation Mono", monospace'
      )
    }
  })

  it('keeps an explicit custom font first and quotes its name safely', () => {
    expect(buildAppFontFamily('  Geist  ')).toBe(
      '"Geist", "Consolas", "SFMono-Regular", "Liberation Mono", monospace'
    )
    expect(buildAppFontFamily('A "custom" font').split(', ')[0]).toBe(
      JSON.stringify('A "custom" font')
    )
  })

  it('deduplicates a configured fallback and preserves generic keywords', () => {
    expect(buildAppFontFamily('liberation mono')).toBe(
      '"liberation mono", "Consolas", "SFMono-Regular", monospace'
    )
    expect(buildAppFontFamily('monospace')).toBe(
      'monospace, "Consolas", "SFMono-Regular", "Liberation Mono"'
    )
  })
})
