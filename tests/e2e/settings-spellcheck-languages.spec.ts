import type { ElectronApplication, Page } from '@stablyai/playwright-test'
import { writeFileSync } from 'node:fs'
import { test, expect } from './helpers/orca-app'
import { createRestartSession } from './helpers/orca-restart'

async function openSpellcheckSettings(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__store?.getState().settings)))
    .toBe(true)
  await page.evaluate(async () => {
    const store = window.__store!
    await store.getState().updateSettingsOrThrow({ uiLanguage: 'en' })
    store.getState().openSettingsPage()
  })
  await page.getByPlaceholder('Search settings').fill('Hungarian')
  await expect(page.getByText('Spellcheck Languages', { exact: true })).toBeVisible()
}

async function activeElectronLanguages(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    if (!window) {
      throw new Error('Orca window was not created')
    }
    return window.webContents.session.getSpellCheckerLanguages()
  })
}

test('adds Hungarian alongside English and restores both after relaunch', async (// oxlint-disable-next-line no-empty-pattern -- this test owns both isolated Electron launches.
{}, testInfo) => {
  test.setTimeout(240_000)
  const session = createRestartSession(testInfo, { ORCA_BACKGROUND_LAUNCH: '1' })
  let app: ElectronApplication | undefined
  try {
    const first = await session.launch()
    app = first.app
    await openSpellcheckSettings(first.page)
    const capabilities = await first.page.evaluate(async () => {
      const getCapabilities = window.api.settings.getSpellcheckCapabilities
      if (!getCapabilities) {
        throw new Error('Spellcheck capabilities are unavailable')
      }
      return getCapabilities()
    })
    if (capabilities.managedBy === 'system') {
      await expect(
        first.page.getByText(/Managed by your operating system or browser/i)
      ).toBeVisible()
      await expect(
        first.page.getByRole('button', { name: 'Spellcheck Languages', exact: true })
      ).toHaveCount(0)
      return
    }
    expect(capabilities.availableLanguages).toContain('hu')
    const english = capabilities.availableLanguages.find((language) => language.startsWith('en-'))
    if (!english) {
      throw new Error('Electron did not advertise an English dictionary')
    }
    await first.page.evaluate(async (language) => {
      await window.__store!.getState().updateSettingsOrThrow({ spellcheckLanguages: [language] })
    }, english)
    await first.page.getByRole('button', { name: 'Spellcheck Languages', exact: true }).click()
    await first.page.getByRole('option', { name: /Hungarian|magyar/ }).click()
    await expect
      .poll(() =>
        first.page.evaluate(async () => (await window.api.settings.get()).spellcheckLanguages)
      )
      .toEqual([english, 'hu'])
    await expect.poll(() => activeElectronLanguages(first.app)).toEqual([english, 'hu'])
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().some((window) => window.isVisible())
      )
    ).toBe(false)
    await first.page.keyboard.press('Escape')
    const cdp = await first.page.context().newCDPSession(first.page)
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    await cdp.detach()
    writeFileSync(
      testInfo.outputPath('spellcheck-after.png'),
      Buffer.from(screenshot.data, 'base64')
    )
    await testInfo.attach('Spellcheck languages', {
      path: testInfo.outputPath('spellcheck-after.png'),
      contentType: 'image/png'
    })
    await session.close(app)
    app = undefined

    const second = await session.launch()
    app = second.app
    await openSpellcheckSettings(second.page)
    expect(
      await second.page.evaluate(async () => (await window.api.settings.get()).spellcheckLanguages)
    ).toEqual([english, 'hu'])
    expect(await activeElectronLanguages(second.app)).toEqual([english, 'hu'])
    await second.page.getByRole('button', { name: 'Spellcheck Languages', exact: true }).click()
    await expect(second.page.getByRole('option', { name: /Hungarian|magyar/ })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await expect(second.page.getByRole('option', { name: new RegExp(english) })).toHaveAttribute(
      'aria-checked',
      'true'
    )
  } finally {
    await session.dispose(app)
  }
})
