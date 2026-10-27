import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import { persistVisibilityAwareSettings } from './worktree-visibility-settings-write'
import { hydrateOwnerWorktreeVisibilityDefaults } from './worktree-visibility-owner-settings'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: rpc,
  runtimeEnvironmentSupportsCapability: vi.fn().mockResolvedValue(false)
}))

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('spellcheck client ownership', () => {
  const local = {
    ...getDefaultSettings('/test'),
    activeRuntimeEnvironmentId: 'ssh-runtime',
    spellcheckLanguages: ['en-GB', 'hu']
  }

  it('writes languages through local preload with an SSH runtime selected', async () => {
    const set = vi.fn().mockResolvedValue(local)
    vi.stubGlobal('window', { api: { settings: { set } } })
    await persistVisibilityAwareSettings({
      normalizedUpdates: { spellcheckLanguages: ['en-GB', 'hu'] },
      currentSettings: local,
      supportedRuntimeEnvironmentId: null,
      set: vi.fn()
    })
    expect(set).toHaveBeenCalledWith({ spellcheckLanguages: ['en-GB', 'hu'] })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('ignores remote spelling preferences during owner settings hydration', async () => {
    rpc.mockResolvedValue({
      settings: { spellcheckLanguages: ['de'], worktreeVisibilityDefaults: { external: 'hide' } }
    })
    const hydrated = await hydrateOwnerWorktreeVisibilityDefaults(local, {})
    expect(hydrated.settings.spellcheckLanguages).toEqual(['en-GB', 'hu'])
  })
})
