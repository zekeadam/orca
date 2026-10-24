import type { AppearanceColorKey } from '../../../../shared/appearance-colors'
import { translate } from '@/i18n/i18n'
import type { SettingsSearchEntry } from './settings-search'
import { translateSearchKeyword } from './settings-search-keywords'

export function getAppearanceColorEntries(): (SettingsSearchEntry & { key: AppearanceColorKey })[] {
  const entries = [
    {
      key: 'tabBarBackground',
      title: translate('settings.appearance.colors.tabBarBackground', 'Tab bar background')
    },
    {
      key: 'tabBackground',
      title: translate('settings.appearance.colors.tabBackground', 'Tab background')
    },
    {
      key: 'activeTabBackground',
      title: translate('settings.appearance.colors.activeTabBackground', 'Active tab background')
    },
    {
      key: 'statusBarBackground',
      title: translate('settings.appearance.colors.statusBarBackground', 'Status bar background')
    },
    {
      key: 'accentColor',
      title: translate('settings.appearance.colors.accentColor', 'Accent color')
    }
  ] satisfies (SettingsSearchEntry & { key: AppearanceColorKey })[]
  return entries.map((entry) => ({
    ...entry,
    keywords: [
      ...translateSearchKeyword('settings.appearance.colors.keywordColors', 'colors'),
      ...translateSearchKeyword('settings.appearance.colors.keywordAppearance', 'appearance'),
      ...translateSearchKeyword('settings.appearance.colors.keywordHex', 'hex'),
      ...translateSearchKeyword('settings.appearance.colors.keywordCustom', 'custom'),
      ...translateSearchKeyword('settings.appearance.colors.keywordReset', 'reset'),
      ...translateSearchKeyword('settings.appearance.colors.keywordTitlebar', 'titlebar'),
      ...translateSearchKeyword('settings.appearance.colors.keywordFocus', 'focus'),
      ...translateSearchKeyword('settings.appearance.colors.keywordLinks', 'links')
    ]
  }))
}
