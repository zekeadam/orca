import path from 'node:path'
import { it, expect } from 'vitest'
import { runProcessSync } from '@orca/process-host'

it.skipIf(process.platform !== 'win32')(
  'shows user launches while keeping automated launches hidden',
  () => {
    const result = runProcessSync({
      program: 'powershell.exe',
      args: [
        '-NoProfile',
        '-ExecutionPolicy',
        'RemoteSigned',
        '-File',
        path.join(import.meta.dirname, 'start-windows-local.test.ps1')
      ],
      timeoutMs: 10_000
    })
    expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(result.stdout).toContain(
      'PASS: interactive launch is normal; automated launch stays hidden.'
    )
  }
)
