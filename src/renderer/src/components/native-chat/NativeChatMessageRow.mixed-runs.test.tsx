// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatBlock, NativeChatMessage } from '../../../../shared/native-chat-types'
import { pairToolBlocks } from '../../../../shared/native-chat-tool-pairs'
import { nativeChatWorkRunEntries } from '../../../../shared/native-chat-work-run'
import { MessageRow } from './NativeChatMessageRow'
import {
  NativeChatTranscriptRow,
  type NativeChatTranscriptRowContext
} from './NativeChatTranscriptRow'
import {
  buildNativeChatTranscriptSlots,
  nativeChatSlotIndexOf,
  type NativeChatMessageSlot
} from './native-chat-transcript-slots'
import { nativeChatTurnDiffs } from './native-chat-turn-diffs'
import {
  NativeChatDisclosureContext,
  useNativeChatDisclosures
} from './native-chat-disclosure-store'

afterEach(cleanup)

function message(id: string, blocks: NativeChatBlock[]): NativeChatMessage {
  return { id, role: 'assistant', blocks, timestamp: 1, source: 'transcript' }
}
const prose = (text: string): NativeChatBlock => ({ type: 'text', text })
const approval: NativeChatBlock = {
  type: 'text',
  text: 'Automatic approval review approved (risk: low): permitted command.',
  tone: 'warning',
  providerFrame: {
    provider: 'codex',
    kind: 'notification:warning',
    payload: { head: '{"review":"approved"}', byteLength: 21, digest: 'approval', truncated: false }
  }
}
function command(id: string): NativeChatBlock[] {
  return [
    { type: 'tool-call', name: 'shell', callId: id, input: { command: id }, state: 'completed' },
    { type: 'tool-result', callId: id, output: `${id} output` }
  ]
}
function project(messages: NativeChatMessage[], collapseTechnicalActivity = true) {
  return buildNativeChatTranscriptSlots({
    messages,
    collapseTechnicalActivity,
    turnKeys: messages.map(() => 'turn'),
    liveTurnKey: undefined,
    receipts: new Map(),
    turnStatuses: { active: null, completedByTurn: {} },
    turnDiffs: nativeChatTurnDiffs(
      messages,
      messages.map(() => 'turn')
    ),
    expandedTurnKeys: new Set(),
    isWorking: false,
    lifecycleWorking: false
  }).filter((slot): slot is NativeChatMessageSlot => slot.kind === 'message')
}
const context: NativeChatTranscriptRowContext = {
  expandSignal: false,
  revealedDiff: null,
  taskListPredecessors: new Map(),
  expandedTurnIds: new Set(),
  allowFileUriLinks: false,
  onToggleExpandedTurn: () => {},
  subagentDisclosure: { setSectionOpen: () => {}, setRosterOpen: () => {} },
  onScrollMessageToTop: () => {},
  onRevealDiff: () => {}
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
        ? project(messages).map((slot) => (
            <NativeChatTranscriptRow key={slot.message.id} slot={slot} context={context} />
          ))
        : null}
    </NativeChatDisclosureContext.Provider>
  )
}

describe('mixed message call ownership and run projection', () => {
  it.each([true, false])(
    'keeps a separated Diff pair and its original reveal (named=%s)',
    (named) => {
      const call: NativeChatBlock = {
        type: 'tool-call',
        name: 'Diff',
        callId: named ? 'a' : undefined,
        input: { path: 'a.ts' },
        state: 'completed'
      }
      const result: NativeChatBlock = {
        type: 'tool-result',
        callId: named ? 'a' : undefined,
        output: '@@ -1 +1 @@\n-old\n+new'
      }
      const original = message('separated', [call, prose('Explanation.'), result])
      const slots = project([original])
      const technical = slots.find((slot) => slot.workRun)!
      const { blocks } = nativeChatWorkRunEntries(technical.workRun!)
      expect(pairToolBlocks(blocks)).toEqual([{ call, result }])
      expect(blocks[0]).toBe(call)
      expect(blocks[1]).toBe(result)
      expect(
        slots.flatMap((slot) => slot.workRun ?? [slot.message]).flatMap((row) => row.blocks)
      ).toHaveLength(original.blocks.length)
      expect(technical.sourceMessages).toEqual([original])
      expect(nativeChatSlotIndexOf(slots, 'separated')).toBe(0)
      expect(slots.at(-1)?.turnDiff?.files[0]?.target).toMatchObject({
        messageId: 'separated',
        editKey: 'Diff:0'
      })
      const onScrollMessageToTop = vi.fn()
      const revealContext = {
        ...context,
        onScrollMessageToTop,
        revealedDiff: { messageId: 'separated', editKey: 'Diff:0', fileIndex: 0, requestId: 1 }
      }
      const { unmount } = render(
        <>
          {slots.map((slot) => (
            <NativeChatTranscriptRow key={slot.message.id} slot={slot} context={revealContext} />
          ))}
        </>
      )
      expect(screen.getByText('Explanation.')).toBeVisible()
      expect(screen.getByText('new')).toBeVisible()
      expect(screen.getByText('old')).toBeVisible()
      expect(onScrollMessageToTop).toHaveBeenCalledTimes(1)
      expect(
        screen
          .getByRole('button', { name: 'Copy message' })
          .closest('[data-native-chat-message-id]')
      ).toHaveAttribute('data-native-chat-message-id', 'separated')
      unmount()
      render(
        <MessageRow
          message={original}
          expandSignal={false}
          revealedDiff={revealContext.revealedDiff}
          onScrollMessageToTop={onScrollMessageToTop}
        />
      )
      expect(screen.getByText('new')).toBeVisible()
      expect(screen.getByText('Explanation.')).toBeVisible()
      expect(onScrollMessageToTop).toHaveBeenCalledTimes(2)
    }
  )

  it('pairs across a notice while preserving unmatched old results exactly once', () => {
    const [call, result] = command('a')
    const orphan: NativeChatBlock = {
      type: 'tool-result',
      callId: 'missing',
      output: 'orphan output'
    }
    const original = message('notice-pair', [
      call!,
      approval,
      prose('Explanation.'),
      result!,
      orphan
    ])
    const slots = project([original])
    const allBlocks = slots
      .flatMap((slot) => slot.workRun ?? [slot.message])
      .flatMap((row) => row.blocks)
    expect(allBlocks).toHaveLength(original.blocks.length)
    expect(new Set(allBlocks)).toEqual(new Set(original.blocks))
    expect(pairToolBlocks(nativeChatWorkRunEntries(slots[0]!.workRun!).blocks)).toEqual([
      { call, result }
    ])
    render(<Transcript messages={[original]} />)
    fireEvent.click(screen.getByRole('button', { name: 'a' }))
    expect(screen.getByRole('button', { name: 'Automatic approval granted' })).toBeVisible()
    expect(screen.getByText('Explanation.')).toBeVisible()
    expect(document.querySelector('[data-native-chat-tool-run-members]')?.textContent).toContain(
      'a'
    )
  })

  it('pins a diff reveal to its actual later tool slice while message jumps keep the first prose', () => {
    const edit: NativeChatBlock = {
      type: 'tool-call',
      name: 'Diff',
      callId: 'a',
      input: { path: 'a.ts' },
      state: 'completed'
    }
    const result: NativeChatBlock = {
      type: 'tool-result',
      callId: 'a',
      output: '@@ -1 +1 @@\n-old\n+new'
    }
    const original = message('later-edit', [
      prose('Intro.'),
      ...command('before'),
      prose('Middle.'),
      approval,
      edit,
      prose('Explanation.'),
      result
    ])
    const slots = project([original])
    const toolIndex = nativeChatSlotIndexOf(slots, 'later-edit', 'Diff:1')
    expect(nativeChatSlotIndexOf(slots, 'later-edit')).toBe(0)
    expect(toolIndex).toBeGreaterThan(0)
    expect(nativeChatSlotIndexOf(slots, 'later-edit', 'Diff:999')).toBe(-1)
    const slot = slots[toolIndex]!
    expect(pairToolBlocks(nativeChatWorkRunEntries(slot.workRun!).blocks)).toEqual([
      { call: edit, result }
    ])
    const onScrollMessageToTop = vi.fn()
    render(
      <NativeChatTranscriptRow
        slot={slot}
        context={{
          ...context,
          onScrollMessageToTop,
          revealedDiff: { messageId: 'later-edit', editKey: 'Diff:1', fileIndex: 0, requestId: 1 }
        }}
      />
    )
    expect(screen.getByText('new')).toBeVisible()
    expect(onScrollMessageToTop).toHaveBeenCalledTimes(1)
  })

  it('projects one intra-message technical run between visible intro and outro', () => {
    const original = message('mixed', [
      prose('Intro.'),
      ...command('a'),
      approval,
      ...command('b'),
      prose('Outro.')
    ])
    const slots = project([original])
    expect(slots.filter((slot) => slot.workRun)).toHaveLength(1)
    expect(slots[0]?.workRun).toHaveLength(3)
    expect(
      slots.flatMap((slot) => slot.workRun ?? [slot.message]).flatMap((row) => row.blocks)
    ).toEqual(original.blocks)
    render(<Transcript messages={[original]} />)
    expect(screen.getByText('Intro.')).toBeVisible()
    expect(screen.getByText('Outro.')).toBeVisible()
    const toggle = screen.getByRole('button', { name: /Ran 2 commands/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(document.querySelectorAll('[data-native-chat-tool-run-state]')).toHaveLength(1)
    fireEvent.click(toggle)
    const members = document.querySelector('[data-native-chat-tool-run-members]')!
    const labels = Array.from(members.querySelectorAll('button'), (button) => button.textContent)
    expect(labels).toEqual(['shell Ran a', 'Automatic approval granted', 'shell Ran b'])
  })

  it('joins adjacent technical messages without crossing visible prose or changing the mobile default', () => {
    const original = message('mixed', [prose('Intro.'), ...command('a'), approval, ...command('b')])
    const adjacent = message('next', command('c'))
    const ending = message('answer', [prose('Outro.')])
    const slots = project([original, adjacent, ending])
    expect(slots).toHaveLength(2)
    expect(slots[0]?.workRun).toHaveLength(4)
    expect(slots[0]?.sourceMessages).toEqual([original, adjacent])
    expect(nativeChatSlotIndexOf(slots, 'next')).toBe(0)
    expect(slots[1]?.message).toBe(ending)
    expect(project([original, adjacent, ending], false).map((slot) => slot.message)).toEqual([
      original,
      adjacent,
      ending
    ])
  })

  it('retains standalone expansion when the same streaming message gains notices and prose', () => {
    const first = message('stream', command('a'))
    const props = { expandSignal: false, onScrollMessageToTop: () => {} }
    const { rerender } = render(<MessageRow {...props} message={first} />)
    const toggle = screen.getByRole('button', { name: 'a' })
    fireEvent.click(toggle)
    const growing = message('stream', [
      ...first.blocks,
      approval,
      ...command('b'),
      prose('Answer.')
    ])
    rerender(<MessageRow {...props} message={growing} />)
    expect(screen.getByRole('button', { name: /Ran 2 commands/ })).toBe(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Answer.')).toBeVisible()
    fireEvent.click(toggle)
    rerender(
      <MessageRow {...props} message={message('stream', [...growing.blocks, prose('More.')])} />
    )
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('restores projected expansion and scroll after slicing and a virtual remount', () => {
    const first = message('stream', command('a'))
    const { rerender } = render(<Transcript messages={[first]} />)
    const toggle = screen.getByRole('button', { name: 'a' })
    fireEvent.click(toggle)
    const scroller = document.querySelector<HTMLElement>('[data-native-chat-tool-run-members]')!
    Object.defineProperties(scroller, {
      scrollHeight: { value: 900 },
      clientHeight: { value: 200 }
    })
    scroller.scrollTop = 120
    fireEvent.scroll(scroller)
    const growing = message('stream', [
      ...first.blocks,
      approval,
      ...command('b'),
      prose('Answer.')
    ])
    rerender(<Transcript messages={[growing]} />)
    expect(screen.getByRole('button', { name: /Ran 2 commands/ })).toBe(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    rerender(<Transcript messages={[]} visible={false} />)
    rerender(<Transcript messages={[growing]} />)
    expect(screen.getByRole('button', { name: /Ran 2 commands/ })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    expect(document.querySelector('[data-native-chat-tool-run-members]')?.scrollTop).toBe(120)
  })

  it('keeps final prose copy controls before a visible error and context boundary', () => {
    const original = message('ending-notice', [
      ...command('a'),
      prose('Final answer.'),
      { type: 'text', text: 'Action required.', tone: 'error' },
      { type: 'text', text: 'Context cleared.', presentation: 'context-cleared' }
    ])
    render(<Transcript messages={[original]} />)
    expect(screen.getByText('Final answer.')).toBeVisible()
    expect(screen.getByText('Action required.')).toBeVisible()
    expect(screen.getByText('Context cleared')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Copy message' }).closest('[data-native-chat-message-id]')
    ).toHaveAttribute('data-native-chat-message-id', 'ending-notice')
  })
})
