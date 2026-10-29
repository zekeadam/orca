import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import {
  MAX_NATIVE_CHAT_PROMPT_PRESETS,
  normalizeNativeChatPromptPresets,
  type NativeChatPromptPreset
} from '../../../../shared/native-chat-prompt-presets'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { useDebouncedSettingsTextDraft } from './use-debounced-settings-text-draft'
import { ZCustomSettings } from './ZCustomSettings'

let pendingPresets: NativeChatPromptPreset[] | null = null
let pendingWrites = 0

function PresetEditor({ index }: { index: number }): React.JSX.Element {
  const preset = useAppStore((state) => state.settings?.nativeChatPromptPresets?.[index])
  const commit = (field: 'name' | 'prompt', value: string): void => {
    const state = useAppStore.getState()
    const presets = normalizeNativeChatPromptPresets(
      pendingPresets ?? state.settings?.nativeChatPromptPresets
    )
    while (presets.length <= index) {
      presets.push({ name: '', prompt: '' })
    }
    presets[index] = { ...presets[index], [field]: value }
    pendingPresets = presets
    pendingWrites += 1
    // Invoke IPC synchronously so beforeunload flushes reach main before close confirmation.
    void state.updateSettings({ nativeChatPromptPresets: presets }).finally(() => {
      pendingWrites -= 1
      if (pendingWrites === 0) {
        pendingPresets = null
      }
    })
  }
  const name = useDebouncedSettingsTextDraft({
    value: preset?.name ?? '',
    commit: (next) => commit('name', next)
  })
  const prompt = useDebouncedSettingsTextDraft({
    value: preset?.prompt ?? '',
    commit: (next) => commit('prompt', next)
  })
  const nameLabel = translate('settings.z.presets.name', 'Preset {{number}} name', {
    number: index + 1
  })
  const promptLabel = translate('settings.z.presets.prompt', 'Preset {{number}} prompt', {
    number: index + 1
  })
  return (
    <AccordionItem value={String(index)}>
      <AccordionTrigger>
        <span className="flex min-w-0 items-center gap-3">
          <span className="text-muted-foreground">{index + 1}</span>
          <span className="truncate">
            {name.value.trim() || translate('settings.z.presets.unnamed', 'Untitled preset')}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor={`z-preset-name-${index}`}>{nameLabel}</Label>
            <Input
              id={`z-preset-name-${index}`}
              value={name.value}
              onChange={(event) => name.onChange(event.target.value)}
              onBlur={name.onBlur}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`z-preset-prompt-${index}`}>{promptLabel}</Label>
            <Textarea
              id={`z-preset-prompt-${index}`}
              value={prompt.value}
              onChange={(event) => prompt.onChange(event.target.value)}
              onBlur={prompt.onBlur}
              rows={4}
            />
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}

export function ZSettingsPane(): React.JSX.Element {
  return (
    <div className="space-y-8">
      <div id="z-prompt-presets" className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">
            {translate('settings.z.presets.title', 'Prompt presets')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {translate(
              'settings.z.presets.help',
              'Alt+E opens presets in the active chat. 1–9 sends; Shift+1–9 inserts. Type to search; Enter sends and Shift+Enter inserts. Changes save automatically. Empty prompts are hidden.'
            )}
          </p>
        </div>
        <Accordion type="single" collapsible defaultValue="0">
          {Array.from({ length: MAX_NATIVE_CHAT_PROMPT_PRESETS }, (_, index) => (
            <PresetEditor key={index} index={index} />
          ))}
        </Accordion>
      </div>
      <ZCustomSettings />
    </div>
  )
}
