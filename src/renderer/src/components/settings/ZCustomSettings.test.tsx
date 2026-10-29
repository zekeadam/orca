// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import type { KeybindingOverrides } from '../../../../shared/keybindings'
import { TooltipProvider } from '../ui/tooltip'
import { ZCustomSettings } from './ZCustomSettings'
import { ShortcutsPane } from './ShortcutsPane'

const state = vi.hoisted(() => ({
  settings: { spellcheckLanguages: ['hu', 'en-GB'] },
  settingsSearchQuery: '',
  keybindings: { 'app.quit': ['Alt+Q'] } satisfies KeybindingOverrides,
  keybindingSnapshot: null,
  activeWorktreeId: null,
  updateSettings: vi.fn(),
  updateSettingsOrThrow: vi.fn(),
  setKeybindingOverride: vi.fn(),
  resetKeybindingOverride: vi.fn(),
  disableKeybindingAction: vi.fn()
}))
vi.mock('../../store', () => ({
  useAppStore: (select: (value: typeof state) => unknown) => select(state)
}))
vi.mock('@/store/plugin-panels', () => ({ useEditablePluginCommands: () => [] }))

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  state.settings = { ...getDefaultSettings('/test-home'), spellcheckLanguages: ['hu', 'en-GB'] }
  state.settingsSearchQuery = ''
  vi.clearAllMocks()
  Object.assign(window, {
    api: {
      ui: { setShortcutRecorderFocused: vi.fn() },
      settings: {
        getSpellcheckCapabilities: vi.fn().mockResolvedValue({
          managedBy: 'app',
          availableLanguages: ['en-GB', 'hu'],
          enabledLanguages: ['en-GB']
        })
      }
    }
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

it('shows saved languages and only the custom shortcut, retaining its disable setter', async () => {
  await act(async () =>
    root.render(
      <TooltipProvider>
        <ZCustomSettings />
      </TooltipProvider>
    )
  )
  expect(container.textContent).toContain('Hungarian')
  expect(container.textContent).toContain('English')
  expect(container.textContent).toContain('Quit Orca')
  expect(container.textContent).not.toContain('Force Reload')
  expect(container.textContent).toContain('Alt')
  const disable = [...container.querySelectorAll('button')].find(
    (button) => button.getAttribute('aria-label') === 'Disable Quit Orca'
  )
  expect(disable).toBeDefined()
  await act(async () => disable?.click())
  expect(state.disableKeybindingAction).toHaveBeenCalledWith('app.quit')
  expect(state.updateSettingsOrThrow).not.toHaveBeenCalled()
})

it('removes Quit from the original shortcuts pane while retaining upstream shortcuts', async () => {
  await act(async () =>
    root.render(
      <TooltipProvider>
        <ShortcutsPane />
      </TooltipProvider>
    )
  )
  expect(container.textContent).not.toContain('Quit Orca')
  expect(container.textContent).toContain('Force Reload')
})

it('keeps the migrated language setting visible when searching Hungarian', async () => {
  state.settingsSearchQuery = 'Hungarian'
  await act(async () =>
    root.render(
      <TooltipProvider>
        <ZCustomSettings />
      </TooltipProvider>
    )
  )
  expect(container.textContent).toContain('Spellcheck Languages')
  expect(container.textContent).not.toContain('Quit Orca')
})
