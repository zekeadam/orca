export const MAX_NATIVE_CHAT_PROMPT_PRESETS = 9

export type NativeChatPromptPreset = {
  name: string
  prompt: string
}

export function normalizeNativeChatPromptPresets(value: unknown): NativeChatPromptPreset[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.slice(0, MAX_NATIVE_CHAT_PROMPT_PRESETS).flatMap((entry: unknown) => {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      !('name' in entry) ||
      typeof entry.name !== 'string' ||
      !('prompt' in entry) ||
      typeof entry.prompt !== 'string'
    ) {
      return []
    }
    return [{ name: entry.name, prompt: entry.prompt }]
  })
}
