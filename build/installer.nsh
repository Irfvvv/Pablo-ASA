!macro customCheckAppRunning
  nsExec::ExecToLog `taskkill /F /IM "Pablo ASA.exe" /T`
  Sleep 1500
!macroend
