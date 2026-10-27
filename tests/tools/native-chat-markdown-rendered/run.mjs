import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { chromium } from 'playwright-core'
import { runProcess, spawnProcess } from '@orca/process-host'
import { verify } from './verify.mjs'

const require = createRequire(import.meta.url)
const fixtureRoot = import.meta.dirname
const root = path.resolve(fixtureRoot, '../../..')
const phase = process.argv[2] ?? 'after'
const baselineRef = process.argv[3] ?? 'origin/dev'
assert.ok(['before', 'after'].includes(phase), 'Use before or after')
const scratch = process.env.ORCA_CHAT_SCRATCH_DIR
assert.ok(scratch, 'Set ORCA_CHAT_SCRATCH_DIR to an isolated evidence directory')
const outputDir = path.join(scratch, 'native-chat-markdown', phase)
await mkdir(outputDir, { recursive: true })
const profile = await mkdtemp(path.join(outputDir, 'profile-'))
const editorRelative = 'src/renderer/src/components/native-chat/NativeChatPromptEditor.tsx'
const editorPath = path.join(root, editorRelative)
const source =
  phase === 'before'
    ? (
        await runProcess({
          program: 'git',
          args: ['show', `${baselineRef}:${editorRelative}`],
          cwd: root
        })
      ).stdout
    : await readFile(editorPath, 'utf8')
assert.ok(source.includes('NativeChatPromptEditor'), 'Baseline source must be available')
await writeFile(path.join(outputDir, 'editor-source.tsx'), source)
const report = {
  phase,
  baselineRef,
  sourceSha256: createHash('sha256').update(source).digest('hex'),
  outputDir
}
const server = await createServer({
  configFile: false,
  root: fixtureRoot,
  cacheDir: path.join(outputDir, 'vite-cache'),
  plugins: [
    {
      name: 'pin-prompt-editor-source',
      enforce: 'pre',
      load(id) {
        if (id.replaceAll('\\', '/') === editorPath.replaceAll('\\', '/')) {
          return source
        }
      }
    },
    react(),
    tailwindcss()
  ],
  resolve: {
    alias: {
      '@': path.join(root, 'src/renderer/src'),
      '@renderer': path.join(root, 'src/renderer/src')
    }
  },
  server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } },
  optimizeDeps: { include: ['react', 'react-dom/client', '@tiptap/react', '@tiptap/starter-kit'] }
})
let child
let browser
let stderr = ''
let stdout = ''
try {
  await server.listen()
  const address = server.httpServer.address()
  assert.ok(address && typeof address !== 'string')
  const { ELECTRON_RUN_AS_NODE: _runAsNode, ...env } = process.env
  child = spawnProcess({
    program: require('electron'),
    args: [path.join(fixtureRoot, 'main.cjs'), '--remote-debugging-port=0'],
    cwd: root,
    env: {
      ...env,
      ORCA_BACKGROUND_LAUNCH: '1',
      MARKDOWN_PROFILE: profile,
      MARKDOWN_URL: `http://127.0.0.1:${address.port}`
    }
  })
  child.stdout.on('data', (chunk) => {
    stdout += chunk
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })
  const deadline = Date.now() + 60000
  while (!stderr.includes('DevTools listening on ws://')) {
    if (child.exitCode !== null) {
      throw new Error(`Electron exited: ${stderr}`)
    }
    assert.ok(Date.now() < deadline, `No CDP endpoint: ${stderr}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  const endpoint = stderr.match(/DevTools listening on (ws:\/\/\S+)/)?.[1]
  browser = await chromium.connectOverCDP(endpoint)
  const page = browser.contexts()[0].pages()[0]
  page.setDefaultTimeout(30000)
  const errors = []
  page.on('pageerror', (error) => {
    errors.push(error.message)
    console.error('Renderer error:', error.message)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') {
      console.error('Renderer console:', message.text())
    }
  })
  console.log('CDP page:', page.url())
  await page
    .waitForFunction(() => Boolean(window.markdownHarness?.get().value !== undefined), undefined, {
      polling: 100,
      timeout: 180000
    })
    .catch(async (error) => {
      console.error(
        'Startup DOM:',
        await page.evaluate(() => ({
          html: document.body.innerHTML,
          state: document.readyState,
          harness: typeof window.markdownHarness
        }))
      )
      throw error
    })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  Object.assign(report, await verify(page, cdp, outputDir, phase))
  assert.deepEqual(errors, [])
  assert.ok(
    stdout.includes('"hidden":true,"focused":false'),
    `Hidden window evidence missing: ${stdout}`
  )
  assert.ok(!stderr.includes('Forbidden window event'), stderr)
  report.hiddenWindow = JSON.parse(stdout.trim().split('\n').at(-1))
  report.passed = true
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  report.passed = false
  report.error = String(error.stack ?? error)
  console.error(report.error)
  process.exitCode = 1
} finally {
  await writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  await writeFile(path.join(outputDir, 'electron-stderr.log'), stderr)
  await writeFile(path.join(outputDir, 'electron-stdout.log'), stdout)
  if (browser?.isConnected()) {
    const shutdown = await browser.newBrowserCDPSession().catch(() => null)
    await Promise.race([
      shutdown?.send('Browser.close').catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 2000))
    ])
    if (child && child.exitCode === null) {
      child.kill()
    }
    await Promise.race([browser.close(), new Promise((resolve) => setTimeout(resolve, 2000))])
  }
  if (child && child.exitCode === null) {
    child.kill()
  }
  await Promise.race([server.close(), new Promise((resolve) => setTimeout(resolve, 3000))])
  process.exit(process.exitCode ?? 0)
}
