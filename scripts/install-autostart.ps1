# Registers a Windows scheduled task that starts Bloom silently, with admin rights,
# when you sign in. Admin rights are needed for RAM lighting (PawnIO / SMBus).
# Run from an elevated PowerShell. Undo with scripts\uninstall-autostart.ps1.

$ErrorActionPreference = 'Stop'
$TaskName = 'Bloom RGB'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Node = (Get-Command node -ErrorAction Stop).Source
$LogDir = Join-Path $env:LOCALAPPDATA 'Bloom'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Log = Join-Path $LogDir 'bloom.log'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this script from an administrator PowerShell.'
}

# Build the UI once so the server has something to serve.
if (-not (Test-Path (Join-Path $Root 'web\dist\index.html'))) {
  Push-Location $Root; npm run build; Pop-Location
}

# A hidden PowerShell hosts node so no console window stays open. (conhost --headless
# looks tidier but exits immediately when Task Scheduler starts it without a console.)
# The task creates its own log folder: don't rely on one made at install time.
$ps = "New-Item -ItemType Directory -Force -Path '$LogDir' | Out-Null; Set-Location -LiteralPath '$Root'; & '$Node' 'server\main.ts' 2>&1 | Out-File -Encoding utf8 -LiteralPath '$Log'"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command `"$ps`"" -WorkingDirectory $Root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$trigger.Delay = 'PT10S' # give USB and the PawnIO driver a moment after sign-in
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
  -MultipleInstances IgnoreNew
$taskPrincipal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -Principal $taskPrincipal -Description 'Starts the Bloom RGB lighting service at sign-in.' -Force | Out-Null

Write-Host "Installed scheduled task '$TaskName'. Log: $Log"
