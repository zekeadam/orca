import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translateSearchKeyword } from './settings-search-keywords'

export const getSpellcheckLanguagesSearchEntry = createLocalizedCatalog(() => ({
  title: translate('settings.spellcheckLanguages.title', 'Spellcheck Languages'),
  description: translate(
    'settings.spellcheckLanguages.description',
    'Choose languages for spelling underlines and suggestions in Orca. Keep English selected when adding another language.'
  ),
  keywords: [
    ...translateSearchKeyword('settings.spellcheckLanguages.keywords.spellcheck', 'spellcheck'),
    ...translateSearchKeyword('settings.spellcheckLanguages.keywords.spellCheck', 'spell check'),
    ...translateSearchKeyword('settings.spellcheckLanguages.keywords.spelling', 'spelling'),
    ...translateSearchKeyword('settings.spellcheckLanguages.keywords.languages', 'languages'),
    ...translateSearchKeyword('settings.spellcheckLanguages.keywords.dictionary', 'dictionary'),
    ...translateSearchKeyword('settings.spellcheckLanguages.keywords.hungarian', 'Hungarian'),
    ...translateSearchKeyword('settings.spellcheckLanguages.keywords.magyar', 'magyar'),
    ...translateSearchKeyword('settings.spellcheckLanguages.keywords.english', 'English')
  ]
}))
