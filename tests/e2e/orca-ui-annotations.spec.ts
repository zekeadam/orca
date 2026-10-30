import { writeFileSync } from 'node:fs'
import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'

test.use({ orcaAppExtraEnv: { ORCA_BACKGROUND_LAUNCH: '1' } })

test('UI annotations queue notes and preserve them when the chat host refuses delivery', async ({
  orcaPage: page,
  electronApp
}, testInfo) => {
  await waitForSessionReady(page)
  await electronApp.evaluate(({ ipcMain }) => {
    if (!('_invokeHandlers' in ipcMain) || !(ipcMain._invokeHandlers instanceof Map)) {
      throw new Error('Missing Electron invoke registry')
    }
    let captured: unknown = null
    ipcMain.handle('test:annotation-request', () => captured)
    for (const channel of ['runtime:call', 'runtimeEnvironments:call']) {
      const original = ipcMain._invokeHandlers.get(channel)
      if (typeof original !== 'function') {
        throw new Error('Missing runtime RPC handler')
      }
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, (event, args: { method: string; params?: unknown }) => {
        if (args.method === 'agentSession.createSupport') {
          return { ok: true, result: { supported: true } }
        }
        if (args.method === 'agentSession.create') {
          captured = args
          return {
            ok: false,
            error: {
              code: 'structured_agent_session_unsupported',
              message: 'Annotation test host refused delivery'
            }
          }
        }
        return original(event, args)
      })
    }
  })

  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'á',
    code: 'Quote',
    modifiers: 1
  })
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'á',
    code: 'Quote',
    modifiers: 0
  })
  const queue = page.getByTestId('orca-ui-annotations')
  await expect(queue).toBeVisible()

  const target = page.locator('[data-testid="sortable-tab"]').first()
  await expect(target).toBeVisible()
  await target.hover()
  await target.click()
  await page
    .getByRole('textbox', { name: 'Annotation', exact: true })
    .fill('Make this tab easier to identify.')
  await queue.getByRole('button', { name: 'Add to queue', exact: true }).click()
  await expect(queue).toContainText('Make this tab easier to identify.')
  await queue.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(queue).toContainText('Make this tab easier to identify.')
  await expect(page.getByText(/Orca.*repositor|repositor.*Orca/i).last()).toBeVisible()

  const worktreeId = await page.evaluate(() => {
    const store = window.__store!
    const state = store.getState()
    const repo = state.repos[0]
    if (!repo) {
      throw new Error('Missing seeded repository')
    }
    store.setState({
      repos: state.repos.map((item) =>
        item.id === repo.id ? { ...item, displayName: 'orca', gitRemoteIdentity: undefined } : item
      )
    })
    const main = state.worktreesByRepo[repo.id]?.find((item) => item.isMainWorktree)
    if (!main) {
      throw new Error('Missing main worktree')
    }
    return main.id
  })
  await queue.getByRole('button', { name: 'Send', exact: true }).click()
  const readCaptured = () =>
    electronApp.evaluate(({ ipcMain }) => {
      if (!('_invokeHandlers' in ipcMain) || !(ipcMain._invokeHandlers instanceof Map)) {
        throw new Error('Missing invoke registry')
      }
      return ipcMain._invokeHandlers.get('test:annotation-request')()
    })
  await expect.poll(readCaptured).not.toBeNull()
  const request = await readCaptured()
  writeFileSync(
    testInfo.outputPath('annotation-chat-request.json'),
    JSON.stringify(request, null, 2)
  )
  expect(JSON.stringify(request)).toContain(worktreeId)
  expect(JSON.stringify(request)).toContain(
    '$smart-execution $loop-design max 30m; a plan $research s build $simplify-work a $review; run auto'
  )
  expect(JSON.stringify(request)).toContain('Make this tab easier to identify.')
  await expect(queue).toContainText('Make this tab easier to identify.')
  await expect(queue.getByRole('button', { name: 'Send', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Search worktrees and browser tabs', exact: true }).click()
  const dialog = page.getByRole('dialog').last()
  await expect(dialog).toBeVisible()
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'á',
    code: 'Quote',
    modifiers: 1
  })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'á', code: 'Quote', modifiers: 0 })
  await dialog.getByRole('combobox').click()
  const draft = queue.getByRole('textbox', { name: 'Annotation', exact: true })
  await draft.fill('Keep this modal annotation attached to its original element.')
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'á',
    code: 'Quote',
    modifiers: 1
  })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'á', code: 'Quote', modifiers: 0 })
  await expect(draft).toHaveValue('Keep this modal annotation attached to its original element.')
  await draft.press('End')
  await page.keyboard.type(' Typed inside modal.')
  await expect(draft).toHaveValue(
    'Keep this modal annotation attached to its original element. Typed inside modal.'
  )
  await queue.getByRole('button', { name: 'Add to queue', exact: true }).click()
  await expect(queue).toContainText('Typed inside modal.')
  await expect(queue.getByRole('heading', { name: 'UI annotations (2)' })).toBeInViewport()
  await expect(queue.getByRole('button', { name: 'Send', exact: true })).toBeInViewport()
  expect(
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some((window) => window.isVisible())
    )
  ).toBe(false)
  const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(testInfo.outputPath('annotation-queue.png'), Buffer.from(screenshot.data, 'base64'))
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(queue.getByRole('heading', { name: 'UI annotations (2)' })).toBeInViewport()
  const restored = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(
    testInfo.outputPath('annotation-queue-restored.png'),
    Buffer.from(restored.data, 'base64')
  )
  await cdp.detach()
})
