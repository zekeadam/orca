import { buildMobileCodexModelOptions } from './mobile-codex-model-options'
import {
  reconcileMobileCodexModelSelection,
  type ConfirmedMobileCodexModelSelection
} from './mobile-codex-model-selection'
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import type { AgentSessionModelCatalogResult } from '../../../src/shared/agent-session-wire'
import type {
  RuntimeTerminalRead,
  RuntimeTerminalAgentStatus
} from '../../../src/shared/runtime-terminal-contracts'
import type { SessionOptionValue } from '../../../src/shared/native-chat-session-options'
import type { RpcClient } from '../transport/rpc-client'
import { callAgentSession } from './mobile-structured-agent-session-rpc'
import {
  sendMobileNativeChatMessageWithOutcome,
  type MobileNativeChatSendOutcome
} from './mobile-native-chat-send'
import {
  acquireMobileNativeChatTerminalWrite,
  releaseMobileNativeChatTerminalWrite
} from './mobile-native-chat-terminal-write-lock'
import type { MobileNativeChatSessionOptionsController } from './use-mobile-native-chat-session-options'
import {
  mobileCodexModelCommand,
  mobileCodexModelPickerOpen,
  mobileCodexSessionModelCommandSupported,
  mobileCodexModelInputReady,
  readMobileCodexModelConfirmation
} from './mobile-codex-model-command'

type Catalog = Extract<AgentSessionModelCatalogResult, { models: unknown }>

/** Terminal Codex uses the host catalog and its session-only command, never global preferences. */
export function useMobileCodexModelSelector(args: {
  enabled: boolean
  client: RpcClient | null
  scope: string | null
  worktreeId: string
  handleRef?: MutableRefObject<string | null>
  deviceTokenRef?: MutableRefObject<string | null>
  reportedModel: string | null
  dispatchCommand: (text: string) => Promise<MobileNativeChatSendOutcome>
}): MobileNativeChatSessionOptionsController {
  const { enabled, client, scope, handleRef, reportedModel, dispatchCommand, worktreeId } = args
  const [listing, setListing] = useState<{
    scope: string | null
    catalog: Catalog | null
    error: string | null
  } | null>(null)
  const [selection, setSelection] = useState<ConfirmedMobileCodexModelSelection | null>(null)
  const [pending, setPending] = useState<{ scope: string | null; id: string } | null>(null)
  const [failure, setFailure] = useState<{ scope: string | null; message: string } | null>(null)
  const identity = useRef(scope)
  identity.current = scope
  const inFlight = useRef(false)
  const latestReportedModel = useRef(reportedModel)
  latestReportedModel.current = reportedModel
  const reconciled = reconcileMobileCodexModelSelection(selection, scope, reportedModel)
  if (reconciled !== selection) {
    setSelection(reconciled)
  }
  useEffect(() => {
    if (!enabled || !client) {
      return
    }
    let stale = false
    void callAgentSession<AgentSessionModelCatalogResult>(
      client,
      'agentSession.modelCatalog',
      {
        agent: 'codex',
        worktree: `id:${worktreeId}`,
        waitForListing: true
      },
      45_000
    )
      .then((result) => {
        if (!stale) {
          setListing({
            scope,
            catalog: result.origin === 'unknown' ? null : result,
            error:
              result.origin === 'unknown'
                ? 'Model choices are unavailable. Update Codex and Orca on this host.'
                : null
          })
        }
      })
      .catch(() => {
        if (!stale) {
          setListing({
            scope,
            catalog: null,
            error: 'Could not load models from this host. Reopen the chat to retry.'
          })
        }
      })
    return () => {
      stale = true
    }
  }, [enabled, client, scope, worktreeId])
  const catalog = listing?.scope === scope ? listing.catalog : null
  const chosen = reconciled?.scope === scope ? reconciled : null
  const modelId = chosen?.model ?? reportedModel
  const model = catalog?.models.find((entry) => entry.id === modelId)
  const error =
    failure?.scope === scope ? failure.message : listing?.scope === scope ? listing.error : null
  const snapshot = useMemo(
    () => buildMobileCodexModelOptions(catalog, modelId, chosen),
    [catalog, modelId, chosen]
  )

  const setOption = async (id: string, value: SessionOptionValue): Promise<boolean> => {
    if (
      !enabled ||
      !client ||
      !handleRef?.current ||
      inFlight.current ||
      typeof value !== 'string'
    ) {
      return false
    }
    const target = id === 'model' ? catalog?.models.find((entry) => entry.id === value) : model
    const effort = id === 'effort' ? value : undefined
    const command = target && mobileCodexModelCommand(target.id, effort)
    if (
      !command ||
      (id !== 'model' && id !== 'effort') ||
      (effort && !target.efforts.some((entry) => entry.value === effort))
    ) {
      return false
    }
    const terminal = handleRef.current
    const current = () => identity.current === scope && handleRef.current === terminal
    inFlight.current = true
    setPending({ scope, id })
    setFailure(null)
    try {
      const status = await callAgentSession<{ agentStatus: RuntimeTerminalAgentStatus }>(
        client,
        'terminal.agentStatus',
        { terminal }
      )
      if (
        !current() ||
        !status.agentStatus.isRunningAgent ||
        status.agentStatus.status !== 'idle'
      ) {
        throw new Error('Wait until this session is idle before changing its model.')
      }
      let screen = await callAgentSession<{ terminal: RuntimeTerminalRead }>(
        client,
        'terminal.read',
        { terminal, screen: true, limit: 100 }
      )
      const startup = await callAgentSession<{ terminal: RuntimeTerminalRead }>(
        client,
        'terminal.read',
        { terminal, cursor: 0, limit: 100 }
      )
      if (
        !current() ||
        screen.terminal.source !== 'screen' ||
        !mobileCodexSessionModelCommandSupported(
          [...startup.terminal.tail, ...screen.terminal.tail].join('\n')
        )
      ) {
        throw new Error(
          'Could not verify session-only model selection for this Codex version. Update Codex or reopen the chat to retry.'
        )
      }
      if (mobileCodexModelPickerOpen(screen.terminal.tail.join('\n'))) {
        const device = args.deviceTokenRef?.current
        if (!device || !acquireMobileNativeChatTerminalWrite(terminal)) {
          throw new Error('Codex input is busy. Try again.')
        }
        try {
          if (
            !current() ||
            (await sendMobileNativeChatMessageWithOutcome({
              client,
              terminal,
              text: '\u001b',
              enter: false,
              requireWriteSettlement: true,
              mobileClient: { id: device, type: 'mobile' }
            })) !== 'accepted'
          ) {
            throw new Error('Could not close the Codex picker. Try again.')
          }
        } finally {
          releaseMobileNativeChatTerminalWrite(terminal)
        }
        await new Promise((resolve) => setTimeout(resolve, 200))
        screen = await callAgentSession(client, 'terminal.read', {
          terminal,
          screen: true,
          limit: 100
        })
      }
      if (
        !current() ||
        screen.terminal.source !== 'screen' ||
        !mobileCodexModelInputReady(screen.terminal.tail.join('\n'))
      ) {
        throw new Error(
          'Codex input is not ready. Close any open picker and keep the terminal input empty, then try again.'
        )
      }
      const before = await callAgentSession<{ terminal: RuntimeTerminalRead }>(
        client,
        'terminal.read',
        { terminal, limit: 1 }
      )
      let cursor = Number(before.terminal.nextCursor)
      if (!current() || before.terminal.nextCursor === null || !Number.isSafeInteger(cursor)) {
        throw new Error('Could not verify this session. No model change was sent.')
      }
      if ((await dispatchCommand(command)) === 'rejected') {
        throw new Error('Model change was not sent. Try again when the session is ready.')
      }
      const deadline = Date.now() + 5000
      while (current() && Date.now() < deadline) {
        const read = await callAgentSession<{ terminal: RuntimeTerminalRead }>(
          client,
          'terminal.read',
          { terminal, cursor, limit: 100 },
          3000
        )
        if (!current()) {
          return false
        }
        const confirmed = readMobileCodexModelConfirmation(read.terminal.tail.join('\n'))
        if (confirmed?.model === target.id && (!effort || confirmed.effort === effort)) {
          if (current()) {
            setSelection({
              scope,
              ...confirmed,
              reportedModelAtSelection: reportedModel,
              reportAcknowledged: latestReportedModel.current === confirmed.model
            })
          }
          return true
        }
        const nextCursor = Number(read.terminal.nextCursor)
        if (
          read.terminal.nextCursor !== null &&
          Number.isSafeInteger(nextCursor) &&
          nextCursor > cursor
        ) {
          cursor = nextCursor
          if (read.terminal.limited) {
            continue
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
      throw new Error(
        'Model change was not confirmed. This Codex version may not support graphical selection. Reopen the chat to refresh before retrying.'
      )
    } catch (reason) {
      if (current()) {
        setFailure({
          scope,
          message: reason instanceof Error ? reason.message : 'Could not change the model.'
        })
      }
      return false
    } finally {
      inFlight.current = false
      setPending(null)
    }
  }
  return {
    snapshot: enabled ? snapshot : [],
    pendingId: pending?.scope === scope ? pending.id : null,
    error: error ?? undefined,
    loading: enabled && listing?.scope !== scope,
    setOption,
    invokeAction: async () => false,
    recordCommand: () => {}
  }
}
