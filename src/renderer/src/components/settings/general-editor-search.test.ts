import { describe, expect, it } from 'vitest'
import { getGeneralEditorSearchEntries, getGeneralPaneSearchEntries } from './general-search'
import { matchesSettingsSearch } from './settings-search'
import { getSpellcheckLanguagesSearchEntry } from './spellcheck-languages-search'

it.each(['spellcheck', 'languages', 'Hungarian', 'magyar', 'English', 'dictionary'])(
  'preserves Spellcheck Languages search terms after moving to Z Settings: %s',
  (query) => {
    expect(matchesSettingsSearch(query, getSpellcheckLanguagesSearchEntry())).toBe(true)
    expect(
      getGeneralEditorSearchEntries().some(
        (entry) => entry.title === getSpellcheckLanguagesSearchEntry().title
      )
    ).toBe(false)
  }
)

describe('collapse unchanged settings search', () => {
  it.each(['collapse unchanged', 'collapse', 'hide unchanged', 'fold', 'diff'])(
    'keeps the setting reachable through both search gates for "%s"',
    (query) => {
      const editorEntries = getGeneralEditorSearchEntries()
      const entry = editorEntries.find((item) => item.title === 'Collapse Unchanged Regions')

      expect(entry).toBeDefined()
      expect(matchesSettingsSearch(query, entry!)).toBe(true)
      expect(matchesSettingsSearch(query, editorEntries)).toBe(true)
      expect(matchesSettingsSearch(query, getGeneralPaneSearchEntries())).toBe(true)
    }
  )
})
