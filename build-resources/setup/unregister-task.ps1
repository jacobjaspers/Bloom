# Run by the Bloom uninstaller (elevated). Stops and removes the background helper and
# the OpenRGB copy it started. Your saved looks in %APPDATA%\Bloom are left in place.
param([string]$InstallDir = (Split-Path (Split-Path $PSScriptRoot)))

$TaskName = 'Bloom RGB'
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

Get-CimInstance Win32_Process |
  Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($InstallDir, [StringComparison]::OrdinalIgnoreCase) } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
