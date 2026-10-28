# Local Windows dev build

Prerequisites: Git, Node.js 24 with Corepack (or the pnpm version in `package.json`), and Visual Studio Build Tools with the Desktop development with C++ workload and a Windows SDK.

The pre-commit hook uses Corepack when `pnpm` is not on PATH, so committing does not require a global pnpm installation or a system PATH change.

From a checkout of `zekeadam/orca` on the `dev` branch, run in PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File config/scripts/build-windows-local.ps1 -NoPause
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File config/scripts/install-windows-local-shortcuts.ps1
```

The builder installs the locked desktop and mobile web dependencies, checks types, builds the app and Windows native launchers, and verifies the Electron native runtime. If Cargo is missing, it installs a minimal Rust toolchain under `.build/windows-local-dev/rust` without changing the system PATH. Build products stay in the checkout; this creates a runnable local build, not a Windows installer.

The shortcut installer creates or updates two entries in the current user's Start menu:

- **Orca Dev** starts the compiled build using the main Orca profile at `%APPDATA%/orca`. Projects, settings, and the active profile are shared. Fully quit the main Orca before starting the dev build: the profile lock allows one running instance, and a second launch hands off to the existing instance.
- **Orca Dev - helyi build frissitese** rebuilds the local `dev` checkout. Close Orca Dev before rebuilding, then start it again afterward. The builder never pulls, switches branches, commits, or publishes.

Both scripts resolve the repository from their own location. Run the shortcut installer again after moving the checkout or setting up another machine. Shortcuts use `RemoteSigned` only for their PowerShell process; the system execution policy stays unchanged.

With pnpm available, the equivalent commands are `pnpm build:win:local`, `pnpm install:win:local-shortcuts`, and `pnpm start:win:local`. Agent-launched validation must use `start-windows-local.ps1 -Background` or another launch with `ORCA_BACKGROUND_LAUNCH=1`.
