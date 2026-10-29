import { describe, expect, it } from 'vitest'
import { normalizeAppearanceColors } from './appearance-colors'

describe('appearance colors', () => {
  it('normalizes optional hex values and rejects CSS injection', () => {
    expect(normalizeAppearanceColors(undefined)).toEqual({})
    expect(
      normalizeAppearanceColors({ tabBackground: ' ABC ', accentColor: 'red; color: red' })
    ).toEqual({ tabBackground: '#aabbcc', accentColor: undefined })
    expect(normalizeAppearanceColors({ activeTabBackground: '#12345678' })).toEqual({
      activeTabBackground: undefined
    })
    expect(normalizeAppearanceColors({ tabBackground: undefined })).toEqual({
      tabBackground: undefined
    })
  })
})
