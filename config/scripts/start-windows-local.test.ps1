$ErrorActionPreference = 'Stop'
$env:ORCA_BACKGROUND_LAUNCH = '1'
$global:launch = $null
function node { $global:LASTEXITCODE = 0 }
function Test-Path { return $true }
function Start-Process {
    param($FilePath, $ArgumentList, $WorkingDirectory, $WindowStyle, [switch]$PassThru)
    $global:launch = @{
        WindowStyle = $WindowStyle
        Background = $env:ORCA_BACKGROUND_LAUNCH
        UserDataPath = $env:ORCA_DEV_USER_DATA_PATH
        Executable = $FilePath
        Waited = $false
    }
    if (-not $PassThru) { throw 'Launcher needs the main process handle.' }
    $child = [pscustomobject]@{ ExitCode = 0 }
    $child | Add-Member -MemberType ScriptMethod -Name WaitForExit -Value { $global:launch.Waited = $true }
    return $child
}
& (Join-Path $PSScriptRoot 'start-windows-local.ps1')
if ($launch.WindowStyle -ne 'Normal') {
    throw "Interactive shortcut hides the app: WindowStyle=$($launch.WindowStyle)"
}
if ($launch.Background -eq '1') { throw 'Interactive shortcut retained background mode.' }
if ($launch.UserDataPath -ne (Join-Path $env:APPDATA 'orca')) {
    throw 'Local dev must use the main Orca profile.'
}
if (-not $launch.Waited) { throw 'Launcher exits before the dev app; its parent watchdog will close it.' }
& (Join-Path $PSScriptRoot 'start-windows-local.ps1') -Background
if ($launch.WindowStyle -ne 'Hidden' -or $launch.Background -ne '1') {
    throw 'Automated launch must stay hidden.'
}
if (-not $launch.Waited) { throw 'Background launcher must also outlive the dev app.' }
Write-Output 'PASS: interactive launch is normal; automated launch stays hidden. Launcher waits for the app.'
