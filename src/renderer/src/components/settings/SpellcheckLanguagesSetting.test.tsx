// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpellcheckCapabilities } from '../../../../shared/spellcheck-languages'
import type { GlobalSettings } from '../../../../shared/global-settings-types'

const { save } = vi.hoisted(() => ({
  save: vi.fn<(updates: Partial<GlobalSettings>) => Promise<void>>()
}))
vi.mock('../../store', () => ({
  useAppStore: (
    selector: (state: {
      settingsSearchQuery: string
      updateSettingsOrThrow: typeof save
    }) => unknown
  ) => selector({ settingsSearchQuery: '', updateSettingsOrThrow: save })
}))

import { SpellcheckLanguagesSetting } from './SpellcheckLanguagesSetting'

let root: Root | null = null
let container: HTMLDivElement | null = null
const capabilities: SpellcheckCapabilities = {
  managedBy: 'app',
  availableLanguages: ['en-GB', 'hu', 'de'],
  enabledLanguages: ['en-GB']
}

beforeEach(() => {
  save.mockReset().mockResolvedValue(undefined)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  )
  vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {})
  Object.assign(window, {
    api: { settings: { getSpellcheckCapabilities: vi.fn().mockResolvedValue(capabilities) } }
  })
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function openPicker(): Promise<void> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root?.render(<SpellcheckLanguagesSetting settings={{}} />))
  const trigger = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Spellcheck Languages"]'
  )
  expect(trigger).not.toBeNull()
  await act(async () => trigger?.click())
}

function option(name: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) =>
    item.textContent?.includes(name)
  )
}

describe('SpellcheckLanguagesSetting', () => {
  it('shows rejected saves, preserves English plus Hungarian, and retries the same selection', async () => {
    save.mockRejectedValueOnce(new Error('disk unavailable'))
    await openPicker()
    await act(async () => option('Hungarian')?.click())
    expect(save).toHaveBeenCalledWith({ spellcheckLanguages: ['en-GB', 'hu'] })
    expect(option('Hungarian')?.getAttribute('aria-checked')).toBe('true')
    expect(option('English')?.getAttribute('aria-checked')).toBe('true')
    expect(container?.querySelector('[role="alert"]')?.textContent).toContain('Could not save')
    const retry = [...(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
      (button) => button.textContent === 'Retry'
    )
    await act(async () => retry?.click())
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith({ spellcheckLanguages: ['en-GB', 'hu'] })
    expect(container?.querySelector('[role="alert"]')).toBeNull()
  })

  it('disables a second choice while a delayed save is pending', async () => {
    let finish: () => void = () => {}
    save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    await openPicker()
    await act(async () => option('Hungarian')?.click())
    expect(option('German')?.getAttribute('aria-disabled')).toBe('true')
    expect(option('Hungarian')?.getAttribute('aria-checked')).toBe('true')
    expect(option('English')?.getAttribute('aria-checked')).toBe('true')
    await act(async () => option('German')?.click())
    expect(save).toHaveBeenCalledTimes(1)
    await act(async () => finish())
    expect(option('German')?.getAttribute('aria-disabled')).not.toBe('true')
  })

  it('does not allow removing the last selected language', async () => {
    await openPicker()
    expect(option('English')?.getAttribute('aria-disabled')).toBe('true')
    await act(async () => option('English')?.click())
    expect(save).not.toHaveBeenCalled()
  })
})
