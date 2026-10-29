// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../shared/constants'
import { useAppStore } from '../store'

const mocks = vi.hoisted(() => ({
  applyDocumentTheme: vi.fn(),
  buildAppFontFamily: vi.fn((fontFamily: string | null | undefined) => fontFamily ?? '')
}))

vi.mock('../lib/document-theme', () => ({
  applyDocumentTheme: mocks.applyDocumentTheme
}))

vi.mock('@/lib/app-font-family', () => ({
  buildAppFontFamily: mocks.buildAppFontFamily
}))

vi.mock('../runtime/sync-runtime-graph', () => ({
  scheduleRuntimeGraphSync: vi.fn()
}))

import { useDocumentAppearance } from './use-document-appearance'
import { useDocumentColors } from './use-document-colors'
import { appearanceAccentTokens } from '../lib/appearance-colors'

const initialState = useAppStore.getState()

describe('useDocumentAppearance', () => {
  beforeEach(() => {
    mocks.applyDocumentTheme.mockReset()
    mocks.buildAppFontFamily.mockClear()
    useAppStore.setState({
      settings: {
        ...getDefaultSettings('/tmp'),
        theme: 'dark'
      }
    })
  })

  afterEach(() => {
    useAppStore.setState(initialState, true)
    document.documentElement.removeAttribute('style')
    document.documentElement.removeAttribute('class')
    document.documentElement.removeAttribute('data-custom-tab-bar')
  })

  it('ignores unrelated settings object replacements', () => {
    const { unmount } = renderHook(() => useDocumentAppearance())

    expect(mocks.applyDocumentTheme).toHaveBeenCalledTimes(1)
    expect(mocks.buildAppFontFamily).toHaveBeenCalledTimes(1)

    act(() => {
      const settings = useAppStore.getState().settings!
      useAppStore.setState({
        settings: { ...settings, editorAutoSave: !settings.editorAutoSave }
      })
    })

    expect(mocks.applyDocumentTheme).toHaveBeenCalledTimes(1)
    expect(mocks.buildAppFontFamily).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('still applies changed theme and font values', () => {
    const { unmount } = renderHook(() => useDocumentAppearance())

    act(() => {
      const settings = useAppStore.getState().settings!
      useAppStore.setState({
        settings: { ...settings, theme: 'light', appFontFamily: 'Monaco' }
      })
    })

    expect(mocks.applyDocumentTheme).toHaveBeenLastCalledWith('light')
    expect(mocks.applyDocumentTheme).toHaveBeenCalledTimes(2)
    expect(mocks.buildAppFontFamily).toHaveBeenLastCalledWith('Monaco')
    expect(mocks.buildAppFontFamily).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('applies auxiliary window colors and live theme contrast without owning theme or font', async () => {
    const root = document.documentElement
    const { unmount } = renderHook(() => useDocumentColors())

    act(() => {
      const settings = useAppStore.getState().settings!
      useAppStore.setState({
        settings: {
          ...settings,
          theme: 'system',
          appFontFamily: 'Monaco',
          tabBarBackground: '#123456',
          accentColor: '#ff0000'
        }
      })
    })
    expect(root.style.getPropertyValue('--tab-bar-background')).toBe('#123456')
    expect(root.style.getPropertyValue('--chat-link')).toBe(
      appearanceAccentTokens('#ff0000', '#ffffff')['--chat-link']
    )

    root.classList.add('dark')
    await waitFor(() => {
      expect(root.style.getPropertyValue('--chat-link')).toBe(
        appearanceAccentTokens('#ff0000', '#0a0a0a')['--chat-link']
      )
    })
    expect(mocks.applyDocumentTheme).not.toHaveBeenCalled()
    expect(mocks.buildAppFontFamily).not.toHaveBeenCalled()

    act(() => {
      useAppStore.setState({ settings: getDefaultSettings('/tmp') })
    })
    expect(root.style.getPropertyValue('--tab-bar-background')).toBe('')
    expect(root.style.getPropertyValue('--chat-link')).toBe('')
    expect(root.hasAttribute('data-custom-tab-bar')).toBe(false)
    unmount()
  })
})
