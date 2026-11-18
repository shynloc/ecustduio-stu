param([string]$InstallDir=(Join-Path $env:LOCALAPPDATA 'EcuStudio'),[int]$Port=37891,[ValidateSet('lan','local')][string]$NetworkMode='lan',[switch]$NoBrowser,[switch]$NoFirewall,[switch]$NoAutoStart,[switch]$NoStart)
$ErrorActionPreference='Stop'
$sourceRoot=[IO.Path]::GetFullPath($PSScriptRoot)
$targetRoot=[IO.Path]::GetFullPath($InstallDir)
if(Test-Path -LiteralPath (Join-Path $targetRoot 'data\app.sqlite')){
  & (Join-Path $PSScriptRoot 'Upgrade-EcuStudio.ps1') -InstallDir $targetRoot -NoBrowser:$NoBrowser
  return
}
if(-not [Environment]::Is64BitOperatingSystem){throw 'EcuStudio requires 64-bit Windows 10/11.'}
if($targetRoot -eq [IO.Path]::GetPathRoot($targetRoot)){throw 'Choose an application folder, not a drive root.'}
New-Item -ItemType Directory -Path $targetRoot -Force | Out-Null
if($targetRoot -ne $sourceRoot){
  if(Test-Path -LiteralPath (Join-Path $targetRoot 'Stop-EcuStudio.ps1')){& (Join-Path $targetRoot 'Stop-EcuStudio.ps1')}
  foreach($dir in @('app','runtime','docs')){if(Test-Path -LiteralPath (Join-Path $sourceRoot $dir)){Copy-Item -LiteralPath (Join-Path $sourceRoot $dir) -Destination $targetRoot -Recurse -Force}}
  Get-ChildItem -LiteralPath $sourceRoot -File | Where-Object {$_.Extension -in @('.ps1','.cmd','.md','.html','.json','.mjs')} | Where-Object {$_.Name -notin @('ecustudio.json','installation-result.json')} | Copy-Item -Destination $targetRoot -Force
}
. (Join-Path $targetRoot 'Common.ps1')
try{$node=Get-EcuNode $targetRoot}catch{Write-Host 'Restoring Node from the official distribution...';Repair-EcuNode $targetRoot;$node=Get-EcuNode $targetRoot}
$version=& $node -p 'process.versions.node'
if([version]$version -lt [version]'24.15.0' -or $version -notmatch '^24\.'){throw 'Bundled Node runtime is incompatible. Restore runtime folder from the original ZIP.'}
$old=Join-Path $targetRoot 'ecustudio.json'
if(Test-Path -LiteralPath $old){$cfg=Get-EcuConfig $targetRoot;$Port=[int]$cfg.port;$NetworkMode=$cfg.networkMode}
$health=$null;try{$health=Invoke-RestMethod ('http://127.0.0.1:'+$Port+'/health') -TimeoutSec 1}catch{}
if(-not ($health -and $health.instanceId -eq (Get-EcuId $targetRoot))){
 for($i=0;$i -lt 30 -and -not (Test-EcuPort $Port);$i++){$Port++}
 if(-not (Test-EcuPort $Port)){throw 'No free service port found.'}
}
$cfg=[pscustomobject]@{port=$Port;networkMode=$NetworkMode}
$cfg | ConvertTo-Json | Set-Content -LiteralPath $old -Encoding UTF8
Set-EcuEnvironment $targetRoot $cfg
$appRoot=Join-Path $targetRoot 'app'
Push-Location $appRoot
try{
  & $node (Join-Path $appRoot 'scripts\diagnose-runtime.mjs')
  if($LASTEXITCODE -ne 0){
    Write-Host 'Repairing pinned dependencies from package-lock.json...'
    & $node (Join-Path $targetRoot 'runtime\node\node_modules\npm\bin\npm-cli.js') ci --omit=dev --ignore-scripts --no-audit --no-fund
    if($LASTEXITCODE -ne 0){throw 'Dependency repair failed. Check network or re-extract the complete ZIP.'}
    & $node (Join-Path $appRoot 'node_modules\playwright\cli.js') install chromium --only-shell
    if($LASTEXITCODE -ne 0){throw 'PDF browser repair failed. Check network or restore runtime/browsers from ZIP.'}
    & $node (Join-Path $appRoot 'scripts\diagnose-runtime.mjs')
    if($LASTEXITCODE -ne 0){throw 'Runtime diagnostic failed. Inspect the diagnostic output.'}
  }
}finally{Pop-Location}
$runtimeReport=Join-Path $targetRoot 'data\logs\runtime-check.json'
if(Test-Path -LiteralPath $runtimeReport){$runtimeState=Get-Content -LiteralPath $runtimeReport -Raw | ConvertFrom-Json;if(-not $runtimeState.ocr -and -not $NoFirewall){try{& (Join-Path $targetRoot 'Repair-OCR.ps1')}catch{Write-Warning ('Optional OCR language installation needs Windows Update/admin access: '+$_.Exception.Message)}}}
$firewall='not_requested'
if($NetworkMode -eq 'lan' -and -not $NoFirewall){try{& (Join-Path $targetRoot 'Enable-Lan.ps1');$firewall='configured'}catch{$firewall='requires_administrator';Write-Warning $_.Exception.Message}}
if(-not $NoAutoStart){
 $shell=New-Object -ComObject WScript.Shell
 $shortcut=$shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) ('EcuStudio-'+(Get-EcuId $targetRoot)+'.lnk')))
 $shortcut.TargetPath=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
 $shortcut.Arguments='-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+(Join-Path $targetRoot 'Start-EcuStudio.ps1')+'" -NoBrowser'
 $shortcut.WorkingDirectory=$targetRoot;$shortcut.WindowStyle=7;$shortcut.Save()
}
$installedVersion=(Get-Content -LiteralPath (Join-Path $appRoot 'package.json') -Raw | ConvertFrom-Json).version
@{installedAt=(Get-Date).ToUniversalTime().ToString('o');version=$installedVersion;installDir=$targetRoot;port=$Port;networkMode=$NetworkMode;firewall=$firewall;autoStart=(-not $NoAutoStart);localUrl=('http://127.0.0.1:'+$Port)} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $targetRoot 'installation-result.json') -Encoding UTF8
if(-not $NoStart){& (Join-Path $targetRoot 'Start-EcuStudio.ps1') -NoBrowser:$NoBrowser}
Write-Host ('Installation ready: '+$targetRoot)
Write-Host ('Open http://127.0.0.1:'+$Port+' on this server to create the administrator.')
if($firewall -eq 'requires_administrator'){Write-Warning 'LAN firewall is not configured. Run Enable-Lan.cmd as administrator before connecting other devices.'}
