param([Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$appRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$projectRoot = (Resolve-Path (Join-Path $appRoot '..')).Path
$stageRoot = Join-Path $appRoot ('test-results\release-' + [Guid]::NewGuid().ToString())
$stageApp = Join-Path $stageRoot 'app'
New-Item -ItemType Directory -Path $stageApp -Force | Out-Null
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
foreach ($folder in @('server','web','shared','migrations','skills','tests','scripts','docs','public','dist','dist-server')) {
  Copy-Item -LiteralPath (Join-Path $appRoot $folder) -Destination $stageApp -Recurse
}
foreach ($file in @('package.json','package-lock.json','tsconfig.json','tsconfig.server.json','vite.config.ts','README.md','.env.example','.gitignore')) {
  Copy-Item -LiteralPath (Join-Path $appRoot $file) -Destination $stageApp
}
foreach ($file in @('Start-EcuStudio.ps1','Stop-EcuStudio.ps1','Start-EcuStudio.cmd','Stop-EcuStudio.cmd')) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination $stageRoot
}
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs') -Destination $stageRoot -Recurse
$evidence = Join-Path $stageRoot 'test-evidence'
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
foreach ($file in @('core-test.log','e2e-test.log','e2e-result.json','dependency-audit.json','live-import.json','live-monitor.json')) {
  Copy-Item -LiteralPath (Join-Path $appRoot ('test-results\' + $file)) -Destination $evidence
}
foreach ($folder in @('production','office-render','word-pages','pdf-pages','screens')) {
  Copy-Item -LiteralPath (Join-Path $appRoot ('test-results\' + $folder)) -Destination $evidence -Recurse
}
$manifest = @(Get-ChildItem -LiteralPath $stageRoot -File -Recurse | ForEach-Object {
  [PSCustomObject]@{path=$_.FullName.Substring($stageRoot.Length+1).Replace('\','/');bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}
})
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $stageRoot 'manifest.json') -Encoding UTF8
$archive = Join-Path $OutputDirectory 'EcuStudio-source-0.1.0.zip'
Compress-Archive -Path (Join-Path $stageRoot '*') -DestinationPath $archive -Force
Copy-Item -LiteralPath (Join-Path $appRoot 'README.md') -Destination $OutputDirectory -Force
Copy-Item -LiteralPath (Join-Path $appRoot 'docs\ACCEPTANCE_REPORT.md') -Destination $OutputDirectory -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs') -Destination $OutputDirectory -Recurse -Force
Copy-Item -LiteralPath (Join-Path $appRoot 'test-results\production\dashboard.png') -Destination (Join-Path $OutputDirectory 'dashboard.png') -Force
[PSCustomObject]@{archive=$archive;files=$manifest.Count;bytes=(Get-Item -LiteralPath $archive).Length;sha256=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash} | ConvertTo-Json | Tee-Object -FilePath (Join-Path $OutputDirectory 'release.json')
