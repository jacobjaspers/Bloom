# Creates a "Bloom" shortcut on your desktop (and in the Start menu) that opens the
# control panel in its own window. Safe to run again; it just updates the shortcuts.

$root = Split-Path $PSScriptRoot -Parent
$launcher = Join-Path $PSScriptRoot 'open-bloom.ps1'
$icon = Join-Path $root 'assets\bloom.ico'
$shell = New-Object -ComObject WScript.Shell

$targets = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Bloom.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'Bloom.lnk')
)
foreach ($path in $targets) {
  $lnk = $shell.CreateShortcut($path)
  $lnk.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $lnk.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcher`""
  $lnk.WorkingDirectory = $root
  $lnk.IconLocation = "$icon,0"
  $lnk.Description = 'Bloom RGB control panel'
  $lnk.WindowStyle = 7 # start minimised so no console flashes
  $lnk.Save()
  Write-Host "Created $path"
}
