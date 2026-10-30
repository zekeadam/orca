import { mobileComposerSlashItems } from './mobile-native-chat-composer-menu'
import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import {
  mobileSkillDiscoverySchema,
  useMobileNativeChatSkills
} from './use-mobile-native-chat-skills'

const skill = (name: string, rootPath = '/shared') => ({
  id: name,
  name,
  description: 'Metadata',
  providers: ['agent-skills'],
  sourceKind: 'home',
  sourceLabel: 'Personal',
  rootPath,
  directoryPath: `${rootPath}/${name}`,
  skillFilePath: `${rootPath}/${name}/SKILL.md`,
  installed: true,
  updatedAt: null
})
const catalog = {
  skills: [skill('ask'), skill('smart-execution'), skill('private-claude', '/claude')],
  sources: [
    {
      id: 'shared',
      label: 'Shared',
      path: '/shared',
      sourceKind: 'home',
      providers: ['agent-skills'],
      owner: null,
      exists: true
    },
    {
      id: 'claude',
      label: 'Claude',
      path: '/claude',
      sourceKind: 'home',
      providers: ['claude'],
      owner: 'claude',
      exists: true
    }
  ]
}
let renderer: ReactTestRenderer | null = null
let hook: ReturnType<typeof useMobileNativeChatSkills>
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = null
})
function Probe(props: {
  client: RpcClient
  hostId: string
  worktreeId?: string
  enabled?: boolean
}) {
  hook = useMobileNativeChatSkills({
    ...props,
    worktreeId: props.worktreeId ?? 'folder',
    agent: 'codex',
    enabled: props.enabled ?? true
  })
  return null
}
const clientFor = (sendRequest: RpcClient['sendRequest']): RpcClient => ({
  sendRequest,
  subscribe: () => () => {},
  updateTerminalSubscriptionViewport: () => {},
  getState: () => 'connected',
  getReconnectAttempt: () => 0,
  getLastConnectedAt: () => null,
  onStateChange: () => () => {},
  notifyForeground: () => {},
  close: () => {}
})
it('reads host workspace metadata, shares desktop visibility and refreshes when opened', async () => {
  const sendRequest = vi.fn(async (method: string) => ({
    id: '1',
    ok: true as const,
    result: method === 'worktree.show' ? { worktree: { path: '/folder' } } : catalog
  }))
  const client = clientFor(sendRequest)
  await act(async () => {
    renderer = create(createElement(Probe, { client, hostId: 'host-a' }))
  })
  expect(sendRequest).toHaveBeenCalledWith('skills.discover', {
    worktreeId: 'folder',
    cwd: '/folder'
  })
  expect(hook.skills.map((entry) => entry.name)).toEqual(['ask', 'smart-execution'])
  await act(async () => hook.refresh())
  expect(sendRequest.mock.calls.filter(([method]) => method === 'skills.discover')).toHaveLength(2)
  await act(async () =>
    renderer!.update(createElement(Probe, { client, hostId: 'host-a', enabled: false }))
  )
  expect(hook.skills).toEqual([])
})
it('hides old-host and late previous-host results rather than leaking another host catalog', async () => {
  let release: (() => void) | undefined
  const client = clientFor(
    vi.fn(async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return { id: '1', ok: true as const, result: { worktree: { path: '/old-host' } } }
    })
  )
  await act(async () => {
    renderer = create(createElement(Probe, { client, hostId: 'old' }))
  })
  const oldRelease = release!
  const refused = clientFor(
    vi.fn(async () => ({
      id: '2',
      ok: false as const,
      error: { code: 'METHOD_NOT_FOUND', message: 'Old host' }
    }))
  )
  await act(async () => renderer!.update(createElement(Probe, { client: refused, hostId: 'new' })))
  await act(async () => oldRelease())
  expect(hook.skills).toEqual([])
  expect(client.sendRequest).toHaveBeenCalledTimes(1)
})
it('drops unrequested private skill bodies from the metadata reader', () => {
  const result = mobileSkillDiscoverySchema.parse({
    ...catalog,
    skills: [{ ...skill('ask'), content: 'PRIVATE BODY' }]
  })
  expect(JSON.stringify(result)).not.toContain('PRIVATE BODY')
})

it('filters dollar names without matching descriptions or commands and preserves session authority', () => {
  const skills = mobileSkillDiscoverySchema.parse(catalog).skills
  const input = {
    agent: 'codex',
    structured: undefined,
    skills,
    query: 'ASK',
    trigger: '$' as const
  }
  expect(mobileComposerSlashItems(input).map((row) => row.token)).toEqual(['$ask'])
  expect(mobileComposerSlashItems({ ...input, query: 'Metadata' })).toEqual([])
  expect(mobileComposerSlashItems({ ...input, query: 'CODEX_HOME' })).toEqual([])
  expect(mobileComposerSlashItems({ ...input, agent: 'claude' })).toEqual([])
  expect(
    mobileComposerSlashItems({ ...input, structured: { reported: [], conversationCommands: [] } })
  ).toEqual([])
  expect(
    mobileComposerSlashItems({
      ...input,
      structured: { reported: [{ name: 'ask', kind: 'skill' }], conversationCommands: [] }
    }).map((row) => row.token)
  ).toEqual(['$ask'])
})
