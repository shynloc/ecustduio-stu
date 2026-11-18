param([int]$Port=0,[switch]$NoBrowser,[ValidateSet('local','lan')][string]$NetworkMode='')
. (Join-Path $PSScriptRoot 'Common.ps1')
$root=[IO.Path]::GetFullPath($PSScriptRoot)
$cfg=Get-EcuConfig $root
if($Port){$cfg.port=$Port};if($NetworkMode){$cfg.networkMode=$NetworkMode}
$node=Get-EcuNode $root
$entry=[IO.Path]::GetFullPath((Join-Path $root 'app\dist-server\server\index.js'))
if(-not (Test-Path -LiteralPath $entry)){throw 'Application files missing. Re-run Install-EcuStudio.cmd.'}
$url='http://127.0.0.1:'+$cfg.port
try{$health=Invoke-RestMethod ($url+'/health') -TimeoutSec 2;if($health.instanceId -eq (Get-EcuId $root)){Write-Host ('Already running: '+$url);if(-not $NoBrowser){Start-Process $url};return}}catch{}
if(-not (Test-EcuPort $cfg.port)){throw ('Port '+$cfg.port+' is occupied. Run Install-EcuStudio.cmd to select a free port, or change ecustudio.json.')}
Set-EcuEnvironment $root $cfg
$logRoot=Join-Path $root 'data\logs';New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
$argsList=@();if(Test-Path -LiteralPath (Join-Path $root 'app\.env')){$argsList+='--env-file=.env'};$argsList+=('"'+$entry+'"')
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$process=Start-Process -FilePath $node -ArgumentList $argsList -WorkingDirectory (Join-Path $root 'app') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logRoot ($stamp+'-stdout.log')) -RedirectStandardError (Join-Path $logRoot ($stamp+'-stderr.log'))
@{pid=$process.Id;entry=$entry;port=$cfg.port;node=$node} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $logRoot 'server.json') -Encoding UTF8
$process.Id | Set-Content -LiteralPath (Join-Path $logRoot 'server.pid') -Encoding Ascii
for($i=0;$i -lt 60;$i++){Start-Sleep -Milliseconds 400;$process.Refresh();if($process.HasExited){throw ('Service failed. Inspect '+$logRoot)};try{$h=Invoke-RestMethod ($url+'/health') -TimeoutSec 1;if($h.instanceId -eq (Get-EcuId $root)){Write-Host ('Started: '+$url);if(-not $NoBrowser){Start-Process $url};return}}catch{}}
throw ('Startup timeout. Inspect '+$logRoot)
