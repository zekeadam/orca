// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatBlock, NativeChatMessage } from '../../../../shared/native-chat-types'
import { readAgentMessageSource } from '../../../../shared/agent-session-message-source'
import { MessageRow } from './NativeChatMessageRow'
import {
  buildNativeChatTranscriptSlots,
  nativeChatSlotIndexOf,
  type NativeChatMessageSlot
} from './native-chat-transcript-slots'
import {
  NativeChatDisclosureContext,
  useNativeChatDisclosures
} from './native-chat-disclosure-store'
import { nativeChatTranscriptWorkRuns } from './native-chat-transcript-work-runs'
import { nativeChatMessageSlices } from './native-chat-message-slices'
import { nativeChatWorkRunEditKey } from '../../../../shared/native-chat-work-run'

afterEach(cleanup)

function text(
  id: string,
  body: string,
  role: NativeChatMessage['role'] = 'assistant'
): NativeChatMessage {
  return { id, role, blocks: [{ type: 'text', text: body }], timestamp: 1, source: 'transcript' }
}
function call(id: string): NativeChatMessage {
  return {
    ...text(id, ''),
    blocks: [
      { type: 'tool-call', name: 'shell', input: { command: id }, callId: id, state: 'completed' }
    ]
  }
}
function notice(id: string): NativeChatMessage {
  return {
    ...text(id, '', 'system'),
    blocks: [
      {
        type: 'text',
        tone: 'warning',
        text: `Automatic approval review approved (risk: low): ${id} original review.`,
        providerFrame: {
          provider: 'codex',
          kind: 'notification:warning',
          payload: {
            head: JSON.stringify({ review: id }),
            byteLength: 30,
            digest: id,
            truncated: false
          }
        }
      }
    ]
  }
}
const thought: NativeChatMessage = {
  ...text('thought', 'Inspect before continuing.', 'reasoning'),
  state: 'completed',
  completedAt: 2001
}
function build(
  messages: NativeChatMessage[],
  overrides: Partial<Parameters<typeof buildNativeChatTranscriptSlots>[0]> = {}
): NativeChatMessageSlot[] {
  return buildNativeChatTranscriptSlots({
    collapseTechnicalActivity: true,
    messages,
    turnKeys: messages.map(() => 'turn'),
    liveTurnKey: undefined,
    receipts: new Map(),
    turnStatuses: { active: null, completedByTurn: {} },
    turnDiffs: new Map(),
    expandedTurnKeys: new Set(),
    isWorking: false,
    lifecycleWorking: false,
    ...overrides
  }).filter((slot): slot is NativeChatMessageSlot => slot.kind === 'message')
}
function Transcript({
  messages,
  visible = true
}: {
  messages: NativeChatMessage[]
  visible?: boolean
}) {
  const disclosures = useNativeChatDisclosures()
  return (
    <NativeChatDisclosureContext.Provider value={disclosures}>
      {visible
        ? build(messages).map((slot) => (
            <MessageRow
              key={slot.message.id}
              message={slot.message}
              workRun={slot.workRun}
              expandSignal={false}
              activeTurnIsWorking={slot.activeTurnIsWorking}
              trailingRun={slot.trailingRun}
              onScrollMessageToTop={() => {}}
            />
          ))
        : null}
    </NativeChatDisclosureContext.Provider>
  )
}
const rowIds = (slots: NativeChatMessageSlot[]) =>
  slots.map((slot) => slot.workRun?.map((row) => row.id) ?? slot.message.id)

describe('desktop technical activity projection', () => {
  it('reserves no empty reasoning rows and keeps adjacent activity together', () => {
    const blank = { ...thought, blocks: [{ type: 'text' as const, text: '\n  ' }] }
    expect(build([blank])).toEqual([])
    expect(rowIds(build([call('one'), blank, call('two')]))).toEqual([['one', 'two']])
  })
  it('preserves mixed block order, original copy identity and diff targeting', () => {
    const first: NativeChatBlock[] = [
      {
        type: 'tool-call',
        name: 'Diff',
        callId: 'first',
        input: { path: 'a.ts' },
        state: 'completed'
      },
      { type: 'tool-result', callId: 'first', output: '@@ -1 +1 @@\n-old\n+new' }
    ]
    const second: NativeChatBlock[] = [
      {
        type: 'tool-call',
        name: 'Diff',
        callId: 'second',
        input: { path: 'b.ts' },
        state: 'completed'
      },
      { type: 'tool-result', callId: 'second', output: '@@ -1 +1 @@\n-before\n+after' }
    ]
    const mixed = {
      ...text('mixed', ''),
      blocks: [
        { type: 'text' as const, text: 'Intro.' },
        ...first,
        ...notice('nested').blocks,
        { type: 'text' as const, text: 'Middle.' },
        ...second,
        { type: 'text' as const, text: 'Outro.' }
      ]
    }
    const slices = nativeChatMessageSlices(mixed)!
    expect(slices.flatMap((slice) => slice.blocks)).toEqual(mixed.blocks)
    expect(slices[0]?.id).toBe('mixed')
    expect(
      nativeChatWorkRunEditKey([mixed], slices[2]!.blocks, {
        messageId: 'mixed',
        editKey: 'Diff:1'
      })
    ).toBe('Diff:0')
    const onScroll = vi.fn()
    render(
      <MessageRow
        message={mixed}
        expandSignal={false}
        revealedDiff={{ messageId: 'mixed', editKey: 'Diff:1', fileIndex: 0, requestId: 1 }}
        onScrollMessageToTop={onScroll}
      />
    )
    expect(screen.getByText('Intro.')).toBeVisible()
    expect(screen.getByText('Middle.')).toBeVisible()
    expect(screen.getByText('Outro.')).toBeVisible()
    expect(screen.getByText('after')).toBeVisible()
    expect(onScroll).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('button', { name: 'Copy message' })).toHaveLength(1)
    expect(
      screen.getByRole('button', { name: 'Copy message' }).closest('[data-native-chat-message-id]')
    ).toHaveAttribute('data-native-chat-message-id', 'mixed')
  })

  it('keeps completed-turn commentary, timing and diff outside one ordered run', () => {
    const status = { startedAt: 1, thinking: false, workedSeconds: 5 }
    const diff = { files: [], added: 0, removed: 0, truncated: false }
    const messages = [
      text('user', 'go', 'user'),
      text('before', 'Starting work.'),
      call('one'),
      notice('approval-one'),
      thought,
      call('two'),
      notice('approval-two'),
      call('three'),
      text('after', 'Finished work.')
    ]
    const slots = build(messages, {
      turnStatuses: { active: null, completedByTurn: { turn: status } },
      turnDiffs: new Map([['turn', diff]])
    })
    expect(rowIds(slots)).toEqual([
      'user',
      'before',
      ['one', 'approval-one', 'thought', 'two', 'approval-two', 'three'],
      'after'
    ])
    expect(slots.every((slot) => !slot.folded && !slot.turnFolds)).toBe(true)
    expect(slots.filter((slot) => slot.status)).toHaveLength(1)
    expect(slots.filter((slot) => slot.turnDiff)).toHaveLength(1)
    expect(slots.at(-1)?.turnDiff).toBe(diff)
    expect(nativeChatSlotIndexOf(slots, 'approval-two')).toBe(2)
    render(<Transcript messages={messages} />)
    expect(screen.getByText('Starting work.')).toBeVisible()
    expect(screen.getByText('Finished work.')).toBeVisible()
    expect(screen.getByRole('button', { name: /Ran 3 commands/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    expect(screen.queryByRole('button', { name: 'Automatic approval granted' })).toBeNull()
  })

  it('routes an approval-first run through the activity renderer, retaining all detail in order', async () => {
    const messages = [notice('first'), call('one'), thought, notice('last')]
    render(<Transcript messages={messages} />)
    const toggle = screen.getByRole('button', { name: /one/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(screen.getAllByRole('button', { name: 'Automatic approval granted' })).toHaveLength(2)
    for (const button of screen.getAllByRole('button', { name: 'Automatic approval granted' })) {
      fireEvent.click(button)
    }
    fireEvent.click(screen.getByRole('button', { name: /Thought/ }))
    const scroller = document.querySelector('[data-native-chat-tool-run-members]')!
    const content = scroller.textContent!
    expect(content.indexOf('first original review')).toBeLessThan(content.indexOf('one'))
    expect(content.indexOf('Inspect before continuing.')).toBeLessThan(
      content.indexOf('last original review')
    )
    fireEvent.click(screen.getAllByText('Details')[0]!.closest('summary')!)
    await waitFor(() => expect(scroller.textContent).toContain('"review":"first"'))
  })

  it.each([[thought, notice('aside')], [notice('single')], [thought]])(
    'draws even a run with no tools',
    (...messages) => {
      render(<Transcript messages={messages} />)
      const toggle = screen.getByRole('button', { name: 'Technical activity' })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      expect(toggle.querySelector('svg.lucide-check')).toBeNull()
      fireEvent.click(toggle)
      expect(document.querySelector('[data-native-chat-tool-run-members]')).toBeInTheDocument()
    }
  )

  it('keeps scope, receipt, question, failure and mail boundaries', () => {
    const question: NativeChatMessage = {
      ...call('question'),
      blocks: [{ type: 'tool-call', name: 'AskUserQuestion', input: null }]
    }
    const failed: NativeChatMessage = {
      ...call('failed'),
      blocks: [{ type: 'tool-call', name: 'shell', input: null, state: 'failed' }]
    }
    const mail = text('mail', 'You have messages.', 'user')
    expect(
      rowIds(build([call('a'), question, call('b'), failed, notice('n'), mail, call('c')]))
    ).toEqual([['a'], 'question', ['b'], 'failed', ['n'], 'mail', ['c']])
    const slots = build([call('a'), notice('b'), call('c')])
    const raw = [call('a'), notice('b'), call('c')].map((message) => ({
      ...slots[0]!,
      message,
      workRun: undefined
    }))
    expect(
      rowIds(
        nativeChatTranscriptWorkRuns(
          raw.map((slot, index) => ({ ...slot, depth: index })),
          undefined,
          true
        ).filter((slot): slot is NativeChatMessageSlot => slot.kind === 'message')
      )
    ).toEqual([['a'], ['b'], ['c']])
    expect(rowIds(build([call('a'), notice('b')], { turnKeys: ['one', 'two'] }))).toEqual([
      ['a'],
      ['b']
    ])
    const receipt = {
      kind: 'approval' as const,
      title: 'Allowed',
      detail: 'command',
      options: [],
      resolution: {
        state: 'resolved' as const,
        selectedOptionId: 'y',
        resolvedBy: 'desktop' as const,
        resolvedAt: 1
      }
    }
    expect(
      rowIds(
        build([call('a'), notice('receipt'), call('b')], {
          receipts: new Map([['receipt', receipt]])
        })
      )
    ).toEqual([['a'], 'receipt', ['b']])
  })

  it('does not hide mixed prose, image or errors, including a streaming notice gaining prose', async () => {
    const { rerender } = render(<Transcript messages={[call('one'), notice('growing')]} />)
    const toggle = screen.getByRole('button', { name: /one/ })
    fireEvent.click(toggle)
    const extras: NativeChatBlock[] = [
      { type: 'text', text: 'Visible streaming answer.' },
      { type: 'text', text: 'Action required.', tone: 'error' }
    ]
    const growing = { ...notice('growing'), blocks: [...notice('growing').blocks, ...extras] }
    rerender(<Transcript messages={[call('one'), growing]} />)
    expect(screen.getByText('Visible streaming answer.')).toBeVisible()
    expect(screen.getByText('Action required.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'one' })).toBe(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(
      rowIds(
        build([
          call('one'),
          {
            ...growing,
            blocks: [
              ...growing.blocks,
              { type: 'image-ref', url: 'https://example.test/photo.png' }
            ]
          }
        ])
      )
    ).toEqual([['one'], 'growing'])
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Automatic approval granted' })).toBeInTheDocument()
    )
  })

  it('remembers open, explicit close and member scroll across streaming and virtual remount', () => {
    const { rerender } = render(<Transcript messages={[notice('head'), call('one')]} />)
    const toggle = screen.getByRole('button', { name: /one/ })
    fireEvent.click(toggle)
    const scroller = document.querySelector<HTMLElement>('[data-native-chat-tool-run-members]')!
    Object.defineProperties(scroller, {
      scrollHeight: { value: 900 },
      clientHeight: { value: 200 }
    })
    scroller.scrollTop = 120
    fireEvent.scroll(scroller)
    rerender(<Transcript messages={[notice('head'), call('one'), notice('more'), call('two')]} />)
    expect(screen.getByRole('button', { name: /Ran 2 commands/ })).toBe(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    rerender(<Transcript messages={[]} visible={false} />)
    rerender(<Transcript messages={[notice('head'), call('one'), notice('more'), call('two')]} />)
    expect(screen.getByRole('button', { name: /Ran 2 commands/ })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    expect(document.querySelector('[data-native-chat-tool-run-members]')?.scrollTop).toBe(120)
    fireEvent.click(screen.getByRole('button', { name: /Ran 2 commands/ }))
    rerender(
      <Transcript
        messages={[notice('head'), call('one'), notice('more'), call('two'), call('three')]}
      />
    )
    expect(screen.getByRole('button', { name: /Ran 3 commands/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })
})

describe('provenance-backed orchestration notice', () => {
  const mailText = 'You have 1 orchestration message. Run `orca-dev orchestration check`.'
  const from = readAgentMessageSource({
    kind: 'agent',
    senders: [
      {
        party: { address: 'dispatch:remote', terminalHandle: null, orcaSessionId: null },
        name: 'Reviewer'
      }
    ],
    orchestration: {
      message: 'mail-notice',
      mailbox: 'worker',
      dispatchId: 'dispatch',
      messages: [{ messageId: 'message', runId: 'run', from: 'dispatch:remote' }]
    }
  })!

  it('is keyboard accessible, preserves sender/body/copy and restores after remount', async () => {
    const user = userEvent.setup()
    const message = { ...text('mail', mailText, 'user'), from }
    const { rerender } = render(<Transcript messages={[message]} />)
    expect(screen.getByText('Reviewer')).toBeVisible()
    const toggle = screen.getByRole('button', { name: 'Orchestration notice' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle.querySelector('button')).toBeNull()
    expect(screen.queryByText(/You have 1 orchestration message/)).toBeNull()
    toggle.focus()
    await user.keyboard('{Enter}')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/You have 1 orchestration message/)).toBeVisible()
    expect(screen.getByRole('button', { name: /Copy/ })).toBeInTheDocument()
    rerender(<Transcript messages={[]} visible={false} />)
    rerender(<Transcript messages={[message]} />)
    const restored = screen.getByRole('button', { name: 'Orchestration notice' })
    expect(restored).toHaveAttribute('aria-expanded', 'true')
    restored.focus()
    await user.keyboard(' ')
    expect(restored).toHaveAttribute('aria-expanded', 'false')
  })

  it.each([
    undefined,
    { ...from, orchestration: null },
    {
      ...from,
      orchestration: { message: 'task' as const, runId: 'r', taskId: 't', dispatchId: 'd' }
    },
    readAgentMessageSource({ ...from, orchestration: { message: 'future' } }),
    readAgentMessageSource({ ...from, orchestration: { message: 'mail-notice', mailbox: 17 } })
  ])('keeps legacy, unknown and task messages visible', (source) => {
    render(<Transcript messages={[{ ...text('legacy', mailText, 'user'), from: source }]} />)
    expect(screen.getByText(/You have 1 orchestration message/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Orchestration notice' })).toBeNull()
  })

  it('keeps sending and failed-delivery controls outside the collapsed body', () => {
    const message = { ...text('mail', mailText, 'user'), from }
    const props = { message, expandSignal: false, onScrollMessageToTop: () => {} }
    const { rerender } = render(<MessageRow {...props} deliveryNotice={{ sending: true }} />)
    expect(screen.getByText('Sending…')).toBeVisible()
    rerender(
      <MessageRow {...props} deliveryNotice={{ text: 'Delivery failed', onDismiss: () => {} }} />
    )
    expect(screen.getByText('Delivery failed')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Orchestration notice' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })

  it('estimates a long collapsed mailbox body as one compact notice', () => {
    const short = { ...text('short', 'Mail', 'user'), from }
    const long = { ...text('long', 'Long mailbox content. '.repeat(2000), 'user'), from }
    expect(build([short])[0]?.estimatedHeight).toBe(build([long])[0]?.estimatedHeight)
  })
})
