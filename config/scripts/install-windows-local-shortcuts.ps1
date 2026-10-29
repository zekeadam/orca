$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$menu = [Environment]::GetFolderPath('Programs')
$shell = New-Object -ComObject WScript.Shell
$powerShell = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$entries = @(
    @{ Name = 'Orca Dev'; Script = 'start-windows-local.ps1'; Hidden = $true },
    @{ Name = 'Orca Dev - helyi build frissitese'; Script = 'build-windows-local.ps1'; Hidden = $false }
)
foreach ($entry in $entries) {
    $shortcutPath = Join-Path $menu ($entry.Name + '.lnk')
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $powerShell
    $visibility = if ($entry.Hidden) { ' -WindowStyle Hidden' } else { '' }
    $shortcut.Arguments = '-NoProfile -ExecutionPolicy RemoteSigned' + $visibility + ' -File "' + (Join-Path $PSScriptRoot $entry.Script) + '"'
    $shortcut.WorkingDirectory = $repo
    $shortcut.IconLocation = Join-Path $repo 'resources/build/icon.ico'
    $shortcut.Description = 'Local zekeadam/orca dev build'
    $shortcut.Save()
    $readback = $shell.CreateShortcut($shortcutPath)
    if ($readback.TargetPath -ne $powerShell -or $readback.Arguments -ne $shortcut.Arguments) {
        throw "Shortcut verification failed: $shortcutPath"
    }
    Write-Host "Created: $shortcutPath"
}
