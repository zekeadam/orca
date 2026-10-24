// @vitest-environment happy-dom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { AppearanceColorSettings } from './AppearanceColorSettings'

vi.mock('../../store', () => ({
  useAppStore: (selector: (state: { settingsSearchQuery: string }) => unknown) =>
    selector({ settingsSearchQuery: '' })
}))
afterEach(cleanup)
it('keeps incomplete hex drafts, commits valid colors, and resets individual and all colors', () => {
  const persist = vi.fn()
  function Harness(): React.JSX.Element {
    const [settings, setSettings] = useState(getDefaultSettings('/tmp'))
    return (
      <AppearanceColorSettings
        settings={settings}
        updateSettings={(updates: Partial<GlobalSettings>) => {
          persist(updates)
          setSettings((current) => ({ ...current, ...updates }))
        }}
      />
    )
  }
  render(<Harness />)
  const field = screen.getByRole('textbox', { name: 'Tab background' })
  fireEvent.change(field, { target: { value: '#1' } })
  fireEvent.blur(field)
  expect(field.getAttribute('aria-invalid')).toBe('true')
  expect(persist).not.toHaveBeenCalled()
  fireEvent.change(field, { target: { value: '#ABC' } })
  fireEvent.keyDown(field, { key: 'Enter' })
  expect(persist).toHaveBeenLastCalledWith({ tabBackground: '#aabbcc' })
  fireEvent.click(screen.getByRole('button', { name: 'Reset Tab background' }))
  expect(persist).toHaveBeenLastCalledWith({ tabBackground: undefined })
  fireEvent.change(field, { target: { value: 'bad value' } })
  fireEvent.keyDown(field, { key: 'Escape' })
  expect(field.getAttribute('aria-invalid')).toBe('false')
  fireEvent.change(field, { target: { value: 'invalid draft' } })
  fireEvent.click(screen.getByRole('button', { name: 'Reset colors' }))
  expect(screen.getByRole('textbox', { name: 'Tab background' })).toHaveProperty('value', '')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(persist).toHaveBeenLastCalledWith({
    tabBarBackground: undefined,
    tabBackground: undefined,
    activeTabBackground: undefined,
    statusBarBackground: undefined,
    accentColor: undefined
  })
})
