import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { waitForActivePaneHookDescriptor, waitForActiveTerminalManager } from './helpers/terminal'
import {
  claudeTranscriptLines,
  enableNativeChatSetting,
  seedClaudeProviderSession,
  toggleTerminalTabToChatView
} from './helpers/native-chat-transcript-fixture'

const CUSTOM_COLORS = [
  ['Tab bar background', '#808080'],
  ['Tab background', '#ffffff'],
  ['Active tab background', '#204060'],
  ['Status bar background', '#bbccee'],
  ['Accent color', '#ffff00']
] as const

test('default appearance keeps both themes usable', async ({ orcaPage, electronApp }, testInfo) => {
  await waitForSessionReady(orcaPage)
  await orcaPage.evaluate(async () => {
    const state = window.__store!.getState()
    await state.updateSettings({ uiLanguage: 'en', theme: 'dark' })
    state.openSettingsTarget({ pane: 'appearance', repoId: null })
    state.openSettingsPage()
  })
  await expect(orcaPage.getByRole('heading', { name: 'Appearance', exact: true })).toBeVisible()
  await expect(orcaPage.locator('html')).toHaveClass(/dark/)
  await orcaPage.screenshot({ path: testInfo.outputPath('default-dark.png') })
  await orcaPage
    .getByRole('radiogroup', { name: 'Theme', exact: true })
    .getByRole('radio', { name: 'Light', exact: true })
    .click()
  await expect(orcaPage.locator('html')).not.toHaveClass(/dark/)
  await orcaPage.screenshot({ path: testInfo.outputPath('default-light.png') })
  await orcaPage
    .getByRole('radiogroup', { name: 'Theme', exact: true })
    .getByRole('radio', { name: 'System', exact: true })
    .click()
  await orcaPage.emulateMedia({ colorScheme: 'dark' })
  await expect(orcaPage.locator('html')).toHaveClass(/dark/)
  await orcaPage.emulateMedia({ colorScheme: 'light' })
  await expect(orcaPage.locator('html')).not.toHaveClass(/dark/)
  await orcaPage.getByPlaceholder('Search settings').fill('accent color')
  await expect(orcaPage.getByRole('textbox', { name: 'Accent color', exact: true })).toBeVisible()
  expect(
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((window) => !window.isVisible())
    )
  ).toBe(true)
})

test('chat accent links stay readable on app and matched terminal canvases', async ({
  orcaPage,
  testRepoPath
}) => {
  await waitForSessionReady(orcaPage)
  await waitForActiveWorktree(orcaPage)
  await ensureTerminalVisible(orcaPage)
  await waitForActiveTerminalManager(orcaPage)
  const descriptor = await waitForActivePaneHookDescriptor(orcaPage)
  const sessionId = 'appearance-accent-fixture'
  const transcriptPath = path.join(testRepoPath, `${sessionId}.jsonl`)
  writeFileSync(
    transcriptPath,
    claudeTranscriptLines({
      sessionId,
      userText: 'Show the appearance reference.',
      assistantText: '[Appearance reference](https://example.com/appearance)'
    })
  )
  await enableNativeChatSetting(orcaPage)
  await seedClaudeProviderSession(orcaPage, { ...descriptor, sessionId, transcriptPath })
  const [tabId] = descriptor.paneKey.split(':')
  await toggleTerminalTabToChatView(orcaPage, { tabId, worktreeId: descriptor.worktreeId })
  const link = orcaPage
    .locator('[data-native-chat-root="true"]')
    .getByRole('link', { name: 'Appearance reference', exact: true })
  await expect(link).toBeVisible({ timeout: 30_000 })
  for (const matching of [false, true]) {
    for (const theme of ['light', 'dark'] as const) {
      await orcaPage.evaluate(
        async ({ matching, theme }) => {
          await window.__store!.getState().updateSettings({
            theme,
            accentColor: theme === 'light' ? '#ffffff' : '#000000',
            nativeChatAppearance: { matchTerminalInterface: matching },
            terminalColorOverrides: {
              background: theme === 'light' ? '#ffffff' : '#000000',
              foreground: theme === 'light' ? '#000000' : '#ffffff'
            }
          })
        },
        { matching, theme }
      )
      await expect
        .poll(() =>
          link.evaluate((element) => {
            const root = element.closest('.native-chat-appearance')
            if (!root) {
              throw new Error('Missing native chat appearance root')
            }
            const canvas = document.createElement('canvas')
            canvas.width = 1
            canvas.height = 1
            const context = canvas.getContext('2d')
            if (!context) {
              throw new Error('Missing color conversion context')
            }
            const luminance = (color: string): number => {
              context.clearRect(0, 0, 1, 1)
              context.fillStyle = color
              context.fillRect(0, 0, 1, 1)
              const channels = Array.from(context.getImageData(0, 0, 1, 1).data)
                .slice(0, 3)
                .map((value) => {
                  const channel = value / 255
                  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
                })
              return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
            }
            const foreground = luminance(getComputedStyle(element).color)
            const background = luminance(getComputedStyle(root).backgroundColor)
            return (
              (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
            )
          })
        )
        .toBeGreaterThanOrEqual(4.5)
    }
  }
})

test('custom colors survive reload, update chrome and reset in both themes', async ({
  orcaPage
}, testInfo) => {
  await waitForSessionReady(orcaPage)
  await waitForActiveWorktree(orcaPage)
  await ensureTerminalVisible(orcaPage)
  await orcaPage.evaluate(async () => {
    const state = window.__store!.getState()
    await state.updateSettings({ uiLanguage: 'en', theme: 'dark' })
    const worktreeId = state.activeWorktreeId
    if (!worktreeId) {
      throw new Error('Missing active test workspace')
    }
    state.createTab(worktreeId, undefined, undefined, { activate: false })
    state.openSettingsTarget({ pane: 'appearance', repoId: null })
    state.openSettingsPage()
  })

  for (const [label, color] of CUSTOM_COLORS) {
    const field = orcaPage.getByRole('textbox', { name: label, exact: true })
    await field.fill(color)
    await field.press('Tab')
    await expect(field).toHaveValue(color)
  }
  await orcaPage
    .getByRole('textbox', { name: 'Tab bar background', exact: true })
    .scrollIntoViewIfNeeded()
  await orcaPage.screenshot({ path: testInfo.outputPath('custom-settings-dark.png') })

  await orcaPage.reload()
  await waitForSessionReady(orcaPage)
  await orcaPage.evaluate(() => {
    const state = window.__store!.getState()
    state.openSettingsTarget({ pane: 'appearance', repoId: null })
    state.openSettingsPage()
  })
  for (const [label, color] of CUSTOM_COLORS) {
    await expect(orcaPage.getByRole('textbox', { name: label, exact: true })).toHaveValue(color)
  }

  for (const theme of ['Dark', 'Light'] as const) {
    await orcaPage
      .getByRole('radiogroup', { name: 'Theme', exact: true })
      .getByRole('radio', { name: theme, exact: true })
      .click()
    await orcaPage.getByRole('button', { name: 'Back to app', exact: true }).click()
    await expect(orcaPage.locator('[data-appearance-surface="tab-bar"]').first()).toHaveCSS(
      'background-color',
      'rgb(128, 128, 128)'
    )
    await expect(orcaPage.locator('[data-appearance-surface="status-bar"]')).toHaveCSS(
      'background-color',
      'rgb(187, 204, 238)'
    )
    await expect(orcaPage.locator('[data-tab-id][data-active="true"]').first()).toHaveCSS(
      'background-color',
      'rgb(32, 64, 96)'
    )
    await expect(orcaPage.locator('[data-tab-id][data-active="false"]').first()).toHaveCSS(
      'background-color',
      'rgb(255, 255, 255)'
    )
    const inactiveTab = orcaPage.locator('[data-tab-id][data-active="false"]').first()
    await inactiveTab.hover()
    await expect(inactiveTab).toHaveCSS('color', 'rgb(0, 0, 0)')
    await expect(inactiveTab.getByRole('button', { name: /^Close tab / })).toHaveCSS(
      'color',
      'rgb(0, 0, 0)'
    )
    await orcaPage.screenshot({
      path: testInfo.outputPath(`custom-chrome-${theme.toLowerCase()}.png`)
    })
    await orcaPage.evaluate(() => {
      const state = window.__store!.getState()
      state.openSettingsTarget({ pane: 'appearance', repoId: null })
      state.openSettingsPage()
    })
  }

  await orcaPage.getByRole('button', { name: 'Reset colors', exact: true }).click()
  for (const [label] of CUSTOM_COLORS) {
    await expect(orcaPage.getByRole('textbox', { name: label, exact: true })).toHaveValue('')
  }
  await expect(orcaPage.locator('html')).not.toHaveAttribute('data-custom-tab-bar')
  await expect(orcaPage.locator('html')).not.toHaveAttribute('data-custom-status-bar')

  await orcaPage
    .getByRole('radiogroup', { name: 'Theme', exact: true })
    .getByRole('radio', { name: 'Dark', exact: true })
    .click()
  const barField = orcaPage.getByRole('textbox', { name: 'Tab bar background', exact: true })
  await barField.fill('#ffffff')
  await barField.press('Tab')
  await orcaPage.getByRole('button', { name: 'Back to app', exact: true }).click()
  const defaultTab = orcaPage.locator('[data-tab-id][data-active="false"]').first()
  await expect(defaultTab).toHaveCSS('background-color', 'rgb(23, 23, 23)')
  await defaultTab.hover()
  await expect(defaultTab.getByRole('button', { name: /^Close tab / })).not.toHaveCSS(
    'color',
    'rgb(0, 0, 0)'
  )
  const activeDefaultTab = orcaPage.locator('[data-tab-id][data-active="true"]').first()
  await expect(activeDefaultTab.getByRole('button', { name: /^Close tab / })).not.toHaveCSS(
    'color',
    'rgb(0, 0, 0)'
  )
  await orcaPage.evaluate(() => {
    const state = window.__store!.getState()
    state.openSettingsTarget({ pane: 'appearance', repoId: null })
    state.openSettingsPage()
  })
  const activeField = orcaPage.getByRole('textbox', { name: 'Active tab background', exact: true })
  await activeField.fill('#ffffff')
  await activeField.press('Tab')
  await orcaPage.getByRole('button', { name: 'Back to app', exact: true }).click()
  const inactiveDefaultTab = orcaPage.locator('[data-tab-id][data-active="false"]').first()
  await inactiveDefaultTab.hover()
  await expect(inactiveDefaultTab).not.toHaveCSS('color', 'rgb(0, 0, 0)')
})
