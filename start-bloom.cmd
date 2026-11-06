@echo off
rem Opens the Bloom control panel. If Bloom isn't already running (e.g. via the
rem sign-in task), starts it with administrator rights first (needed for RAM lighting).
curl -s -o nul --max-time 2 http://localhost:7420/ && (
  start "" http://localhost:7420
  exit /b
)
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
cd /d "%~dp0"
if not exist "web\dist\index.html" call npm run build
start "" http://localhost:7420
node server\main.ts
pause
