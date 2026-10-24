import { test, expect } from './helpers/orca-app'

test.use({ seedTestRepo: false })

test('Settings records a quit shortcut, persists it and exits through the app lifecycle', async ({
  orcaPage,
  electronApp
}, testInfo) => {
  await orcaPage.evaluate(async () => {
    const store = window.__store
    if (!store) {
      throw new Error('Store unavailable')
    }
    await store.getState().updateSettings({ uiLanguage: 'en' })
    store.getState().openSettingsPage()
  })
  await orcaPage.getByPlaceholder('Search settings').fill('shortcuts')
  await orcaPage.getByPlaceholder('Search command or keys').fill('quit')
  await expect(orcaPage.getByText('Quit Orca', { exact: true })).toBeVisible()
  await orcaPage.screenshot({ path: testInfo.outputPath('quit-before.png') })
  await orcaPage.getByRole('button', { name: /(?:Add|Change) shortcut for Quit Orca/ }).click()
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  await orcaPage.keyboard.press(`${modifier}+Shift+Q`)
  await expect
    .poll(() =>
      orcaPage.evaluate(async () => (await window.api.keybindings.get()).overrides['app.quit'])
    )
    .toEqual(['Mod+Shift+Q'])
  await orcaPage.screenshot({ path: testInfo.outputPath('quit-after.png') })
  const exited = new Promise<void>((resolve) => electronApp.process().once('exit', () => resolve()))
  const mainWindow = await electronApp.browserWindow(orcaPage)
  // CDP key events exercise the recorder; main interception needs Electron's input event.
  await mainWindow.evaluate((window, isMac) => {
    window.webContents.emit(
      'before-input-event',
      { preventDefault() {} },
      {
        type: 'keyDown',
        key: 'Q',
        code: 'KeyQ',
        shift: true,
        meta: isMac,
        control: !isMac,
        alt: false,
        isAutoRepeat: false
      }
    )
  }, process.platform === 'darwin')
  await exited
})
