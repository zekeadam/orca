import {
  formatKeybindingList,
  getEffectiveKeybindingsForAction,
  type KeybindingOverrides
} from '../../shared/keybindings'
import { translateMain } from '../i18n/main-i18n'

/** User Quit must keep the serve host alive through its supplied lifecycle handler. */
export function createAppMenuQuitItem(
  onQuit: (() => void) | undefined,
  macAppName?: string,
  keybindings?: KeybindingOverrides
): Electron.MenuItemConstructorOptions {
  const bindings = getEffectiveKeybindingsForAction('app.quit', process.platform, keybindings)
  const nativeQuit = process.platform !== 'win32' && bindings.includes('Mod+Q')
  const label =
    macAppName === undefined
      ? translateMain('menu.exit', 'Exit')
      : translateMain('menu.quitApp', `Quit ${macAppName}`, { appName: macAppName })
  const hint =
    !nativeQuit && bindings.length ? `\t${formatKeybindingList(bindings, process.platform)}` : ''
  return {
    ...(!onQuit ? { role: 'quit' as const } : {}),
    label: `${label}${hint}`,
    // Keep native Quit available without a window; custom chords use the shared shortcut policy.
    accelerator: nativeQuit ? 'CmdOrCtrl+Q' : '',
    ...(onQuit ? { click: () => onQuit() } : {})
  }
}

export function createAppFileMenu(
  settingsItem: Electron.MenuItemConstructorOptions,
  onQuit: (() => void) | undefined,
  keybindings?: KeybindingOverrides
): Electron.MenuItemConstructorOptions {
  return {
    label: translateMain('menu.file', 'File'),
    submenu: [
      settingsItem,
      { type: 'separator' },
      createAppMenuQuitItem(onQuit, undefined, keybindings)
    ]
  }
}
