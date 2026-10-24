import { expect, it } from 'vitest'
import { getDefaultSettings } from '../../../shared/constants'
import { mergeSettings } from './preload-api/web-preference-normalization'

it('normalizes browser colors, preserves unrelated keys and clears explicit resets', () => {
  const base = { ...getDefaultSettings('/tmp'), futureAppearance: 'keep' }
  const saved = mergeSettings(base, { tabBackground: ' ABC ', accentColor: 'url(x)' })
  expect(saved.tabBackground).toBe('#aabbcc')
  expect(saved.accentColor).toBeUndefined()
  expect(saved).toHaveProperty('futureAppearance', 'keep')
  expect(mergeSettings(saved, { theme: 'light' }).tabBackground).toBe('#aabbcc')
  expect(mergeSettings(saved, { tabBackground: undefined }).tabBackground).toBeUndefined()
})
