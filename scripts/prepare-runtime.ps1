param([Parameter(Mandatory=$true)][string]$StageRoot)
$ErrorActionPreference='Stop'
$runtimeRoot=Join-Path ([IO.Path]::GetFullPath($StageRoot)) 'runtime'
$cacheRoot='D:\EduStudio\build-cache'
New-Item -ItemType Directory -Path $runtimeRoot,$cacheRoot -Force | Out-Null
$archiveName='node-v24.15.0-win-x64.zip'
$archivePath=Join-Path $cacheRoot $archiveName
$sums=(Invoke-WebRequest -Uri 'https://nodejs.org/dist/v24.15.0/SHASUMS256.txt' -UseBasicParsing).Content
$expected=($sums -split "`n" | Where-Object { $_ -match ('\s'+[regex]::Escape($archiveName)+'\s*$') } | Select-Object -First 1).Trim().Split(' ')[0]
if(-not $expected -or $expected -notmatch '^[a-f0-9]{64}$'){throw 'Official Node checksum unavailable'}
if(-not (Test-Path -LiteralPath $archivePath) -or (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected){Invoke-WebRequest -Uri ('https://nodejs.org/dist/v24.15.0/'+$archiveName) -OutFile $archivePath -UseBasicParsing}
if((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected){throw 'Node archive checksum mismatch'}
$nodeRoot=Join-Path $runtimeRoot 'node'
if(-not (Test-Path -LiteralPath (Join-Path $nodeRoot 'node.exe'))){
  $unpackRoot=Join-Path $cacheRoot ('node-unpack-'+[guid]::NewGuid().ToString())
  Expand-Archive -LiteralPath $archivePath -DestinationPath $unpackRoot
  New-Item -ItemType Directory -Path $nodeRoot -Force | Out-Null
  Copy-Item -Path (Join-Path $unpackRoot 'node-v24.15.0-win-x64\*') -Destination $nodeRoot -Recurse -Force
}
$appStage=Join-Path $StageRoot 'app'
New-Item -ItemType Directory -Path $appStage -Force | Out-Null
$appRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Copy-Item -LiteralPath (Join-Path $appRoot 'package.json'),(Join-Path $appRoot 'package-lock.json') -Destination $appStage -Force
$nodeFile=Join-Path $nodeRoot 'node.exe'
$npmFile=Join-Path $nodeRoot 'node_modules\npm\bin\npm-cli.js'
Push-Location $appStage
try {
  $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD='1'
  & $nodeFile $npmFile ci --omit=dev --ignore-scripts --no-audit --no-fund
  if($LASTEXITCODE -ne 0){throw 'Production dependency installation failed'}
  $env:PLAYWRIGHT_BROWSERS_PATH=Join-Path $runtimeRoot 'browsers'
  & $nodeFile (Join-Path $appStage 'node_modules\playwright\cli.js') install chromium --only-shell
  if($LASTEXITCODE -ne 0){throw 'PDF browser download failed'}
  & $nodeFile --input-type=module -e "import {createCanvas} from '@napi-rs/canvas'; const c=createCanvas(40,40); if(!c.toBuffer('image/png').length)process.exit(1); console.log('Native image runtime verified.');"
  if($LASTEXITCODE -ne 0){throw 'Native image runtime verification failed'}
} finally {Pop-Location}
@{nodeVersion='24.15.0';nodeArchive=$archiveName;nodeArchiveSha256=$expected;platform='win32-x64';preparedAt=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeRoot 'provenance.json') -Encoding UTF8
