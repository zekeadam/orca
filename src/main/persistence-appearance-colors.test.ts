import { closeTestStores, testState, createStore, readDataFile } from './persistence-test-harness'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({
  app: { getPath: () => testState.dir },
  safeStorage: { isEncryptionAvailable: () => false }
}))
vi.mock('./telemetry/client', () => ({ track: vi.fn() }))

beforeEach(() => {
  testState.dir = mkdtempSync(join(tmpdir(), 'orca-chat-appearance-'))
})
afterEach(async () => {
  await closeTestStores()
  rmSync(testState.dir, { recursive: true, force: true })
})

it('normalizes, saves, reloads and removes appearance colors', async () => {
  const store = await createStore()
  store.updateSettings({
    tabBackground: ' ABC ',
    accentColor: '#00FF00',
    statusBarBackground: 'invalid'
  })
  store.flush()
  expect(readDataFile()).toHaveProperty('settings.tabBackground', '#aabbcc')
  expect(readDataFile()).not.toHaveProperty('settings.statusBarBackground')
  await closeTestStores()
  const reopened = await createStore()
  expect(reopened.getSettings().accentColor).toBe('#00ff00')
  reopened.updateSettings({ tabBackground: undefined, accentColor: undefined })
  reopened.flush()
  expect(readDataFile()).not.toHaveProperty('settings.tabBackground')
  expect(readDataFile()).not.toHaveProperty('settings.accentColor')
})
