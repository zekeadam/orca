import { afterEach, describe, expect, it, vi } from 'vitest'

const quit = vi.hoisted(() => vi.fn())
vi.mock('../menu/register-app-menu', () => ({ runAppMenuQuitCommand: quit }))
vi.mock('electron', () => ({
  BrowserWindow: class {
    webContents = { send: vi.fn() }
  }
}))

import { BrowserWindow } from 'electron'
import { sendResolvedWindowShortcutAction } from './main-window-shortcut-actions'
import { forwardGuestShortcutInput } from '../browser/browser-guest-shortcut-dispatch'
import { createAppMenuQuitItem } from '../menu/app-menu-quit-item'
import {
  resolveWindowShortcutAction,
  getWindowShortcutActionId
} from '../../shared/window-shortcut-policy'
import {
  findKeybindingConflicts,
  getEffectiveKeybindingsForAction,
  type KeybindingOverrides
} from '../../shared/keybindings'

const customInput = { type: 'keyDown', key: 'q', code: 'KeyQ', control: true, shift: true }
const overrides: KeybindingOverrides = { 'app.quit': ['Ctrl+Shift+Q', 'Ctrl+Alt+X'] }

afterEach(() => {
  vi.restoreAllMocks()
  quit.mockReset()
})

describe('configurable application quit', () => {
  it.each(['darwin', 'linux', 'win32'] as const)(
    'preserves the platform default on %s',
    (platform) => {
      expect(getEffectiveKeybindingsForAction('app.quit', platform)).toEqual(
        platform === 'win32' ? [] : ['Mod+Q']
      )
      expect(
        resolveWindowShortcutAction(
          { key: 'q', code: 'KeyQ', meta: platform === 'darwin', control: platform !== 'darwin' },
          platform
        )
      ).toEqual(platform === 'win32' ? null : { type: 'quitApp' })
    }
  )

  it('supports multiple bindings, disables defaults and identifies conflicts', () => {
    expect(resolveWindowShortcutAction(customInput, 'win32', overrides)).toEqual({
      type: 'quitApp'
    })
    expect(
      resolveWindowShortcutAction({ code: 'KeyX', control: true, alt: true }, 'linux', overrides)
    ).toEqual({ type: 'quitApp' })
    expect(
      resolveWindowShortcutAction({ code: 'KeyQ', meta: true }, 'darwin', { 'app.quit': [] })
    ).toBeNull()
    expect(
      resolveWindowShortcutAction({ code: 'KeyQ', control: true }, 'linux', overrides)
    ).toBeNull()
    expect(getWindowShortcutActionId({ type: 'quitApp' })).toBe('app.quit')
    expect(findKeybindingConflicts('win32', { 'app.quit': ['Mod+P'] })).toContainEqual({
      binding: 'Mod+P',
      actionIds: expect.arrayContaining(['app.quit', 'worktree.quickOpen'])
    })
  })

  it('respects terminal-first policy and modifier double taps', () => {
    expect(
      resolveWindowShortcutAction(customInput, 'win32', overrides, {
        context: 'terminal',
        terminalShortcutPolicy: 'terminal-first'
      })
    ).toBeNull()
    expect(
      resolveWindowShortcutAction(customInput, 'win32', overrides, {
        context: 'terminal',
        terminalShortcutPolicy: 'orca-first'
      })
    ).toEqual({ type: 'quitApp' })
    expect(
      resolveWindowShortcutAction({ doubleTapModifier: 'Shift' }, 'win32', {
        'app.quit': ['DoubleTap+Shift']
      })
    ).toEqual({ type: 'quitApp' })
  })

  it('dispatches through the existing menu quit lifecycle without closing the window', () => {
    const window = new BrowserWindow({ show: false })
    sendResolvedWindowShortcutAction(window, { type: 'quitApp' })
    expect(quit).toHaveBeenCalledOnce()
    expect(window.webContents.send).not.toHaveBeenCalled()
  })

  it('quits from a browser guest even without a renderer and contains held-key repeats', () => {
    const preventDefault = vi.fn()
    const context = {
      browserTabId: 'guest',
      resolveRenderer: () => null,
      getKeybindings: () => overrides,
      forwardBrowserPageZoom: vi.fn()
    }
    expect(
      forwardGuestShortcutInput(context, { preventDefault, defaultPrevented: false }, customInput)
    ).toBe(true)
    expect(
      forwardGuestShortcutInput(
        context,
        { preventDefault, defaultPrevented: false },
        { ...customInput, isAutoRepeat: true }
      )
    ).toBe(true)
    expect(quit).toHaveBeenCalledOnce()
    expect(preventDefault).toHaveBeenCalledTimes(2)
  })

  it.each(['darwin', 'linux', 'win32'] as const)(
    'removes the old native accelerator after rebind or disable on %s',
    (platform) => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue(platform)
      const customized = createAppMenuQuitItem(quit, 'Orca', overrides)
      expect(customized.accelerator).toBe('')
      expect(customized.label).toContain('Q')
      expect(createAppMenuQuitItem(quit, 'Orca', { 'app.quit': [] }).accelerator).toBe('')
      expect(createAppMenuQuitItem(quit, 'Orca').accelerator).toBe(
        platform === 'win32' ? '' : 'CmdOrCtrl+Q'
      )
    }
  )
})
