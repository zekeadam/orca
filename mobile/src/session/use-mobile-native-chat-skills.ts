import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import type { DiscoveredSkill } from '../../../src/shared/skills'
import { isNativeChatSkillForAgent } from '../../../src/shared/native-chat-skill-visibility'
import type { RpcClient } from '../transport/rpc-client'
import { bindDeferredRpcOperation, defineRpcOperation } from '../transport/rpc-operation'
import { rpcResultVariant } from '../transport/rpc-operation-result-reader'

const sourceKind = z.enum(['home', 'repo', 'bundled', 'plugin'])
const providers = z.array(z.enum(['codex', 'claude', 'agent-skills']))
export const mobileSkillDiscoverySchema = z.object({
  skills: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      providers,
      sourceKind,
      sourceLabel: z.string(),
      rootPath: z.string(),
      rootPaths: z.array(z.string()).optional(),
      directoryPath: z.string(),
      skillFilePath: z.string(),
      installed: z.boolean(),
      updatedAt: z.number().nullable()
    })
  ),
  sources: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      path: z.string(),
      sourceKind,
      providers,
      owner: z.string().nullable(),
      exists: z.boolean()
    })
  )
})
const discovery = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'mobile-chat.skills',
    method: 'skills.discover',
    acceptance: 'success-result-or-skip',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('skill-catalog', mobileSkillDiscoverySchema)
  })
)
const workspace = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'mobile-chat.skill-directory',
    method: 'worktree.show',
    acceptance: 'success-result-or-skip',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant(
      'skill-directory',
      z.object({ worktree: z.object({ path: z.string() }) })
    )
  })
)
const EMPTY: readonly DiscoveredSkill[] = []
export type MobileChatSkillDiscovery = { skills: readonly DiscoveredSkill[]; refresh: () => void }

/** Reads metadata on the execution host; never reads a skill's body into the phone. */
export function useMobileNativeChatSkills(args: {
  client: RpcClient | null
  hostId: string | null
  worktreeId: string
  cwd?: string | null
  agent: string | null
  enabled: boolean
}): MobileChatSkillDiscovery {
  const { client, hostId, worktreeId, cwd, agent, enabled } = args
  const key = JSON.stringify([hostId, worktreeId, cwd, agent, client?.getGeneration?.()])
  const [state, setState] = useState<{
    key: string
    client: RpcClient
    skills: DiscoveredSkill[]
  } | null>(null)
  const [generation, setGeneration] = useState(0)
  const refresh = useCallback(() => setGeneration((n) => n + 1), [])
  useEffect(() => {
    if (!client || !hostId || !worktreeId || !agent || !enabled) {
      return
    }
    let stale = false
    async function load(client: RpcClient, hostId: string, agent: string) {
      let directory = cwd
      if (!directory) {
        const result = workspace.interpret(
          await workspace.requestSingleFlight(client, hostId, { worktree: `id:${worktreeId}` })
        )
        if (!result.accepted) {
          return
        }
        directory = result.value.worktree.path
      }
      if (stale) {
        return
      }
      const result = discovery.interpret(
        await discovery.requestSingleFlight(client, hostId, { worktreeId, cwd: directory })
      )
      if (!stale && result.accepted) {
        const skills = result.value.skills.filter((skill) =>
          isNativeChatSkillForAgent(agent, skill, result.value)
        )
        setState({ key, client: client, skills })
      }
    }
    void load(client, hostId, agent).catch(() => {
      if (!stale) {
        setState(null)
      }
    })
    return () => {
      stale = true
    }
  }, [agent, client, cwd, enabled, generation, hostId, key, worktreeId])
  return {
    skills: enabled && state?.key === key && state.client === client ? state.skills : EMPTY,
    refresh
  }
}
