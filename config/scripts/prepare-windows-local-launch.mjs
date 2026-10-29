import path from 'node:path'
import { prepareDevCliTerminalWrappers } from './dev-cli-terminal-wrapper.mjs'

const repoRoot = path.resolve(import.meta.dirname, '../..')
prepareDevCliTerminalWrappers({
  repoRoot,
  userDataPath: process.env.ORCA_DEV_USER_DATA_PATH,
  electronExecutable: path.join(repoRoot, 'node_modules/electron/dist/electron.exe')
})
