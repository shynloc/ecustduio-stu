param([Parameter(Mandatory=$true)][string]$OutputDirectory,[string]$StageRoot='D:\EduStudio\release-staging\EcuStudio-0.2.0-Windows-x64')
$ErrorActionPreference='Stop'
$appRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$stage=[IO.Path]::GetFullPath($StageRoot);$appStage=Join-Path $stage 'app'
if(-not (Test-Path -LiteralPath (Join-Path $stage 'runtime\node\node.exe'))){throw 'Run prepare-runtime.ps1 first.'}
New-Item -ItemType Directory -Path $appStage,$OutputDirectory -Force | Out-Null
foreach($folder in @('server','web','shared','migrations','skills','tests','public','dist','dist-server')){Copy-Item -LiteralPath (Join-Path $appRoot $folder) -Destination $appStage -Recurse -Force}
foreach($file in @('package.json','package-lock.json','tsconfig.json','tsconfig.server.json','vite.config.ts','README.md','.env.example','.gitignore')){Copy-Item -LiteralPath (Join-Path $appRoot $file) -Destination $appStage -Force}
$scripts=Join-Path $appStage 'scripts';New-Item -ItemType Directory -Path $scripts -Force | Out-Null
foreach($file in @('windows-ocr.ps1','diagnose-runtime.mjs','customer-selftest.mjs','authenticated-session.ts')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination $scripts -Force}
Get-ChildItem -LiteralPath (Join-Path $appRoot 'deployment') -File | Copy-Item -Destination $stage -Force
$devDocs=Join-Path $stage 'docs\development';New-Item -ItemType Directory -Path $devDocs -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $appRoot '..\docs') -Destination (Join-Path $stage 'docs') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $appRoot 'docs') -Destination $devDocs -Recurse -Force
Push-Location $appRoot
try{& node (Join-Path $PSScriptRoot 'finish-release.mjs') $stage ([IO.Path]::GetFullPath($OutputDirectory));if($LASTEXITCODE -ne 0){throw 'Release manifest generation failed'}}finally{Pop-Location}
$archive=Join-Path ([IO.Path]::GetFullPath($OutputDirectory)) 'EcuStudio-0.2.0-Windows-x64.zip'
if(Test-Path -LiteralPath $archive){throw 'Archive already exists; choose another output folder.'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($stage,$archive,[IO.Compression.CompressionLevel]::Fastest,$false)
$digest=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
($digest+'  '+[IO.Path]::GetFileName($archive)) | Set-Content -LiteralPath ($archive+'.sha256') -Encoding Ascii
@{version='0.2.0';archive=[IO.Path]::GetFileName($archive);bytes=(Get-Item -LiteralPath $archive).Length;sha256=$digest;createdAt=(Get-Date).ToUniversalTime().ToString('o');validation='Build, package integrity and basic startup only; complete user validation is supplied.'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $OutputDirectory 'release.json') -Encoding UTF8
Write-Host ('Delivery ZIP ready: '+$archive)
