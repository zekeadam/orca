import { test, expect } from './helpers/orca-app'
import path from 'node:path'
import { chmodSync, writeFileSync } from 'node:fs'
import { createChatOnHost } from './helpers/structured-claude-stub'
import { FAKE_AGENT_WINDOWS_SHELL } from './helpers/fake-agent-command-override'
import { quoteStartupArg } from '../../src/shared/tui-agent-startup-shell'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test('prompt presets insert by slot and search, preserve drafts, and open Z Settings', async ({
  orcaPage: page
}, testInfo) => {
  await waitForSessionReady(page)
  const worktreeId = await waitForActiveWorktree(page)
  const shell = process.platform === 'win32' ? 'powershell' : 'posix'
  const wrapper = testInfo.outputPath(process.platform === 'win32' ? 'claude.cmd' : 'claude')
  const stub = path.join(process.cwd(), 'tests/e2e/fixtures/structured-claude-stub.cjs')
  const launchLog = testInfo.outputPath('launches.jsonl')
  writeFileSync(
    wrapper,
    process.platform === 'win32'
      ? `@"${process.execPath}" "${stub}" "${launchLog}" %*\r\n`
      : `#!/bin/sh\nexec ${quoteStartupArg(process.execPath, shell)} ${quoteStartupArg(stub, shell)} ${quoteStartupArg(launchLog, shell)} "$@"\n`
  )
  chmodSync(wrapper, 0o755)
  const command = wrapper
  await page.evaluate(
    async ({ command, windowsShell }) => {
      await window.__store!.getState().updateSettings({
        experimentalNativeChat: true,
        terminalWindowsShell: windowsShell,
        agentCmdOverrides: { claude: command },
        nativeChatPromptPresets: [
          { name: 'Review', prompt: 'Review the current changes.' },
          { name: 'Plan 2', prompt: 'Plan the next two steps.' }
        ]
      })
    },
    { command, windowsShell: FAKE_AGENT_WINDOWS_SHELL }
  )
  const sessionId = await createChatOnHost(page, worktreeId)
  const tabId = await page.evaluate(
    ({ worktreeId, sessionId }) =>
      window
        .__store!.getState()
        .unifiedTabsByWorktree[worktreeId]?.find((tab) => tab.entityId === sessionId)?.id,
    { worktreeId, sessionId }
  )
  await page.locator(`[data-testid="sortable-tab"][data-tab-id="${tabId}"]`).click()
  const chat = page.locator('[data-native-chat-root="true"]')
  const composer = chat.getByRole('textbox')
  await expect(composer).toBeEditable()
  await composer.fill('Keep this draft. ')
  await page.keyboard.press('Alt+KeyE')
  const picker = page.getByRole('dialog', { name: 'Prompt presets' })
  await expect(picker).toBeVisible()
  await expect(picker.getByRole('combobox')).toBeFocused()
  await picker.screenshot({ path: testInfo.outputPath('prompt-picker.png') })
  await page.keyboard.press('Shift+Digit2')
  await expect(picker).not.toBeVisible()
  await expect(composer).toContainText('Keep this draft.')
  await expect(composer).toContainText('Plan the next two steps.')

  await composer.click()
  await page.keyboard.press('Alt+KeyE')
  const search = picker.getByRole('combobox')
  await search.fill('Plan ')
  await page.keyboard.press('Digit2')
  await expect(search).toHaveValue('Plan 2')
  await expect(picker).toBeVisible()
  await page.keyboard.press('Shift+Enter')
  await expect(picker).not.toBeVisible()
  await expect(composer).toContainText('Keep this draft.')

  await composer.click()
  await page.keyboard.press('Alt+KeyE')
  await page.keyboard.press('Digit1')
  await expect(chat.getByText('Stub reply.', { exact: true })).toHaveCount(1)
  await expect(chat.getByText('Review the current changes.', { exact: true })).toBeVisible()
  await expect(composer).toContainText('Keep this draft.')

  await composer.click()
  await page.keyboard.press('Alt+KeyE')
  await picker.getByRole('combobox').fill('Plan 2')
  await page.keyboard.press('Enter')
  await expect(chat.getByText('Stub reply.', { exact: true })).toHaveCount(2)
  await expect(composer).toContainText('Keep this draft.')

  await composer.click()
  await page.keyboard.press('Alt+KeyE')
  await picker.getByRole('button', { name: 'Z Settings', exact: true }).click()
  await expect(page.getByLabel('Preset 1 name', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Preset 1 name', { exact: true })).toHaveValue('Review')
  await expect(page.getByLabel('Preset 1 prompt', { exact: true })).toHaveValue(
    'Review the current changes.'
  )
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await page.screenshot({ path: testInfo.outputPath('z-settings.png') })
  await page.getByLabel('Preset 1 name', { exact: true }).fill('Inspect')
  await page.getByLabel('Preset 1 prompt', { exact: true }).fill('Inspect the updated changes.')
  await page.getByLabel('Preset 1 name', { exact: true }).focus()
  await page.evaluate(() => window.__store!.getState().closeSettingsPage())
  await composer.click()
  await page.keyboard.press('Alt+KeyE')
  await expect(picker.getByRole('option', { name: /Inspect/ })).toBeVisible()
})
