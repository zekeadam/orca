import { useId, useState } from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import {
  APPEARANCE_COLOR_KEYS,
  normalizeAppearanceColor
} from '../../../../shared/appearance-colors'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { SettingsRow, SettingsSubsectionHeader } from './SettingsFormControls'
import { SearchableSetting } from './SearchableSetting'
import { getAppearanceColorEntries } from './appearance-color-search'
import { translate } from '@/i18n/i18n'

function AppearanceColorField({
  label,
  value,
  onChange
}: {
  label: string
  value: string | undefined
  onChange: (color: string | undefined) => void
}): React.JSX.Element {
  const id = useId()
  const [draft, setDraft] = useState(value ?? '')
  const [previous, setPrevious] = useState(value)
  if (previous !== value) {
    setPrevious(value)
    setDraft(value ?? '')
  }
  const invalid = Boolean(draft.trim() && !normalizeAppearanceColor(draft))
  const commit = (): void => {
    if (invalid) {
      return
    }
    const next = normalizeAppearanceColor(draft)
    onChange(next)
    setDraft(next ?? '')
  }
  return (
    <SettingsRow
      label={label}
      control={
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label={translate('settings.appearance.colors.pickerLabel', '{{label}} picker', {
                label
              })}
              value={normalizeAppearanceColor(value) ?? '#808080'}
              className="h-8 w-10 rounded-md border border-input bg-transparent p-1"
              onChange={(event) => {
                setDraft(event.target.value)
                onChange(event.target.value)
              }}
            />
            <Input
              aria-label={label}
              aria-invalid={invalid}
              aria-describedby={invalid ? id : undefined}
              className="w-32"
              placeholder={translate('settings.appearance.colors.default', 'Default')}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  commit()
                }
                if (event.key === 'Escape') {
                  setDraft(value ?? '')
                }
              }}
            />
            <Button
              variant="ghost"
              size="xs"
              aria-label={translate('settings.appearance.colors.resetLabel', 'Reset {{label}}', {
                label
              })}
              disabled={!value && !draft}
              onClick={() => {
                setDraft('')
                onChange(undefined)
              }}
            >
              {translate('settings.appearance.colors.reset', 'Reset')}
            </Button>
          </div>
          {invalid ? (
            <p id={id} role="alert" className="text-xs text-destructive">
              {translate('settings.appearance.colors.invalid', 'Enter a 3 or 6 digit hex color.')}
            </p>
          ) : null}
        </div>
      }
    />
  )
}

export function AppearanceColorSettings({
  settings,
  updateSettings,
  forceVisible = false
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
  forceVisible?: boolean
}): React.JSX.Element {
  const [resetVersion, setResetVersion] = useState(0)
  return (
    <div className="space-y-2">
      <SettingsSubsectionHeader
        title={translate('settings.appearance.colors.title', 'Colors')}
        action={
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              const updates: Partial<GlobalSettings> = {}
              for (const key of APPEARANCE_COLOR_KEYS) {
                updates[key] = undefined
              }
              updateSettings(updates)
              setResetVersion((version) => version + 1)
            }}
          >
            {translate('settings.appearance.colors.resetAll', 'Reset colors')}
          </Button>
        }
      />
      {getAppearanceColorEntries().map((entry) => (
        <SearchableSetting
          key={`${entry.key}-${resetVersion}`}
          title={entry.title}
          keywords={entry.keywords}
          forceVisible={forceVisible}
        >
          <AppearanceColorField
            label={entry.title}
            value={settings[entry.key]}
            onChange={(color) => updateSettings({ [entry.key]: color })}
          />
        </SearchableSetting>
      ))}
    </div>
  )
}
