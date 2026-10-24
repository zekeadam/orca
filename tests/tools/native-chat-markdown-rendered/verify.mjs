import assert from 'node:assert/strict'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { verifyStyles } from './styles.mjs'

export const inline =
  '# Heading **bold**\n**strong** and *emphasis* and ~~strike~~\n`const answer = 42` and [example](https://example.com)\nLiteral delimiters remain editable: ** * ~~ ` [ ]'
export const blocks =
  '> Quoted source\n- First item\n1. Ordered item\n```typescript\nconst value = "**literal**"\n```\nEnd of source'

export async function verify(page, cdp, outputDir, phase) {
  const checks = []
  const screenshots = []
  const field = page.getByRole('textbox', { name: 'Write a prompt' })
  const value = () => page.evaluate(() => window.markdownHarness.get())
  const set = async (text) => {
    await page.evaluate((text) => window.markdownHarness.set(text), text)
    await page.waitForFunction((text) => window.markdownHarness.get().value === text, text, {
      polling: 100
    })
  }
  const select = (start, end = start) =>
    page.evaluate(([start, end]) => window.markdownHarness.select(start, end), [start, end])
  const checkValue = async (expected, name) => {
    await page.waitForFunction(
      (expected) => window.markdownHarness.get().value === expected,
      expected,
      { polling: 100 }
    )
    assert.equal((await value()).value, expected)
    checks.push(name)
  }
  const snapshot = async (name) => {
    const target = path.join(outputDir, `${phase}-${name}.png`)
    const { data } = await Promise.race([
      cdp.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('CDP screenshot deadline exceeded')), 15000)
      )
    ])
    await writeFile(target, Buffer.from(data, 'base64'))
    screenshots.push(target)
  }
  const styles = {}
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (theme) => document.documentElement.classList.toggle('dark', theme === 'dark'),
      theme
    )
    await page.evaluate(
      (text) => window.markdownHarness.label(text),
      `${phase}: ${theme} — literal Markdown source`
    )
    await set(inline)
    await field.evaluate((element) => {
      element.scrollTop = 0
    })
    console.log(
      'Capturing',
      phase,
      theme,
      'font status:',
      await page.evaluate(() => document.fonts.status)
    )
    await snapshot(`${theme}-inline`)
    assert.equal(
      await field.evaluate((element) =>
        [...element.children].map((paragraph) => paragraph.textContent).join('\n')
      ),
      inline
    )
    checks.push(`${theme}: visible source equals serialized source`)
    styles[theme] = {
      inline: await verifyStyles(field, phase, [
        'heading',
        'strong',
        'emphasis',
        'delete',
        'inlineCode',
        'link'
      ])
    }
    checks.push(`${theme}: computed inline Markdown styles match phase`)
    styles[theme].allSpans = await field.evaluate((element) => ({
      color: getComputedStyle(element).color,
      background: getComputedStyle(element.closest('main')).backgroundColor,
      size: getComputedStyle(element).fontSize,
      decorations: [...element.querySelectorAll('span')].map((span) => ({
        text: span.textContent,
        class: span.className,
        weight: getComputedStyle(span).fontWeight,
        style: getComputedStyle(span).fontStyle,
        decoration: getComputedStyle(span).textDecorationLine,
        family: getComputedStyle(span).fontFamily
      }))
    }))
    await set(blocks)
    await field.evaluate((element) => {
      element.scrollTop = 0
    })
    await snapshot(`${theme}-blocks`)
    assert.equal(
      await field.evaluate((element) =>
        [...element.children].map((paragraph) => paragraph.textContent).join('\n')
      ),
      blocks
    )
    styles[theme].blocks = await verifyStyles(field, phase, ['blockquote', 'listItem', 'code'])
    checks.push(`${theme}: computed block Markdown styles match phase`)
  }
  await set('**bold**')
  await select(0)
  await page.keyboard.press('Delete')
  await checkValue('*bold**', 'delete opening delimiter preserves source and caret')
  assert.equal((await value()).start, 0)
  await page.keyboard.insertText('*')
  await checkValue('**bold**', 'restore delimiter at caret')
  await select(2, 6)
  await page.keyboard.insertText('edited')
  await checkValue('**edited**', 'replace selected styled text')
  assert.equal((await value()).start, 8)
  await set('first\nsecond\nthird')
  await select(8)
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.insertText('X')
  await checkValue('first\nsXecond\nthird', 'arrow movement and insertion inside multiline source')
  await set('one')
  await select(3)
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('two')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.insertText('three')
  await checkValue('one\ntwo\nthree', 'editor Enter and Shift+Enter preserve line breaks')
  await set('prefix suffix')
  await select(7)
  const pasted = '**paste**\n# heading\n[link](https://example.com)'
  await field.evaluate((element, text) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/plain', text)
    clipboardData.setData('text/html', '<h1>HTML must not replace source</h1>')
    element.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData })
    )
  }, pasted)
  await checkValue(`prefix ${pasted}suffix`, 'DOM paste prefers exact plain text over rich HTML')
  assert.equal(await field.locator('h1').count(), 0)
  await set('**IME** ')
  await select(8)
  await cdp.send('Input.imeSetComposition', { text: '\u306b', selectionStart: 1, selectionEnd: 1 })
  await cdp.send('Input.imeSetComposition', {
    text: '**\u65e5\u672c\u8a9e**',
    selectionStart: 7,
    selectionEnd: 7
  })
  await cdp.send('Input.insertText', { text: '**\u65e5\u672c\u8a9e**' })
  await checkValue(
    '**IME** **\u65e5\u672c\u8a9e**',
    'Chromium CDP composition commits once without corrupting Markdown'
  )
  if (phase === 'after') {
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('[data-prompt-markdown=strong]')].some((span) =>
          span.textContent.includes('\u65e5\u672c\u8a9e')
        ),
      undefined,
      { polling: 100 }
    )
    checks.push('composition end refreshes formatting on newly composed source')
  }
  await set('**draft** ')
  await page.evaluate(() => window.markdownHarness.pill())
  await page.waitForFunction(() => document.querySelector('[data-native-chat-skill]'), undefined, {
    polling: 100
  })
  await select((await value()).value.length)
  await page.evaluate(() => window.markdownHarness.file())
  await page.waitForFunction(
    () => document.querySelector('[data-native-chat-file-reference]'),
    undefined,
    { polling: 100 }
  )
  const draft = (await value()).value
  assert.ok(draft.includes('$review'))
  assert.ok(draft.includes('**draft**'))
  assert.ok(draft.includes('src/example.ts'))
  await snapshot('dark-pills')
  await page.evaluate(() => window.markdownHarness.remount())
  await page.waitForFunction(() => document.querySelector('[data-native-chat-skill]'), undefined, {
    polling: 100
  })
  assert.equal((await value()).value, draft)
  assert.equal(await field.locator('[data-native-chat-skill]').count(), 1)
  assert.equal(await field.locator('[data-native-chat-file-reference]').count(), 1)
  checks.push('draft remount preserves exact source and skill/file atoms')
  await select(draft.indexOf('draft') + 2)
  await page.keyboard.insertText('X')
  await checkValue(
    draft.replace('draft', 'drXaft'),
    'editing near atoms preserves serialized tokens'
  )
  assert.equal(await field.locator('[data-native-chat-skill]').count(), 1)
  await set('')
  await page.keyboard.type('**typed** and _italic_')
  await checkValue(
    '**typed** and _italic_',
    'typing Markdown never transforms or removes delimiters'
  )
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
  assert.notEqual((await value()).value, '**typed** and _italic_')
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+Shift+z')
  await checkValue('**typed** and _italic_', 'undo changes source and redo restores exact source')
  return {
    checks,
    screenshots,
    styles,
    limitations: [
      'Component fixture, not full composer send/autocomplete routing or SSH transport.',
      'CDP composition and DOM paste do not exercise an OS IME or system clipboard.',
      'Draft remount checks current renderer cache; application quit/reload durability is outside this fixture.',
      'No native focus, visible-window, macOS or Linux desktop checks.'
    ]
  }
}
