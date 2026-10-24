import type { GlobalSettings } from './global-settings-types'

export type SpellcheckCapabilities = {
  managedBy: 'app' | 'system'
  availableLanguages: string[]
  enabledLanguages: string[]
}

export function normalizeSpellcheckLanguagesUpdate(
  updates: Partial<GlobalSettings>
): Partial<GlobalSettings> {
  if (!('spellcheckLanguages' in updates)) {
    return updates
  }
  const { spellcheckLanguages, ...rest } = updates
  const languages = normalizeSpellcheckLanguages(spellcheckLanguages)
  return languages ? { ...rest, spellcheckLanguages: languages } : rest
}

export function normalizeSpellcheckLanguages(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const languages = new Set<string>()
  for (const language of value) {
    if (typeof language !== 'string') {
      continue
    }
    try {
      const canonical = Intl.getCanonicalLocales(language.trim())[0]
      if (canonical) {
        languages.add(canonical)
      }
    } catch {
      // Invalid language tags cannot be passed to Electron.
    }
  }
  return languages.size > 0 ? [...languages] : undefined
}
