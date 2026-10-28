param([switch]$NoPause)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$localBuild = Join-Path $repo '.build/windows-local-dev'
$result = 1
try {
    Set-Location -LiteralPath $repo
    if ((git branch --show-current).Trim() -ne 'dev') { throw 'Switch to the dev branch before rebuilding.' }
    if ((git remote get-url origin).Trim() -notmatch '^(https://github\.com/|git@github\.com:)zekeadam/orca(?:\.git)?$') {
        throw 'Expected origin to point to the zekeadam/orca fork.'
    }
    if ((& node --version) -notmatch '^v24\.') { throw 'Install Node.js 24 before building.' }
    New-Item -ItemType Directory -Force -Path (Join-Path $localBuild 'bin') | Out-Null
    $pnpmCommand = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
    if (-not $pnpmCommand) {
        $corepack = Get-Command corepack.cmd -ErrorAction SilentlyContinue
        if (-not $corepack) { throw 'Install Corepack or the package.json version of pnpm first.' }
        $escapedCorepack = $corepack.Source.Replace('%', '%%')
        Set-Content (Join-Path $localBuild 'bin/pnpm.cmd') ('@call "' + $escapedCorepack + '" pnpm %*') -Encoding Ascii
        $env:PATH = "$(Join-Path $localBuild 'bin');$env:PATH"
    }
    $localCargo = Join-Path $localBuild 'rust/cargo'
    if ((Test-Path (Join-Path $localCargo 'bin/cargo.exe')) -or -not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        $env:RUSTUP_HOME = Join-Path $localBuild 'rust/rustup'
        $env:CARGO_HOME = $localCargo
        $env:PATH = "$(Join-Path $localCargo 'bin');$env:PATH"
        if (-not (Test-Path (Join-Path $localCargo 'bin/cargo.exe'))) {
            Write-Host 'Installing a local Rust compiler (system PATH stays unchanged).'
            $installer = Join-Path $localBuild 'rustup-init.exe'
            Invoke-WebRequest -UseBasicParsing 'https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe' -OutFile $installer
            & $installer -y --no-modify-path --profile minimal --default-toolchain stable
            if ($LASTEXITCODE -ne 0) { throw 'Local Rust installation failed.' }
        }
    }
    $env:ORCA_BACKGROUND_LAUNCH = '1'
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    $sha = (git rev-parse HEAD).Trim()
    Write-Host "Building local dev checkout: $sha"
    Remove-Item -LiteralPath (Join-Path $localBuild 'build.json') -ErrorAction SilentlyContinue
    & pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'Desktop dependency installation failed.' }
    & pnpm --dir mobile install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'Mobile web dependency installation failed.' }
    & pnpm run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
    & pnpm run ensure:electron-runtime
    if ($LASTEXITCODE -ne 0) { throw 'Electron runtime verification failed.' }
    if ((git rev-parse HEAD).Trim() -ne $sha) { throw 'HEAD changed during the build. Rebuild again.' }
    @{ commit = $sha; builtAt = (Get-Date).ToString('o'); branch = 'dev' } |
        ConvertTo-Json | Set-Content (Join-Path $localBuild 'build.json') -Encoding UTF8
    Write-Host 'SUCCESS. Start Orca Dev from the Start menu.' -ForegroundColor Green
    $result = 0
} catch {
    Write-Host $_ -ForegroundColor Red
}
if (-not $NoPause) { Read-Host 'Press Enter to close' | Out-Null }
exit $result
