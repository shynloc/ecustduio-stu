@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-EcuStudio.ps1" %*
if errorlevel 1 echo Operation failed. Please read the message above.
pause
