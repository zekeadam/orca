import type { Session } from 'electron'
import type { SpellcheckCapabilities } from '../shared/spellcheck-languages'
import { normalizeSpellcheckLanguages } from '../shared/spellcheck-languages'

export type SpellcheckSession = Pick<
  Session,
  'availableSpellCheckerLanguages' | 'getSpellCheckerLanguages' | 'setSpellCheckerLanguages'
>

export function getSpellcheckCapabilities(
  session: SpellcheckSession,
  platform: NodeJS.Platform = process.platform
): SpellcheckCapabilities {
  if (platform === 'darwin') {
    return { managedBy: 'system', availableLanguages: [], enabledLanguages: [] }
  }
  return {
    managedBy: 'app',
    availableLanguages: [...session.availableSpellCheckerLanguages],
    enabledLanguages: session.getSpellCheckerLanguages()
  }
}

export function supportedSpellcheckLanguages(
  value: unknown,
  capabilities: SpellcheckCapabilities
): string[] | undefined {
  if (capabilities.managedBy === 'system') {
    return undefined
  }
  const available = new Set(capabilities.availableLanguages)
  const supported = normalizeSpellcheckLanguages(value)?.filter((language) =>
    available.has(language)
  )
  return supported?.length ? supported : undefined
}

export function applySpellcheckLanguages(
  session: SpellcheckSession,
  value: unknown,
  platform: NodeJS.Platform = process.platform
): void {
  if (value === undefined || platform === 'darwin') {
    return
  }
  const capabilities = getSpellcheckCapabilities(session, platform)
  const languages = supportedSpellcheckLanguages(value, capabilities)
  if (
    languages &&
    (languages.length !== capabilities.enabledLanguages.length ||
      languages.some((language, index) => language !== capabilities.enabledLanguages[index]))
  ) {
    session.setSpellCheckerLanguages(languages)
  }
}
