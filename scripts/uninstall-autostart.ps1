# Removes the "Bloom RGB" sign-in task and stops a running Bloom. Run from an elevated PowerShell.
$TaskName = 'Bloom RGB'
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object { $_.CommandLine -match 'server[\\/]main\.ts' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Write-Host "Removed '$TaskName'."
