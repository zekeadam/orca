// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ZSettingsPane } from './ZSettingsPane'
import type { NativeChatPromptPreset } from '../../../../shared/native-chat-prompt-presets'

const state = vi.hoisted(() => ({
  settings: { nativeChatPromptPresets: [{ name: '', prompt: '' }] },
  updateSettings:
    vi.fn<(updates: { nativeChatPromptPresets: NativeChatPromptPreset[] }) => Promise<void>>()
}))
vi.mock('@/store', () => {
  const useAppStore = (selector: (value: typeof state) => unknown): unknown => selector(state)
  useAppStore.getState = () => state
  return { useAppStore }
})
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: { number: number }) =>
    fallback.replace('{{number}}', String(values?.number))
}))
vi.mock('./ZCustomSettings', () => ({ ZCustomSettings: () => null }))

beforeEach(() => {
  state.settings.nativeChatPromptPresets = []
  state.updateSettings.mockImplementation(async (updates) => {
    state.settings = updates
  })
})
afterEach(async () => {
  cleanup()
  await act(async () => {})
  vi.clearAllMocks()
})

it('flushes both fields immediately on window close even when an earlier write is pending', async () => {
  const writes: (() => void)[] = []
  state.updateSettings.mockImplementation(
    (updates) =>
      new Promise<void>((resolve) => {
        writes.push(() => {
          state.settings = updates
          resolve()
        })
      })
  )
  render(<ZSettingsPane />)
  fireEvent.change(screen.getByLabelText('Preset 1 name'), { target: { value: 'Review' } })
  fireEvent.blur(screen.getByLabelText('Preset 1 name'))
  fireEvent.change(screen.getByLabelText('Preset 1 prompt'), {
    target: { value: 'Review the current changes.' }
  })
  act(() => window.dispatchEvent(new Event('beforeunload')))
  expect(state.updateSettings).toHaveBeenCalledTimes(2)
  expect(state.updateSettings).toHaveBeenLastCalledWith({
    nativeChatPromptPresets: [{ name: 'Review', prompt: 'Review the current changes.' }]
  })
  await act(async () => {
    for (const finish of writes) {
      finish()
    }
  })
})

it('saves an edited prompt when settings unmount before the debounce', async () => {
  const view = render(<ZSettingsPane />)
  fireEvent.change(screen.getByLabelText('Preset 1 prompt'), {
    target: { value: 'Continue this task.' }
  })
  view.unmount()
  await act(async () => {})
  expect(state.settings.nativeChatPromptPresets).toEqual([
    { name: '', prompt: 'Continue this task.' }
  ])
  render(<ZSettingsPane />)
  expect(screen.getByLabelText<HTMLTextAreaElement>('Preset 1 prompt').value).toBe(
    'Continue this task.'
  )
})
