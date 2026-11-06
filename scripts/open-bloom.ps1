# Opens the Bloom control panel in its own app window (no tabs or address bar).
# If the Bloom service isn't running yet, starts it first through the "Bloom RGB"
# sign-in task (no admin prompt), or falls back to start-bloom.cmd.
# The desktop shortcut created by scripts\install-shortcut.ps1 runs this.

$ErrorActionPreference = 'SilentlyContinue'
$url = 'http://localhost:7420'
$root = Split-Path $PSScriptRoot -Parent

function Test-Bloom {
  # A raw TCP connect: instant, and avoids Windows' slow proxy auto-detection on web requests.
  $c = New-Object System.Net.Sockets.TcpClient
  try { $c.ConnectAsync('127.0.0.1', 7420).Wait(400) -and $c.Connected } catch { $false } finally { $c.Dispose() }
}

if (-not (Test-Bloom)) {
  if (Get-ScheduledTask -TaskName 'Bloom RGB') {
    Start-ScheduledTask -TaskName 'Bloom RGB'
  } else {
    Start-Process -FilePath (Join-Path $root 'start-bloom.cmd')
  }
  for ($i = 0; $i -lt 30 -and -not (Test-Bloom); $i++) { Start-Sleep -Milliseconds 500 }
}

$browsers = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$browser = $browsers | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($browser) {
  Start-Process -FilePath $browser -ArgumentList "--app=$url", '--window-size=1440,900'
} else {
  Start-Process $url
}
