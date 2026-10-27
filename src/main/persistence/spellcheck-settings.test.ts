import { describe, expect, it, vi } from 'vitest'
import { getDefaultPersistedState } from '../../shared/constants'
import { normalizeSpellcheckLanguages } from '../../shared/spellcheck-languages'
import {
  updateSettings,
  type SettingsMutationOperations
} from './applying-settings/settings-update'
import { normalizeLoadedGlobalSettings } from './loading-store/normalize-loaded-global-settings'
import { prepareLoadedTerminalSettings } from './loading-store/prepare-loaded-terminal-settings'
import { prepareLoadedProfileSettings } from './loading-store/prepare-loaded-profile-settings'

describe('spellcheck settings persistence', () => {
  it('normalizes tags and rejects malformed or empty values', () => {
    expect(normalizeSpellcheckLanguages([' en-gb ', 'HU', 'hu', 12, 'invalid_tag'])).toEqual([
      'en-GB',
      'hu'
    ])
    for (const invalid of [null, {}, 'hu', [], [1, 'invalid_tag']]) {
      expect(normalizeSpellcheckLanguages(invalid)).toBeUndefined()
    }
  })

  it('persists multiple languages, notifies with normalized values, and ignores an empty write', () => {
    const operations: SettingsMutationOperations = {
      state: getDefaultPersistedState('/test'),
      bumpLocalWorktreeScanGeneration: vi.fn(),
      removeRetainedBlob: vi.fn(),
      scheduleSave: vi.fn(),
      notifySettingsChanged: vi.fn()
    }
    expect(
      updateSettings(
        operations,
        { spellcheckLanguages: ['en-gb', 'hu'] },
        { notifyListeners: true }
      ).spellcheckLanguages
    ).toEqual(['en-GB', 'hu'])
    expect(operations.notifySettingsChanged).toHaveBeenCalledWith(
      { spellcheckLanguages: ['en-GB', 'hu'] },
      undefined
    )
    expect(updateSettings(operations, { spellcheckLanguages: [] }).spellcheckLanguages).toEqual([
      'en-GB',
      'hu'
    ])
  })

  it.each([undefined, [], ['en-gb', 'hu', 'hu']])(
    'reloads %j without inventing defaults',
    (languages) => {
      const parsed = getDefaultPersistedState('/test')
      parsed.settings.spellcheckLanguages = languages
      const noop = (): void => {}
      const loaded = normalizeLoadedGlobalSettings(
        parsed,
        prepareLoadedTerminalSettings(parsed, noop),
        prepareLoadedProfileSettings(parsed, getDefaultPersistedState('/test'), noop)
      )
      expect(loaded.spellcheckLanguages).toEqual(languages?.length ? ['en-GB', 'hu'] : undefined)
    }
  )
})
