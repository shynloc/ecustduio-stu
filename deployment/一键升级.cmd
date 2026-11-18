@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Upgrade-EcuStudio.ps1" %*
if errorlevel 1 echo Upgrade did not complete. Please read the message above.
pause
