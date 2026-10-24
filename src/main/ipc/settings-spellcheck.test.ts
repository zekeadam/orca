import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../shared/constants'
import type { GlobalSettings } from '../../shared/global-settings-types'
import type { Store } from '../persistence'
import { registerSpellcheckHandlers, sanitizeSpellcheckUpdate } from './settings-spellcheck'

const { handle, windows } = vi.hoisted(() => ({ handle: vi.fn(), windows: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: { handle }, BrowserWindow: { getAllWindows: windows } }))

function session() {
  return {
    availableSpellCheckerLanguages: ['en-GB', 'hu'],
    getSpellCheckerLanguages: () => ['en-GB'],
    setSpellCheckerLanguages: vi.fn()
  }
}

describe('spellcheck settings IPC', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads supported languages from the local calling session', () => {
    registerSpellcheckHandlers({ onSettingsChanged: vi.fn() })
    const read = handle.mock.calls.find(
      ([channel]) => channel === 'settings:getSpellcheckCapabilities'
    )?.[1]
    const result = read({ sender: { session: session() } })
    expect(result.managedBy).toBe(process.platform === 'darwin' ? 'system' : 'app')
    if (process.platform !== 'darwin') {
      expect(result.availableLanguages).toEqual(['en-GB', 'hu'])
    }
  })

  it('filters invalid and unsupported tags at the settings:set boundary', () => {
    if (process.platform === 'darwin') {
      expect(() => sanitizeSpellcheckUpdate({ spellcheckLanguages: ['hu'] }, session())).toThrow()
      return
    }
    const update: Partial<GlobalSettings> = {
      spellcheckLanguages: ['en-gb', 'hu', 'invalid_tag', 'zz-ZZ']
    }
    sanitizeSpellcheckUpdate(update, session())
    expect(update.spellcheckLanguages).toEqual(['en-GB', 'hu'])
  })

  it.each([[], ['zz-ZZ'], ['invalid_tag']])('rejects an unusable selection %j', (languages) => {
    expect(() => sanitizeSpellcheckUpdate({ spellcheckLanguages: languages }, session())).toThrow(
      'supported spellcheck language'
    )
  })

  it('applies changes to each live local session once, including the originating window', () => {
    const onSettingsChanged = vi.fn<Store['onSettingsChanged']>(() => () => {})
    const local = session()
    registerSpellcheckHandlers({ onSettingsChanged })
    const live = { isDestroyed: () => false, webContents: { session: local } }
    windows.mockReturnValue([live, live, { isDestroyed: () => true }])
    const settings = { ...getDefaultSettings('/test'), spellcheckLanguages: ['en-GB', 'hu'] }
    onSettingsChanged.mock.calls[0]?.[0](
      { spellcheckLanguages: settings.spellcheckLanguages },
      settings,
      1
    )
    expect(local.setSpellCheckerLanguages).toHaveBeenCalledTimes(
      process.platform === 'darwin' ? 0 : 1
    )
    if (process.platform !== 'darwin') {
      expect(local.setSpellCheckerLanguages).toHaveBeenCalledWith(['en-GB', 'hu'])
    }
  })
})
