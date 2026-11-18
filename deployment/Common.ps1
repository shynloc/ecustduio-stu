$ErrorActionPreference='Stop'
function Get-EcuConfig([string]$Root) {
  $path=Join-Path $Root 'ecustudio.json'
  if(Test-Path -LiteralPath $path){return Get-Content -LiteralPath $path -Raw | ConvertFrom-Json}
  return [pscustomobject]@{port=37891;networkMode='lan'}
}
function Get-EcuNode([string]$Root) {
  $bundled=Join-Path $Root 'runtime\node\node.exe'
  if(Test-Path -LiteralPath $bundled){return $bundled}
  $cmd=Get-Command node -ErrorAction SilentlyContinue
  if($cmd){$version=& $cmd.Source -p 'process.versions.node';if($version -match '^24\.' -and [version]$version -ge [version]'24.15.0'){return $cmd.Source}}
  throw 'Node runtime missing. Run Install-EcuStudio.cmd from the complete delivery package.'
}
function Set-EcuEnvironment([string]$Root,$Config) {
  $env:ECUSTUDIO_DATA_DIR=Join-Path $Root 'data'
  $env:PORT=[string]$Config.port
  $env:ECUSTUDIO_NETWORK_MODE=$Config.networkMode
  $browser=Join-Path $Root 'runtime\browsers'
  New-Item -ItemType Directory -Path $browser -Force | Out-Null
  $env:PLAYWRIGHT_BROWSERS_PATH=$browser
}
function Repair-EcuNode([string]$Root) {
  $cache=Join-Path $Root 'data\setup-cache';New-Item -ItemType Directory -Path $cache -Force | Out-Null
  $name='node-v24.15.0-win-x64.zip';$zip=Join-Path $cache $name
  $sums=(Invoke-WebRequest 'https://nodejs.org/dist/v24.15.0/SHASUMS256.txt' -UseBasicParsing).Content
  $line=$sums -split "`n" | Where-Object {$_ -match ('\s'+[regex]::Escape($name)+'\s*$')} | Select-Object -First 1
  if(-not $line){throw 'Official Node checksum unavailable'};$expected=$line.Trim().Split(' ')[0]
  Invoke-WebRequest ('https://nodejs.org/dist/v24.15.0/'+$name) -OutFile $zip -UseBasicParsing
  if((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected){throw 'Node checksum mismatch'}
  $unpack=Join-Path $cache ('unpack-'+[guid]::NewGuid().ToString());Expand-Archive -LiteralPath $zip -DestinationPath $unpack
  $nodeDir=Join-Path $Root 'runtime\node';New-Item -ItemType Directory -Path $nodeDir -Force | Out-Null
  Copy-Item -Path (Join-Path $unpack 'node-v24.15.0-win-x64\*') -Destination $nodeDir -Recurse -Force
}
function Get-EcuId([string]$Root) {
  $sha=[Security.Cryptography.SHA256]::Create()
  try{return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes([IO.Path]::GetFullPath((Join-Path $Root 'data'))))).Replace('-','').ToLowerInvariant()).Substring(0,16)}finally{$sha.Dispose()}
}
function Test-EcuPort([int]$Port) {
  $listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Any,$Port)
  try{$listener.Start();return $true}catch{return $false}finally{$listener.Stop()}
}
