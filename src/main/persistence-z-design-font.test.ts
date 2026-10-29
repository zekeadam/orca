import {
  closeTestStores,
  testState,
  createStore,
  writeDataFile,
  readDataFile
} from './persistence-test-harness'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDefaultPersistedState } from '../shared/constants'

vi.mock('electron', () => ({
  app: { getPath: () => testState.dir },
  safeStorage: { isEncryptionAvailable: () => false }
}))
vi.mock('./telemetry/client', () => ({ track: vi.fn() }))

beforeEach(() => {
  testState.dir = mkdtempSync(join(tmpdir(), 'orca-z-design-font-'))
})

afterEach(async () => {
  await closeTestStores()
  rmSync(testState.dir, { recursive: true, force: true })
})

it.each(['Geist', 'geist', '  Geist  '])('migrates the old %s default once', async (font) => {
  const persisted = getDefaultPersistedState(testState.dir)
  writeDataFile({
    ...persisted,
    settings: {
      ...persisted.settings,
      appFontFamily: font,
      appFontFamilyZDesignMigrated: undefined
    }
  })
  const store = await createStore()
  expect(store.getSettings().appFontFamily).toBe('Consolas')
  store.flush()
  expect(readDataFile()).toHaveProperty('settings.appFontFamilyZDesignMigrated', true)

  store.updateSettings({ appFontFamily: 'Geist', appFontFamilyZDesignMigrated: false })
  store.flush()
  await closeTestStores()
  const reopened = await createStore()
  expect(reopened.getSettings().appFontFamily).toBe('Geist')
  expect(reopened.getSettings().appFontFamilyZDesignMigrated).toBe(true)
})

it.each(['Inter', 'Menlo', 'Consolas'])(
  'preserves the custom %s font across migration',
  async (font) => {
    const persisted = getDefaultPersistedState(testState.dir)
    writeDataFile({
      ...persisted,
      settings: {
        ...persisted.settings,
        appFontFamily: font,
        appFontFamilyZDesignMigrated: undefined
      }
    })
    const store = await createStore()
    expect(store.getSettings().appFontFamily).toBe(font)
    store.flush()
    await closeTestStores()
    expect((await createStore()).getSettings().appFontFamily).toBe(font)
  }
)
