import { useAppStore } from '../../store'
import { translate } from '@/i18n/i18n'
import { SettingsSubsectionHeader } from './SettingsFormControls'
import { KeybindingsFileActions } from './KeybindingsFileActions'

export function ShortcutsFileHeader() {
  const keybindingSnapshot = useAppStore((state) => state.keybindingSnapshot)
  return (
    <SettingsSubsectionHeader
      title={translate('auto.components.settings.ShortcutsPane.47f8f7aef9', 'Keyboard Shortcuts')}
      description={
        <>
          {translate(
            'auto.components.settings.ShortcutsPane.38e86e206a',
            'Customize shortcuts visually or edit'
          )}{' '}
          <span className="font-mono text-2xs">
            {keybindingSnapshot?.path ??
              translate(
                'auto.components.settings.ShortcutsPane.d8c988dab4',
                '~/.orca/keybindings.json'
              )}
          </span>{' '}
          {translate('auto.components.settings.ShortcutsPane.4b7ae34062', 'directly.')}
        </>
      }
      action={<KeybindingsFileActions />}
    />
  )
}
