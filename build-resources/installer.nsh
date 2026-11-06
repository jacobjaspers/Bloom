; Extra steps for the Bloom installer (electron-builder NSIS).

!macro customInstall
  DetailPrint "Setting up Bloom's lighting service…"
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\setup\register-task.ps1" -Exe "$INSTDIR\Bloom.exe"'
!macroend

!macro customUnInstall
  DetailPrint "Stopping Bloom's lighting service…"
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\setup\unregister-task.ps1" -InstallDir "$INSTDIR"'
!macroend
