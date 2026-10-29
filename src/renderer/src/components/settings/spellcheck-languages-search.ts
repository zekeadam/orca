import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export const getSpellcheckLanguagesSearchEntry = createLocalizedCatalog(() => ({
  title: translate('settings.spellcheckLanguages.title', 'Spellcheck Languages'),
  description: translate(
    'settings.spellcheckLanguages.description',
    'Choose languages for spelling underlines and suggestions in Orca. Keep English selected when adding another language.'
  ),
  keywords: [
    'spellcheck',
    'spell check',
    'spelling',
    'languages',
    'dictionary',
    'Hungarian',
    'magyar',
    'English'
  ]
}))
