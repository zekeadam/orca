// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '../ui/tooltip'
import { NativeChatPromptPresets } from './NativeChatPromptPresets'

const state = vi.hoisted(() => ({
  settings: {
    nativeChatPromptPresets: [
      { name: 'Review', prompt: 'Review the current changes.' },
      { name: 'Plan 2', prompt: 'Create two options.' },
      { name: 'Empty', prompt: '' },
      { name: 'Continue', prompt: 'Continue the task.' }
    ]
  },
  openSettingsTarget: vi.fn(),
  openSettingsPage: vi.fn()
}))
vi.mock('@/store', () => {
  const useAppStore = (selector: (value: typeof state) => unknown): unknown => selector(state)
  useAppStore.getState = () => state
  return { useAppStore }
})
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))

function harness(overrides: Partial<React.ComponentProps<typeof NativeChatPromptPresets>> = {}) {
  const props = {
    enabled: true,
    disabled: false,
    ownerKey: 'chat-a',
    onSend: vi.fn(),
    onInsert: vi.fn(),
    onFocus: vi.fn(),
    ...overrides
  }
  const view = (current = props) => (
    <TooltipProvider>
      <div data-native-chat-root="true">
        <button data-testid="chat-focus">Chat</button>
        <NativeChatPromptPresets {...current} />
      </div>
    </TooltipProvider>
  )
  const rendered = render(view())
  const open = (): void => {
    fireEvent.keyDown(screen.getByTestId('chat-focus'), { key: 'e', code: 'KeyE', altKey: true })
  }
  return { ...rendered, props, open, view, input: () => screen.getByRole('combobox') }
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('chat prompt preset picker', () => {
  it('sends the physical number slot immediately, preserving empty slot numbering', () => {
    const { props, open, input } = harness()
    open()
    expect(document.activeElement).toBe(input())
    fireEvent.keyDown(input(), { key: '4', code: 'Digit4' })
    expect(props.onSend).toHaveBeenCalledExactlyOnceWith('Continue the task.')
    expect(props.onInsert).not.toHaveBeenCalled()
  })

  it('inserts Shift+number on international keyboards without sending', async () => {
    const { props, open, input } = harness()
    open()
    fireEvent.keyDown(input(), { key: '@', code: 'Digit2', shiftKey: true })
    expect(props.onInsert).toHaveBeenCalledExactlyOnceWith('Create two options.')
    expect(props.onSend).not.toHaveBeenCalled()
    await waitFor(() => expect(props.onFocus).toHaveBeenCalledOnce())
  })

  it.each([false, true])(
    'typing enters search and Enter chooses its first result (insert=%s)',
    (shiftKey) => {
      const { props, open, input } = harness()
      open()
      fireEvent.change(input(), { target: { value: 'Plan' } })
      fireEvent.keyDown(input(), { key: '2', code: 'Digit2' })
      expect(props.onSend).not.toHaveBeenCalled()
      fireEvent.keyDown(input(), { key: 'Enter', code: 'Enter', shiftKey })
      expect(shiftKey ? props.onInsert : props.onSend).toHaveBeenCalledExactlyOnceWith(
        'Create two options.'
      )
      expect(shiftKey ? props.onSend : props.onInsert).not.toHaveBeenCalled()
    }
  )

  it('does not send while unavailable, composing, repeating or using another modifier', () => {
    const { props, open, input, rerender, view } = harness()
    open()
    fireEvent.keyDown(input(), { key: '1', code: 'Digit1', isComposing: true })
    fireEvent.keyDown(input(), { key: '1', code: 'Digit1', repeat: true })
    fireEvent.keyDown(input(), { key: 'Enter', code: 'Enter', ctrlKey: true })
    rerender(view({ ...props, disabled: true }))
    fireEvent.keyDown(input(), { key: '1', code: 'Digit1' })
    expect(props.onSend).not.toHaveBeenCalled()
    expect(props.onInsert).not.toHaveBeenCalled()
  })

  it('closes when chat identity or visibility changes', () => {
    const { props, open, rerender, view } = harness()
    open()
    rerender(view({ ...props, ownerKey: 'chat-b' }))
    expect(screen.queryByRole('combobox')).toBeNull()
    rerender(view({ ...props, enabled: false }))
    open()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(props.onSend).not.toHaveBeenCalled()
  })

  it('ignores shortcuts originating outside this chat', () => {
    const { props } = harness()
    fireEvent.keyDown(document.body, { key: 'e', code: 'KeyE', altKey: true })
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(props.onSend).not.toHaveBeenCalled()
  })

  it('opens Z Settings from the corner button without refocusing the chat', () => {
    const { props, open } = harness()
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Z Settings' }))
    expect(state.openSettingsPage).toHaveBeenCalledOnce()
    expect(state.openSettingsTarget).toHaveBeenCalledWith({
      pane: 'z-settings',
      repoId: null,
      sectionId: 'z-prompt-presets'
    })
    expect(props.onFocus).not.toHaveBeenCalled()
  })
})
