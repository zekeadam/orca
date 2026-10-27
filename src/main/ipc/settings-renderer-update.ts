import type { GlobalSettings } from '../../shared/global-settings-types'
import type { SpellcheckSession } from '../spellcheck-session'
import { sanitizeSpellcheckUpdate } from './settings-spellcheck'

type LegacyTerminalScrollbackSettingsUpdate = Partial<GlobalSettings> & {
  terminalScrollbackBytes?: unknown
}

export function sanitizeRendererSettingsUpdate(
  args: Partial<GlobalSettings>,
  session: SpellcheckSession
): Partial<GlobalSettings> {
  const {
    terminalScrollbackBytes: _legacyScrollbackBytes,
    ...sanitizedArgs
  }: LegacyTerminalScrollbackSettingsUpdate = args
  void _legacyScrollbackBytes
  // Plugin consent and enablement are main-owned authority state.
  delete sanitizedArgs.pluginConsents
  delete sanitizedArgs.disabledPlugins
  sanitizeSpellcheckUpdate(sanitizedArgs, session)
  return sanitizedArgs
}
