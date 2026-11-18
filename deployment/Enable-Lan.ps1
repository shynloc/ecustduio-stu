param([switch]$Elevated)
. (Join-Path $PSScriptRoot 'Common.ps1')
$root=$PSScriptRoot;$cfg=Get-EcuConfig $root
$admin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if(-not $admin){
 if($Elevated){throw 'Administrator rights required for the firewall rule.'}
 $powershell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
 $p=Start-Process -FilePath $powershell -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$PSCommandPath+'"'),'-Elevated')
 if($p.ExitCode -ne 0){throw 'Firewall rule not applied. Run Enable-Lan.cmd as administrator.'};return
}
$name='EcuStudio-LAN-'+(Get-EcuId $root)
$old=Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue
if($old){$old | Remove-NetFirewallRule}
New-NetFirewallRule -Name $name -DisplayName ('EcuStudio LAN '+$cfg.port) -Direction Inbound -Action Allow -Protocol TCP -LocalPort $cfg.port -RemoteAddress LocalSubnet -Profile Any -Program (Get-EcuNode $root) -EdgeTraversalPolicy Block | Out-Null
Write-Host 'Firewall configured: this application and local subnet only.'
