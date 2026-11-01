import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MobileSessionKeyboardStateModel } from './use-mobile-session-keyboard-state'
import { useMobileSessionStartup } from './use-mobile-session-startup'
import { MobileSessionTabsStreamHealth } from './mobile-session-tabs-stream-health'
import type { RpcResponse } from '../transport/types'

const { activate, interpret } = vi.hoisted(() => ({ activate: vi.fn(), interpret: vi.fn() }))
vi.mock('../host-screen/host-screen-operations', () => ({
  worktreeActivate: { request: activate, interpret }
}))
vi.mock('./use-initial-session-terminal-autocreate', () => ({
  createInitialSessionAutoCreateState: () => ({ sawSessionTabs: false })
}))

function makeScope() {
  const ref = <T>(current: T) => ({ current })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: this hook reads only the lifecycle fields supplied below; the rest of the screen model belongs to other hooks.
  return {
    hostId: 'host',
    worktreeId: 'repo::D:/Repos/z-watch',
    connState: 'connected',
    client: {},
    setTerminals: vi.fn(),
    terminalsRef: ref([]),
    setSessionTabs: vi.fn(),
    appliedSnapshotMarkerRef: ref({ epoch: null, version: -1 }),
    closedTabTombstonesRef: ref(new Map()),
    setTerminalsLoaded: vi.fn(),
    setActiveHandle: vi.fn(),
    setActiveSessionTabId: vi.fn(),
    setMarkdownDocs: vi.fn(),
    setFileDocs: vi.fn(),
    terminalGestureInputQueuesRef: ref(new Map()),
    terminalGestureInputInFlightRef: ref(new Set()),
    sessionTabActionSheetKeyboardHideSubRef: ref(null),
    sessionTabActionSheetRequestSeqRef: ref(0),
    initializedHandlesRef: ref(new Set()),
    terminalDiagnosticsRef: ref({ resetRoute: vi.fn() }),
    activeHandleRef: ref(null),
    activeSessionTabTypeRef: ref(null),
    pendingSelectionRef: ref(null),
    selectedSessionTabIdRef: ref(null),
    pendingBrowserFocusPageIdRef: ref(null),
    pendingTerminalActivationAttemptRef: ref(null),
    initialSessionAutoCreateRef: ref({}),
    bufferedTerminalDraftState: {
      resetDrafts: vi.fn(),
      clearPendingRestorations: vi.fn()
    },
    clearPendingLiveInputCommit: vi.fn(),
    clearDelayedActionTimers: vi.fn(),
    showToast: vi.fn(),
    clearTerminalCache: vi.fn(),
    fetchTerminals: vi.fn(async () => true),
    fetchSessionTabs: vi.fn(async () => undefined),
    ensureSessionTabs: vi.fn(async () => undefined)
  } as unknown as MobileSessionKeyboardStateModel
}

function Harness({ scope }: { scope: MobileSessionKeyboardStateModel }) {
  useMobileSessionStartup(scope)
  return null
}

describe('mobile workspace startup hydration', () => {
  let renderer: ReactTestRenderer | null = null
  beforeEach(() => {
    vi.useFakeTimers()
    activate.mockReset()
    interpret.mockReturnValue({ accepted: false })
  })
  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
    vi.useRealTimers()
  })

  it('reconciles existing host tabs after activation finishes hydrating the workspace', async () => {
    const scope = makeScope()
    let finishActivation = () => {}
    activate.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishActivation = () => resolve({ ok: true })
        })
    )
    await act(async () => {
      renderer = create(createElement(Harness, { scope }))
    })
    expect(activate).toHaveBeenCalledWith(scope.client, {
      worktree: `id:${scope.worktreeId}`,
      notifyClients: false,
      navigation: 'caller'
    })
    expect(scope.fetchSessionTabs).not.toHaveBeenCalled()

    await act(async () => {
      finishActivation()
    })
    expect(scope.fetchSessionTabs).toHaveBeenCalledOnce()
    expect(scope.fetchTerminals).toHaveBeenCalledOnce()
  })

  it('still reads tabs from older hosts that refuse activation', async () => {
    const scope = makeScope()
    activate.mockRejectedValue(new Error('method_not_found'))
    await act(async () => {
      renderer = create(createElement(Harness, { scope }))
    })
    expect(scope.fetchSessionTabs).toHaveBeenCalledOnce()
  })

  it('does not apply a completed activation after leaving the workspace', async () => {
    const scope = makeScope()
    let finishActivation = () => {}
    activate.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishActivation = () => resolve({ ok: true })
        })
    )
    await act(async () => {
      renderer = create(createElement(Harness, { scope }))
    })
    act(() => renderer?.unmount())
    await act(async () => {
      finishActivation()
    })
    expect(scope.fetchSessionTabs).not.toHaveBeenCalled()
  })

  it('replaces a pending pre-hydration empty list with a fresh host snapshot', async () => {
    const scope = makeScope()
    if (!scope.client) {
      throw new Error('fixture client missing')
    }
    const replies: ((response: RpcResponse) => void)[] = []
    scope.client.sendRequest = vi.fn(
      () => new Promise<RpcResponse>((resolve) => replies.push(resolve))
    )
    const visibleTabs: string[][] = []
    const controller = new MobileSessionTabsStreamHealth<{ tabs: string[] }, string>({
      client: scope.client,
      scope: `id:${scope.worktreeId}`,
      apply: (snapshot) => {
        visibleTabs.push(snapshot.tabs)
        return { accepted: true, effectiveTabs: snapshot.tabs }
      },
      consumeAccepted: () => {},
      hasRecoveryNeed: () => false
    })
    controller.setReconciliationActive(true)
    scope.fetchSessionTabs = () => controller.requestReconciliation()
    scope.ensureSessionTabs = () => controller.ensureReconciliation()
    // Focus already started a list before the startup activation could finish.
    const earlyList = controller.requestReconciliation()
    let finishActivation = () => {}
    activate.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishActivation = () => resolve({ ok: true })
        })
    )
    await act(async () => {
      renderer = create(createElement(Harness, { scope }))
    })
    await act(async () => {
      finishActivation()
    })

    const success = (tabs: string[]): RpcResponse => ({
      id: 'list',
      ok: true,
      result: { tabs },
      _meta: { runtimeId: 'host' }
    })
    await act(async () => {
      replies[0]?.(success([]))
    })
    expect(replies).toHaveLength(2)
    await act(async () => {
      replies[1]?.(success(['agent-session:existing-chat']))
      await earlyList
    })
    expect(visibleTabs).toEqual([[], ['agent-session:existing-chat']])
    expect(scope.fetchTerminals).toHaveBeenCalledOnce()
    controller.dispose()
  })
})
