import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { RuntimeRpcResponse } from '../../../shared/runtime-rpc-envelope'
import {
  installBrowserGlobals,
  writeStoredRuntimeEnvironment
} from './web-preload-api-test-harness'

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllGlobals())

it('keeps spelling capabilities and language preferences local with a remote runtime', async () => {
  const calls: string[] = []
  vi.doMock('./web-runtime-client', () => ({
    WebRuntimeClient: class {
      call(method: string): Promise<RuntimeRpcResponse<unknown>> {
        calls.push(method)
        return Promise.resolve({
          id: 'spellcheck',
          ok: true,
          result: { settings: { spellcheckLanguages: ['de'] } },
          _meta: { runtimeId: 'runtime-1' }
        })
      }
      close(): void {}
    }
  }))
  const globals = installBrowserGlobals('Linux')
  writeStoredRuntimeEnvironment(globals.storage)
  globals.storage.setItem(
    'orca.web.settings.v1',
    JSON.stringify({ spellcheckLanguages: ['en-GB', 'hu'] })
  )
  const { createWebSettingsApi } = await import('./preload-api/web-settings-api')
  const settings = createWebSettingsApi().settings
  if (!settings) {
    throw new Error('Web settings API missing')
  }
  expect(await settings.getSpellcheckCapabilities?.()).toEqual({
    managedBy: 'system',
    availableLanguages: [],
    enabledLanguages: []
  })
  expect(calls).toEqual([])
  await settings.set({ spellcheckLanguages: ['en-GB', 'hu'] })
  expect(calls).toEqual([])
  expect((await settings.get()).spellcheckLanguages).toEqual(['en-GB', 'hu'])
  expect(calls).toEqual(['settings.get'])
})
