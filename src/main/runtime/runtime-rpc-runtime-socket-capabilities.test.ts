import './rpc/unused-default-rpc-methods.test-fixture'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY } from '../../shared/protocol-version'
import { OrcaRuntimeService } from './orca-runtime'
import { OrcaRuntimeRpcServer } from './runtime-rpc'
import { DEVICE_REGISTRY_FILENAME } from './mobile-pairing-files'
import { RUNTIME_CLIENT_CAPABILITY_METHODS } from './rpc/methods/runtime-client-capabilities'
import { SESSION_TAB_METHODS } from './rpc/methods/session-tabs'
import { COMPUTER_METHODS } from './rpc/methods/computer'
import {
  authenticateMobileWsSession,
  createEncryptedWsResponseReader,
  sendEncryptedWsRequest,
  type AuthenticatedMobileWs
} from './runtime-rpc-mobile-ws-test-harness'

it('negotiates chat rendering on a runtime pairing without changing its authority', async () => {
  const userDataPath = mkdtempSync(join(tmpdir(), 'orca-runtime-socket-capabilities-'))
  const runtime = new OrcaRuntimeService()
  runtime.projectStructuredAgentSessionTab({
    sessionId: 'codex-existing-chat',
    workspaceId: 'workspace-1',
    agent: 'codex',
    activate: false
  })
  const server = new OrcaRuntimeRpcServer({
    runtime,
    userDataPath,
    enableWebSocket: true,
    wsPort: 0,
    pinnedBindHost: '127.0.0.1',
    methods: [...RUNTIME_CLIENT_CAPABILITY_METHODS, ...SESSION_TAB_METHODS, ...COMPUTER_METHODS]
  })
  const sessions: AuthenticatedMobileWs[] = []
  const readers: ReturnType<typeof createEncryptedWsResponseReader>[] = []
  await server.start()
  try {
    const offer = server.createPairingOffer({
      address: '127.0.0.1',
      name: 'Legacy phone runtime pairing',
      scope: 'runtime'
    })
    if (!offer.available) {
      throw new Error('WebSocket pairing unavailable')
    }
    // Legacy native clients authenticate without capabilities, then advertise them by RPC.
    const session = await authenticateMobileWsSession(offer.pairingUrl)
    sessions.push(session)
    const responses = createEncryptedWsResponseReader(session)
    readers.push(responses)
    const request = (id: string, method: string, params: unknown) => {
      sendEncryptedWsRequest(session, { id, method, params })
      return responses.next(id)
    }
    const selector = { worktree: 'id:workspace-1' }
    await expect(request('before', 'session.tabs.list', selector)).resolves.toMatchObject({
      ok: true,
      result: { tabs: [] }
    })
    const registry = server.getDeviceRegistry()
    expect(registry?.getDevice(offer.deviceId)?.scope).toBe('runtime')
    registry?.flushPendingLastSeen()
    const registryPath = join(userDataPath, DEVICE_REGISTRY_FILENAME)
    const registryBefore = readFileSync(registryPath, 'utf8')
    const capabilities = [STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY]
    const upgrade = await request('capabilities', 'runtime.clientCapabilities.update', {
      clientCapabilities: capabilities
    })
    const tabs = await request('after', 'session.tabs.list', selector)
    expect.soft({ upgrade, tabs }).toMatchObject({
      upgrade: { ok: true, result: { clientCapabilities: capabilities } },
      tabs: {
        ok: true,
        result: {
          tabs: [
            {
              type: 'agent-session',
              id: 'agent-session:codex-existing-chat',
              sessionId: 'codex-existing-chat'
            }
          ]
        }
      }
    })
    await expect(request('desktop-control', 'computer.listApps', {})).resolves.toMatchObject({
      ok: false,
      error: { code: 'forbidden', message: expect.stringContaining('desktop-control') }
    })
    registry?.flushPendingLastSeen()
    expect(readFileSync(registryPath, 'utf8')).toBe(registryBefore)

    // Rendering support belongs to this socket, even when another uses the same credential.
    const second = await authenticateMobileWsSession(offer.pairingUrl)
    sessions.push(second)
    const secondResponses = createEncryptedWsResponseReader(second)
    readers.push(secondResponses)
    sendEncryptedWsRequest(second, {
      id: 'other-socket',
      method: 'session.tabs.list',
      params: selector
    })
    await expect(secondResponses.next('other-socket')).resolves.toMatchObject({
      ok: true,
      result: { tabs: [] }
    })
  } finally {
    for (const reader of readers) {
      reader.dispose()
    }
    for (const session of sessions) {
      session.ws.terminate()
    }
    await server.stop()
    rmSync(userDataPath, { recursive: true, force: true })
  }
})
