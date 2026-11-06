# Run by the Bloom installer (already elevated). Registers the background helper that
# drives the lights: it starts at sign-in with admin rights (needed for RAM lighting),
# so Bloom never asks for admin again after installing.
param([Parameter(Mandatory = $true)][string]$Exe)

$ErrorActionPreference = 'Stop'
$TaskName = 'Bloom RGB'

# The person signed in at the desktop (not the admin account that approved the install,
# if those differ).
$user = (Get-CimInstance Win32_ComputerSystem).UserName
if (-not $user) { $user = "$env:USERDOMAIN\$env:USERNAME" }

# Replace any earlier Bloom helper (including a developer copy) and stop it.
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object { $_.CommandLine -match 'server[\\/]main\.ts' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

$action = New-ScheduledTaskAction -Execute $Exe -Argument '--service' -WorkingDirectory (Split-Path $Exe)
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$trigger.Delay = 'PT10S' # let USB devices and drivers settle after sign-in
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description 'Bloom RGB lighting service (drives your lights in the background).' -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName
