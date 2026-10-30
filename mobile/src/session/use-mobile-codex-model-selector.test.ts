import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { useMobileCodexModelSelector } from './use-mobile-codex-model-selector'
import {
  mobileCodexModelCommand,
  mobileCodexModelInputReady,
  mobileCodexSessionModelCommandSupported,
  mobileCodexModelPickerOpen,
  readMobileCodexModelConfirmation
} from './mobile-codex-model-command'

const idle = 'OpenAI Codex (v0.165.0-alpha.1.2)\n› Ask Codex to do anything\nGPT-6.1-Sol low fast'
const catalog = {
  origin: 'probe',
  fetchedAt: 1,
  models: [
    {
      id: 'gpt-6-astra',
      label: 'GPT-6-Astra',
      isDefault: false,
      efforts: [
        { value: 'low', label: 'Low' },
        { value: 'high', label: 'High' }
      ]
    }
  ]
}

describe('terminal Codex graphical model selector', () => {
  let renderer: ReactTestRenderer | null = null
  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
  })

  async function mount(
    options: {
      screen?: string
      status?: string
      outcome?: 'accepted' | 'rejected' | 'unknown'
      confirm?: boolean
      confirmationAfterPage?: boolean
      reportedModel?: string
    } = {}
  ) {
    const dispatch = vi.fn().mockResolvedValue(options.outcome ?? 'accepted')
    const handleRef = { current: 'term-target' }
    const calls = vi.fn(async (method: string, params: unknown) => {
      if (method === 'agentSession.modelCatalog') {
        return catalog
      }
      if (method === 'terminal.agentStatus') {
        return { agentStatus: { isRunningAgent: true, status: options.status ?? 'idle' } }
      }
      if (method === 'terminal.read') {
        const screen = typeof params === 'object' && params !== null && 'screen' in params
        const cursor =
          typeof params === 'object' && params !== null && 'cursor' in params ? params.cursor : null
        if (options.confirmationAfterPage && dispatch.mock.calls.length && cursor === 10) {
          return {
            terminal: {
              source: 'stream',
              nextCursor: '110',
              limited: true,
              tail: Array(100).fill('other output')
            }
          }
        }
        if (options.confirmationAfterPage && dispatch.mock.calls.length && cursor === 110) {
          return {
            terminal: {
              source: 'stream',
              nextCursor: '111',
              tail: ['Model changed to gpt-6-astra high for this session only']
            }
          }
        }
        return {
          terminal: {
            source: screen ? 'screen' : 'stream',
            nextCursor: '10',
            tail: screen
              ? [options.screen ?? idle]
              : dispatch.mock.calls.length && options.confirm !== false
                ? ['Model changed to gpt-6-astra high for this session only']
                : []
          }
        }
      }
      throw new Error(method)
    })
    const client: RpcClient = {
      sendRequest: async (method, params) => ({
        id: '1',
        ok: true,
        result: await calls(method, params),
        _meta: { runtimeId: 'r' }
      }),
      subscribe: () => () => {},
      updateTerminalSubscriptionViewport: () => {},
      getState: () => 'connected',
      getReconnectAttempt: () => 0,
      getLastConnectedAt: () => null,
      onStateChange: () => () => {},
      notifyForeground: () => {},
      close: () => {}
    }
    const seen: { current: ReturnType<typeof useMobileCodexModelSelector> | null } = {
      current: null
    }
    let reportedModel = options.reportedModel ?? 'gpt-6-astra'
    function Probe() {
      seen.current = useMobileCodexModelSelector({
        enabled: true,
        client,
        scope: 'host/workspace/tab',
        worktreeId: 'workspace',
        handleRef,
        reportedModel,
        dispatchCommand: dispatch
      })
      return null
    }
    await act(async () => {
      renderer = create(createElement(Probe))
    })
    return {
      seen,
      dispatch,
      calls,
      handleRef,
      reportModel: async (model: string) => {
        reportedModel = model
        await act(async () => renderer!.update(createElement(Probe)))
      }
    }
  }

  it('builds only validated session-only commands and reads exact confirmation', () => {
    expect(mobileCodexModelCommand('gpt-6-astra', 'high')).toBe(
      '/model gpt-6-astra --reasoning=high'
    )
    expect(mobileCodexModelCommand('gpt; evil')).toBeNull()
    expect(mobileCodexModelCommand('gpt', '--speed=fast')).toBeNull()
    expect(
      readMobileCodexModelConfirmation(
        '\x1b[1mModel changed to gpt-6-astra high for this session only'
      )
    ).toEqual({ model: 'gpt-6-astra', effort: 'high' })
    expect(readMobileCodexModelConfirmation('/model gpt-6-astra')).toBeNull()
  })
  it('recognizes scrubbed real PTY confirmation and the actual model picker', () => {
    const captured = readFileSync(
      new URL('./__fixtures__/codex-session-model-effort.txt', import.meta.url),
      'utf8'
    )
    const picker = readFileSync(
      new URL('./__fixtures__/codex-model-picker.txt', import.meta.url),
      'utf8'
    )
    expect(readMobileCodexModelConfirmation(captured)).toEqual({
      model: 'gpt-6-astra',
      effort: 'high'
    })
    expect(mobileCodexSessionModelCommandSupported(captured)).toBe(true)
    expect(mobileCodexModelPickerOpen(picker)).toBe(true)
    expect(mobileCodexModelInputReady(picker)).toBe(false)
  })
  it('does not send to an unverified older Codex', async () => {
    const { seen, dispatch } = await mount({ screen: idle.replace('0.165.0-alpha.1.2', '0.120.0') })
    await act(async () => {
      expect(await seen.current!.setOption('model', 'gpt-6-astra')).toBe(false)
    })
    expect(dispatch).not.toHaveBeenCalled()
  })
  it('does not commit unconfirmed delivery', async () => {
    const { seen } = await mount({ outcome: 'unknown', confirm: false })
    vi.useFakeTimers()
    try {
      await act(async () => {
        const applying = seen.current!.setOption('effort', 'high')
        await vi.advanceTimersByTimeAsync(5500)
        expect(await applying).toBe(false)
      })
      expect(seen.current!.snapshot[1]?.kind.currentValue).toBeUndefined()
      expect(seen.current!.error).toContain('not confirmed')
    } finally {
      vi.useRealTimers()
    }
  })
  it('requires a Codex empty input and refuses open picker or entered draft', () => {
    expect(mobileCodexModelInputReady(idle)).toBe(true)
    expect(mobileCodexModelInputReady(`${idle}\nSelect Model and Effort`)).toBe(false)
    expect(
      mobileCodexModelInputReady(idle.replace('Ask Codex to do anything', 'my unsent draft'))
    ).toBe(false)
    expect(mobileCodexModelInputReady('shell\n›')).toBe(false)
  })
  it('uses host catalog and confirms effort in the intended terminal without opening TUI', async () => {
    const { seen, dispatch, calls } = await mount()
    let applied = false
    await act(async () => {
      applied = await seen.current!.setOption('effort', 'high')
    })
    expect(applied).toBe(true)
    expect(dispatch).toHaveBeenCalledExactlyOnceWith('/model gpt-6-astra --reasoning=high')
    expect(seen.current!.snapshot[1]?.kind.currentValue).toBe('high')
    expect(
      calls.mock.calls
        .filter(([method]) => method.startsWith('terminal.'))
        .every(
          ([, params]) =>
            typeof params === 'object' &&
            params !== null &&
            'terminal' in params &&
            params.terminal === 'term-target'
        )
    ).toBe(true)
  })
  it.each(['working', 'permission'])('does not send while %s', async (status) => {
    const { seen, dispatch } = await mount({ status })
    await act(async () => {
      expect(await seen.current!.setOption('model', 'gpt-6-astra')).toBe(false)
    })
    expect(dispatch).not.toHaveBeenCalled()
    expect(seen.current!.error).toContain('idle')
  })
  it('preserves terminal draft and rejects unlisted effort', async () => {
    const { seen, dispatch } = await mount({
      screen: idle.replace('Ask Codex to do anything', 'draft')
    })
    await act(async () => {
      expect(await seen.current!.setOption('effort', 'ultra')).toBe(false)
      expect(await seen.current!.setOption('model', 'gpt-6-astra')).toBe(false)
    })
    expect(dispatch).not.toHaveBeenCalled()
  })
  it('never commits a rejected write', async () => {
    const { seen } = await mount({ outcome: 'rejected' })
    await act(async () => {
      expect(await seen.current!.setOption('effort', 'high')).toBe(false)
    })
    expect(seen.current!.snapshot[1]?.kind.currentValue).toBeUndefined()
    expect(seen.current!.error).toContain('not sent')
  })
  it('accepts a lost acknowledgment only after provider confirmation', async () => {
    const { seen } = await mount({ outcome: 'unknown' })
    await act(async () => {
      expect(await seen.current!.setOption('effort', 'high')).toBe(true)
    })
    expect(seen.current!.snapshot[1]?.kind.currentValue).toBe('high')
  })
  it('reads the next stream page when confirmation follows a full output page', async () => {
    const { seen, calls } = await mount({ confirmationAfterPage: true })
    await act(async () => {
      expect(await seen.current!.setOption('effort', 'high')).toBe(true)
    })
    expect(calls).toHaveBeenCalledWith('terminal.read', {
      terminal: 'term-target',
      cursor: 110,
      limit: 100
    })
  })
  it('keeps a confirmed choice over stale reports, then follows later host model changes', async () => {
    const { seen, reportModel } = await mount({ reportedModel: 'gpt-6.1-sol' })
    await act(async () => {
      expect(await seen.current!.setOption('model', 'gpt-6-astra')).toBe(true)
    })
    expect(seen.current!.snapshot[0]?.kind.currentValue).toBe('gpt-6-astra')
    await reportModel('gpt-6.1-sol')
    expect(seen.current!.snapshot[0]?.kind.currentValue).toBe('gpt-6-astra')
    await reportModel('gpt-6-astra')
    await reportModel('gpt-6.1-sol')
    expect(seen.current!.snapshot[0]?.kind.currentValue).toBe('gpt-6.1-sol')
  })
  it('follows a distinct external model change even before the host echoes the chosen model', async () => {
    const { seen, reportModel } = await mount({ reportedModel: 'gpt-6.1-sol' })
    await act(async () => {
      expect(await seen.current!.setOption('model', 'gpt-6-astra')).toBe(true)
    })
    await reportModel('gpt-external')
    expect(seen.current!.snapshot[0]?.kind.currentValue).toBe('gpt-external')
  })
})
