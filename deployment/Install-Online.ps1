param([string]$InstallDir=(Join-Path $env:LOCALAPPDATA 'EcuStudio'),[int]$Port=37891,[ValidateSet('lan','local')][string]$NetworkMode='lan',[switch]$NoBrowser,[switch]$NoFirewall,[switch]$NoAutoStart,[switch]$NoStart)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Common.ps1')
$target=[IO.Path]::GetFullPath($InstallDir)
if(Test-Path -LiteralPath (Join-Path $target 'data\app.sqlite')){
  & (Join-Path $PSScriptRoot 'Upgrade-EcuStudio.ps1') -InstallDir $target -NoBrowser:$NoBrowser
  return
}
New-Item -ItemType Directory -Path $target -Force | Out-Null
if(-not (Test-Path -LiteralPath (Join-Path $target 'runtime\node\node.exe'))){Write-Host 'Online installer: downloading and verifying official Node runtime...';Repair-EcuNode $target}
& (Join-Path $PSScriptRoot 'Install-EcuStudio.ps1') -InstallDir $target -Port $Port -NetworkMode $NetworkMode -NoBrowser:$NoBrowser -NoFirewall:$NoFirewall -NoAutoStart:$NoAutoStart -NoStart:$NoStart
