import { useEffect, useRef, useState } from 'react'
import { Settings } from 'lucide-react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import {
  normalizeNativeChatPromptPresets,
  type NativeChatPromptPreset
} from '../../../../shared/native-chat-prompt-presets'
import { Popover, PopoverAnchor, PopoverContent } from '../ui/popover'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '../ui/command'
import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { ShortcutKeyCombo } from '../ShortcutKeyCombo'

type Props = {
  enabled: boolean
  disabled: boolean
  ownerKey: string
  onSend: (text: string) => void
  onInsert: (text: string) => void
  onFocus: () => void
}

export function NativeChatPromptPresets({
  enabled,
  disabled,
  ownerKey,
  onSend,
  onInsert,
  onFocus
}: Props): React.JSX.Element {
  const configured = useAppStore((state) => state.settings?.nativeChatPromptPresets)
  const presets = normalizeNativeChatPromptPresets(configured)
    .map((preset, index) => ({ ...preset, slot: index + 1 }))
    .filter((preset) => preset.prompt.trim() !== '')
  const [openedOwner, setOpenedOwner] = useState<string | null>(null)
  const scopeKey = JSON.stringify([ownerKey, enabled])
  const [previousScope, setPreviousScope] = useState(scopeKey)
  if (previousScope !== scopeKey) {
    setPreviousScope(scopeKey)
    setOpenedOwner(null)
  }
  const [query, setQuery] = useState('')
  const anchorRef = useRef<HTMLSpanElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const restoreFocus = useRef(true)
  const focusOwner = useRef<string | null>(null)
  const open = enabled && openedOwner === ownerKey
  const results = presets.filter((preset) =>
    `${preset.name} ${preset.prompt}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  )

  useEffect(() => {
    if (!enabled) {
      return
    }
    const handleKey = (event: KeyboardEvent): void => {
      const root = anchorRef.current?.closest('[data-native-chat-root]')
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.code !== 'KeyE' ||
        !root ||
        !(event.target instanceof Node) ||
        !root.contains(event.target)
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      restoreFocus.current = true
      focusOwner.current = ownerKey
      setQuery('')
      setOpenedOwner(ownerKey)
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [enabled, ownerKey])

  const choose = (preset: NativeChatPromptPreset | undefined, insertOnly: boolean): void => {
    if (!open || disabled || !preset) {
      return
    }
    setOpenedOwner(null)
    if (insertOnly) {
      onInsert(preset.prompt)
    } else {
      onSend(preset.prompt)
    }
  }
  const shift = navigator.userAgent.includes('Mac') ? '⇧' : 'Shift'
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setOpenedOwner(null)
        }
      }}
    >
      <PopoverAnchor asChild>
        <span ref={anchorRef} className="pointer-events-none absolute left-1/2 top-0" />
      </PopoverAnchor>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={8}
        className="w-96 max-w-[90vw]"
        aria-label={translate('settings.z.presets.title', 'Prompt presets')}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          inputRef.current?.focus()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          if (restoreFocus.current && enabled && focusOwner.current === ownerKey) {
            onFocus()
          }
        }}
        onPointerDownOutside={() => {
          restoreFocus.current = false
        }}
      >
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">
            {translate('settings.z.presets.title', 'Prompt presets')}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Z Settings"
                onClick={() => {
                  restoreFocus.current = false
                  setOpenedOwner(null)
                  useAppStore.getState().openSettingsPage()
                  useAppStore.getState().openSettingsTarget({
                    pane: 'z-settings',
                    repoId: null,
                    sectionId: 'z-prompt-presets'
                  })
                }}
              >
                <Settings />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Z Settings</TooltipContent>
          </Tooltip>
        </div>
        <Command
          shouldFilter={false}
          onKeyDownCapture={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) {
              event.stopPropagation()
              return
            }
            if (event.altKey || event.ctrlKey || event.metaKey) {
              if (event.key === 'Enter') {
                event.preventDefault()
                event.stopPropagation()
              }
              return
            }
            const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code)?.[1]
            if (event.key !== 'Enter' && !(query === '' && digit)) {
              return
            }
            event.preventDefault()
            event.stopPropagation()
            if (event.repeat) {
              return
            }
            choose(
              event.key === 'Enter'
                ? results[0]
                : presets.find((preset) => preset.slot === Number(digit)),
              event.shiftKey
            )
          }}
        >
          <CommandInput
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder={translate('settings.z.presets.search', 'Type to search prompts…')}
            aria-label={translate('settings.z.presets.search', 'Type to search prompts…')}
          />
          <CommandList>
            <CommandEmpty>
              {presets.length === 0
                ? translate('settings.z.presets.empty', 'Add prompts in Z Settings.')
                : translate('settings.z.presets.noMatch', 'No matching prompts.')}
            </CommandEmpty>
            {results.map((preset) => (
              <CommandItem
                key={preset.slot}
                value={String(preset.slot)}
                disabled={disabled}
                onSelect={() => choose(preset, false)}
              >
                <ShortcutKeyCombo keys={[String(preset.slot)]} />
                <span className="min-w-0 flex-1 truncate">
                  {preset.name.trim() || preset.prompt}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
        <div className="flex items-center gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
          <span>{translate('settings.z.presets.sendHint', 'Enter sends')}</span>
          <ShortcutKeyCombo keys={[shift, 'Enter']} />
          <span>{translate('settings.z.presets.insertHint', 'inserts')}</span>
        </div>
      </PopoverContent>
    </Popover>
  )
}
