!macro customInit
  nsExec::Exec `taskkill /F /IM "Pablo ASA.exe" /T`
  nsExec::Exec `taskkill /F /IM "PabloASA.exe" /T`
  Sleep 1000
!macroend

!macro customCheckAppRunning
  nsExec::Exec `taskkill /F /IM "Pablo ASA.exe" /T`
  nsExec::Exec `taskkill /F /IM "PabloASA.exe" /T`
  Sleep 1500
!macroend
