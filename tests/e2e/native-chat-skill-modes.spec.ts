import { writeFileSync } from 'node:fs'
import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import type { SkillDiscoveryResult } from '../../src/shared/skills'

test.use({ orcaAppExtraEnv: { ORCA_BACKGROUND_LAUNCH: '1' } })

test('skill modes insert via click and keyboard without sending or losing the draft suffix', async ({
  orcaPage: page,
  electronApp
}, testInfo) => {
  await waitForSessionReady(page)
  const discovery: SkillDiscoveryResult = {
    scannedAt: Date.now(),
    sources: [
      {
        id: 'fixture',
        label: 'Fixture skills',
        path: '/fixture/skills',
        sourceKind: 'home',
        providers: ['codex'],
        owner: 'codex',
        exists: true
      }
    ],
    skills: [
      {
        id: 'fixture-smart-execution',
        name: 'smart-execution',
        description: 'Execute an agreed task.',
        promptModes: [
          { value: 'native', description: 'Use native workers.' },
          { value: 'orca', description: 'Use Orca workers.' }
        ],
        providers: ['codex'],
        sourceKind: 'home',
        sourceLabel: 'Fixture skills',
        rootPath: '/fixture/skills',
        directoryPath: '/fixture/skills/smart-execution',
        skillFilePath: '/fixture/skills/smart-execution/SKILL.md',
        installed: true,
        updatedAt: null
      }
    ]
  }
  await electronApp.evaluate(({ ipcMain }, discovery) => {
    if (!('_invokeHandlers' in ipcMain) || !(ipcMain._invokeHandlers instanceof Map)) {
      throw new Error('Missing Electron invoke registry')
    }
    let submissions = 0
    ipcMain.handle('test:skill-mode-submissions', () => submissions)
    for (const channel of ['runtime:call', 'runtimeEnvironments:call']) {
      const original = ipcMain._invokeHandlers.get(channel)
      if (typeof original !== 'function') {
        throw new Error(`Missing ${channel}`)
      }
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, (event, args: { method: string; params?: unknown }) => {
        if (args.method === 'skills.discover') {
          return { ok: true, result: discovery }
        }
        if (args.method === 'agentSession.createSupport') {
          return { ok: true, result: { supported: true } }
        }
        if (args.method === 'agentSession.create' || args.method === 'agentSession.send') {
          if (
            args.method === 'agentSession.send' ||
            (args.params && typeof args.params === 'object' && 'firstMessage' in args.params)
          ) {
            submissions++
          }
          return {
            ok: false,
            error: {
              code: 'structured_agent_session_unsupported',
              message: 'Test host does not start providers'
            }
          }
        }
        return original(event, args)
      })
    }
  }, discovery)
  await page.evaluate(async () => {
    await window.__store!.getState().updateSettings({ experimentalNativeChat: true })
  })
  await page.getByRole('button', { name: 'New tab', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Start a chat with Codex', exact: true }).click()
  const chat = page.locator('[data-native-chat-root="true"]')
  const composer = chat.getByRole('textbox')
  await expect(composer).toBeEditable()
  await composer.fill('$smart-execution ')
  const modes = page.getByRole('listbox')
  await expect(page.getByText('Skill modes', { exact: true })).toBeVisible()
  await modes.getByRole('option', { name: /native/ }).click()
  await expect(composer).toContainText('$smart-execution native ')

  await composer.fill('$smart-execution keep this suffix')
  await composer.press('Home')
  for (let index = 0; index < '$smart-execution '.length; index++) {
    await composer.press('ArrowRight')
  }
  await expect(page.getByText('Skill modes', { exact: true })).toBeVisible()
  await composer.press('ArrowDown')
  await composer.press('Enter')
  await expect(composer).toContainText('$smart-execution orca keep this suffix')
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )

  await composer.fill('$smart-execution ')
  await expect(page.getByText('Skill modes', { exact: true })).toBeVisible()
  await page.mouse.move(0, 0)
  await expect(page.getByRole('tooltip')).not.toBeVisible()
  await composer.press('Escape')
  await expect(page.getByText('Skill modes', { exact: true })).not.toBeVisible()
  await page.keyboard.type('continue writing')
  await expect(composer).toContainText('$smart-execution continue writing')

  await composer.fill('$smart-exec')
  await modes.getByRole('option', { name: /smart-execution/ }).click()
  await expect(page.getByText('Skill modes', { exact: true })).toBeVisible()
  const cdp = await page.context().newCDPSession(page)
  const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(testInfo.outputPath('skill-modes.png'), Buffer.from(screenshot.data, 'base64'))
  await cdp.detach()
  expect(
    await electronApp.evaluate(({ ipcMain }) => {
      if (!('_invokeHandlers' in ipcMain) || !(ipcMain._invokeHandlers instanceof Map)) {
        throw new Error('Missing invoke registry')
      }
      return ipcMain._invokeHandlers.get('test:skill-mode-submissions')()
    })
  ).toBe(0)
  expect(
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some((window) => window.isVisible())
    )
  ).toBe(false)
})
