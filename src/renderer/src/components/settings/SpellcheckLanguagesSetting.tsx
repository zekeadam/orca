import { useEffect, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { SpellcheckCapabilities } from '../../../../shared/spellcheck-languages'
import { getIntlLocale, translate } from '@/i18n/i18n'
import { useAppStore } from '../../store'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '../ui/command'
import { SearchableSetting } from './SearchableSetting'

type Props = {
  settings: Pick<GlobalSettings, 'spellcheckLanguages'>
}

function languageLabel(language: string): string {
  try {
    const name = new Intl.DisplayNames([getIntlLocale()], { type: 'language' }).of(language)
    const nativeName = new Intl.DisplayNames([language], { type: 'language' }).of(language)
    return [...new Set([name, nativeName, language].filter(Boolean))].join(' · ')
  } catch {
    return language
  }
}

export function SpellcheckLanguagesSetting({ settings }: Props): React.JSX.Element {
  const updateSettingsOrThrow = useAppStore((state) => state.updateSettingsOrThrow)
  const [capabilities, setCapabilities] = useState<SpellcheckCapabilities | null>(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [draft, setDraft] = useState<string[] | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)

  useEffect(() => {
    let active = true
    const read = window.api.settings.getSpellcheckCapabilities
    if (!read) {
      setCapabilities({ managedBy: 'system', availableLanguages: [], enabledLanguages: [] })
      return
    }
    void read().then(
      (value) => {
        if (active) {
          setCapabilities(value)
          setFailed(false)
        }
      },
      () => {
        if (active) {
          setFailed(true)
        }
      }
    )
    return () => {
      active = false
    }
  }, [open])

  const available = capabilities?.availableLanguages ?? []
  const saved = settings.spellcheckLanguages?.filter((language) => available.includes(language))
  const selected = draft ?? (saved?.length ? saved : (capabilities?.enabledLanguages ?? []))
  const title = translate('settings.spellcheckLanguages.title', 'Spellcheck Languages')
  const description = translate(
    'settings.spellcheckLanguages.description',
    'Choose languages for spelling underlines and suggestions in Orca. Keep English selected when adding another language.'
  )

  const saveLanguages = async (languages: string[]): Promise<void> => {
    if (pending || languages.length === 0) {
      return
    }
    setDraft(languages)
    setPending(true)
    setSaveFailed(false)
    try {
      await updateSettingsOrThrow({ spellcheckLanguages: languages })
      setDraft(null)
    } catch {
      setSaveFailed(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <SearchableSetting
      title={title}
      description={description}
      keywords={[
        'spellcheck',
        'spell check',
        'spelling',
        'languages',
        'dictionary',
        'Hungarian',
        'magyar',
        'English'
      ]}
      className="space-y-2 py-2"
    >
      <div className="space-y-1">
        <Label>{title}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {capabilities?.managedBy === 'app' && available.length > 0 ? (
        <>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" aria-label={title}>
                {translate('settings.spellcheckLanguages.select', 'Select languages')}
                <ChevronDown className="size-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-0">
              <Command>
                <CommandInput
                  placeholder={translate(
                    'settings.spellcheckLanguages.search',
                    'Search languages…'
                  )}
                />
                <CommandList>
                  <CommandEmpty>
                    {translate(
                      'settings.spellcheckLanguages.noMatches',
                      'No supported languages found.'
                    )}
                  </CommandEmpty>
                  {available.map((language) => {
                    const checked = selected.includes(language)
                    return (
                      <CommandItem
                        key={language}
                        value={languageLabel(language)}
                        aria-selected={checked}
                        aria-checked={checked}
                        disabled={pending || (checked && selected.length === 1)}
                        onSelect={() => {
                          const next = checked
                            ? selected.filter((item) => item !== language)
                            : [...selected, language]
                          void saveLanguages(next)
                        }}
                      >
                        <span className="flex size-4 items-center justify-center">
                          {checked && <Check className="size-4" />}
                        </span>
                        {languageLabel(language)}
                      </CommandItem>
                    )
                  })}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <p className="text-xs text-muted-foreground">{selected.map(languageLabel).join(', ')}</p>
          {saveFailed && (
            <div className="flex items-center gap-2">
              <p role="alert" className="text-xs text-destructive">
                {translate(
                  'settings.spellcheckLanguages.saveFailed',
                  'Could not save spellcheck languages.'
                )}
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => void saveLanguages(selected)}
              >
                {translate('settings.spellcheckLanguages.retry', 'Retry')}
              </Button>
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          {failed
            ? translate(
                'settings.spellcheckLanguages.unavailable',
                'Spellcheck languages are unavailable. Reopen Settings to retry.'
              )
            : capabilities
              ? translate(
                  'settings.spellcheckLanguages.system',
                  'Managed by your operating system or browser. Change spelling languages in system or browser settings.'
                )
              : translate('settings.spellcheckLanguages.loading', 'Loading spellcheck languages…')}
        </p>
      )}
    </SearchableSetting>
  )
}
