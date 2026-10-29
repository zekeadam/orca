import { useAppStore } from '../../store'
import { SpellcheckLanguagesSetting } from './SpellcheckLanguagesSetting'
import { ShortcutsPane } from './ShortcutsPane'
import { SearchableSetting } from './SearchableSetting'
import { getKeybindingDefinition } from '../../../../shared/keybindings'

export function ZCustomSettings() {
  const settings = useAppStore((state) => state.settings)
  const quit = getKeybindingDefinition('app.quit')
  return (
    <div className="space-y-6">
      <SpellcheckLanguagesSetting settings={settings ?? {}} />
      {quit && (
        <SearchableSetting title={quit.title} keywords={[...quit.searchKeywords]}>
          <ShortcutsPane customOnly />
        </SearchableSetting>
      )}
    </div>
  )
}
