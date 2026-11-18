param([switch]$Elevated)
$ErrorActionPreference='Stop'
$admin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if(-not $admin){if($Elevated){throw 'Administrator rights required'};$exe=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe';$p=Start-Process -FilePath $exe -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$PSCommandPath+'"'),'-Elevated');if($p.ExitCode -ne 0){throw 'OCR language installation incomplete'};return}
$cap=Get-WindowsCapability -Online -Name 'Language.OCR~~~zh-CN~0.0.1.0'
if($cap.State -ne 'Installed'){Add-WindowsCapability -Online -Name 'Language.OCR~~~zh-CN~0.0.1.0' | Out-Null}
Write-Host 'Chinese OCR capability installed. Restart EcuStudio to refresh capability detection.'
