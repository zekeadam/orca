param([switch]$Background)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$electron = Join-Path $repo 'node_modules/electron/dist/electron.exe'
if (-not (Test-Path (Join-Path $repo '.build/windows-local-dev/build.json'))) {
    throw 'Run config/scripts/build-windows-local.ps1 first.'
}
Set-Location -LiteralPath $repo
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Remove-Item Env:ELECTRON_RENDERER_URL -ErrorAction SilentlyContinue
if ($Background) { $env:ORCA_BACKGROUND_LAUNCH = '1' }
else { Remove-Item Env:ORCA_BACKGROUND_LAUNCH -ErrorAction SilentlyContinue }
$env:ORCA_DEV_USER_DATA_PATH = Join-Path $env:APPDATA 'orca'
$env:ORCA_DEV_REPO_ROOT = $repo
$env:ORCA_DEV_INSTANCE_KEY = $repo
$env:ORCA_DEV_BRANCH = 'dev'
$env:ORCA_DEV_INSTANCE_LABEL = 'fork dev'
& node (Join-Path $PSScriptRoot 'prepare-windows-local-launch.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Dev CLI preparation failed.' }
$env:PATH = "$(Join-Path $repo 'out/bin');$env:PATH"
# A hidden startup state can suppress Windows' first ShowWindow call for the app itself.
$windowStyle = if ($Background) { 'Hidden' } else { 'Normal' }
# Dev mode quits when its parent exits, so keep this launcher alive until the app closes.
$appProcess = Start-Process -FilePath $electron -ArgumentList ('"{0}"' -f $repo) -WorkingDirectory $repo -WindowStyle $windowStyle -PassThru
$appProcess.WaitForExit()
exit $appProcess.ExitCode
