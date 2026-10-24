import { describe, expect, it } from 'vitest'
import type { NativeChatBlock, NativeChatMessage, NativeChatTextBlock } from './native-chat-types'
import {
  isNativeChatAutoApprovalMessage,
  isNativeChatAutoApprovalNotice
} from './native-chat-auto-approval'
import {
  nativeChatWorkRunEntries,
  nativeChatWorkRunMember,
  nativeChatWorkRunSpans
} from './native-chat-work-run'

const approved: NativeChatTextBlock = {
  type: 'text',
  tone: 'warning',
  text: 'Automatic approval review approved (risk: low): Requested local read.',
  providerFrame: {
    provider: 'codex',
    kind: 'notification:warning',
    payload: { head: '{"source":"review"}', byteLength: 19, digest: 'test', truncated: false }
  }
}
function message(
  id: string,
  blocks: NativeChatBlock[],
  role: NativeChatMessage['role'] = 'system'
): NativeChatMessage {
  return { id, blocks, role, source: 'transcript', timestamp: 1 }
}
const notice = (id: string) => message(id, [approved])
const call = (id: string) =>
  message(
    id,
    [{ type: 'tool-call', name: 'shell', input: { command: id }, state: 'completed' }],
    'assistant'
  )
const thought = message('thought', [{ type: 'text', text: 'Check the result.' }], 'reasoning')
const member = (row: NativeChatMessage, receipt = false) =>
  nativeChatWorkRunMember(row, receipt, false, true)

describe('technical activity provenance and membership', () => {
  it('opts desktop in without changing the legacy/mobile classifier', () => {
    expect(member(notice('approved'))).toBe('approval')
    expect(nativeChatWorkRunMember(notice('approved'), false, false)).toBeNull()
    expect(member(notice('receipt'), true)).toBeNull()
  })

  it.each([
    { tone: 'error' },
    { failure: { kind: 'notSignedIn' as const } },
    { presentation: 'compaction' },
    { contextClear: { operationId: 'clear', afterFence: 1, clearedAt: 2 } },
    { providerFrame: undefined },
    { providerFrame: { ...approved.providerFrame!, provider: 'claude' } },
    { providerFrame: { ...approved.providerFrame!, kind: 'notification:configWarning' } },
    { text: 'Automatic approval review denied: Ask the user.' },
    { text: 'Automatic approval review rejected (risk: high): Ask the user.' },
    { text: 'Automatic approval review timed out.' }
  ])('keeps actionable, unrelated and unknown sources out: %o', (override) => {
    const block = { ...approved, ...override }
    expect(isNativeChatAutoApprovalNotice(block)).toBe(false)
    expect(member(message('other', [block]))).toBeNull()
  })

  it.each<NativeChatBlock>([
    { type: 'text', text: 'Here is the answer.' },
    { type: 'image-ref', url: 'https://example.test/image.png' },
    { type: 'text', text: 'Sign in to continue.', tone: 'error', failure: { kind: 'notSignedIn' } },
    {
      type: 'text',
      text: 'future event',
      providerFrame: { ...approved.providerFrame!, kind: 'notification:future' }
    }
  ])('does not swallow mixed messages containing %o', (extra) => {
    const mixed = message('mixed', [approved, extra])
    expect(isNativeChatAutoApprovalMessage(mixed)).toBe(false)
    expect(member(mixed)).toBeNull()
  })

  it('never classifies a quoted success or an ordinary user text as activity', () => {
    expect(
      member(message('quoted', [{ type: 'text', text: approved.text }], 'assistant'))
    ).toBeNull()
    expect(member(message('user', [approved], 'user'))).toBeNull()
  })

  it('leaves failed tools, active questions and reasoning errors at boundaries', () => {
    expect(
      member(
        message(
          'failed',
          [{ type: 'tool-call', name: 'shell', input: null, state: 'failed' }],
          'assistant'
        )
      )
    ).toBeNull()
    expect(
      member(
        message(
          'error-result',
          [{ type: 'tool-result', output: 'Retry needed', isError: true }],
          'assistant'
        )
      )
    ).toBeNull()
    expect(
      member(
        message(
          'ask',
          [{ type: 'tool-call', name: 'AskUserQuestion', input: { questions: [] } }],
          'assistant'
        )
      )
    ).toBeNull()
    expect(
      member(
        message('bad-thought', [{ type: 'text', text: 'Continue?', tone: 'error' }], 'reasoning')
      )
    ).toBeNull()
    expect(nativeChatWorkRunMember({ ...thought, state: 'running' }, false, true, true)).toBeNull()
  })
})

describe('one ordered technical activity run', () => {
  it.each([
    [notice('first'), call('a'), thought, call('b'), notice('last')],
    [call('a'), notice('middle'), thought, call('b')],
    [thought, notice('only-notice')],
    [thought],
    [notice('single')],
    [message('orphan', [{ type: 'tool-result', output: 'legacy result' }], 'assistant')]
  ])('keeps all members including leading and trailing notices', (...members) => {
    const rows = members.map((row) => ({ member: member(row), scope: 'turn', draws: true }))
    expect(nativeChatWorkRunSpans(rows, true)).toEqual([members.map((_, index) => index)])
    const entries = nativeChatWorkRunEntries(members, true)
    const flattened = [
      ...entries.blocks.flatMap((block) => [...(entries.thoughtsBefore.get(block) ?? []), block]),
      ...entries.thoughtsAfter
    ]
    expect(flattened).toEqual(
      members.flatMap<NativeChatMessage | NativeChatBlock>((row) =>
        row.role === 'reasoning' || isNativeChatAutoApprovalMessage(row) ? [row] : row.blocks
      )
    )
  })

  it('keeps a legacy/mobile notice as a boundary and never counts it as a call', () => {
    expect(
      nativeChatWorkRunSpans([
        { member: 'approval', scope: 'u', draws: true },
        { member: 'thought', scope: 'u', draws: true }
      ])
    ).toEqual([])
    expect(nativeChatWorkRunEntries([notice('legacy')])).toEqual({
      blocks: [],
      thoughtsBefore: new Map(),
      thoughtsAfter: []
    })
  })
})
