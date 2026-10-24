import { BrowserWindow, ipcMain } from 'electron'
import type { Store } from '../persistence'
import type { GlobalSettings } from '../../shared/global-settings-types'
import {
  applySpellcheckLanguages,
  getSpellcheckCapabilities,
  supportedSpellcheckLanguages,
  type SpellcheckSession
} from '../spellcheck-session'

export function sanitizeSpellcheckUpdate(
  updates: Partial<GlobalSettings>,
  session: SpellcheckSession
): void {
  if (!('spellcheckLanguages' in updates)) {
    return
  }
  const languages = supportedSpellcheckLanguages(
    updates.spellcheckLanguages,
    getSpellcheckCapabilities(session)
  )
  if (!languages) {
    throw new Error('Select at least one supported spellcheck language.')
  }
  updates.spellcheckLanguages = languages
}

export function registerSpellcheckHandlers(store: Pick<Store, 'onSettingsChanged'>): void {
  ipcMain.handle('settings:getSpellcheckCapabilities', (event) =>
    getSpellcheckCapabilities(event.sender.session)
  )
  store.onSettingsChanged((updates, settings) => {
    if (!('spellcheckLanguages' in updates)) {
      return
    }
    const sessions = new Set<SpellcheckSession>()
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        sessions.add(window.webContents.session)
      }
    }
    for (const session of sessions) {
      applySpellcheckLanguages(session, settings.spellcheckLanguages)
    }
  })
}
