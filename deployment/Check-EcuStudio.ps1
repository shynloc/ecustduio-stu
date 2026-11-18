param([switch]$Repair,[switch]$DeepTest)
. (Join-Path $PSScriptRoot 'Common.ps1')
$cfg=Get-EcuConfig $PSScriptRoot;Set-EcuEnvironment $PSScriptRoot $cfg
$node=Get-EcuNode $PSScriptRoot
Push-Location (Join-Path $PSScriptRoot 'app')
try{
 & $node scripts/diagnose-runtime.mjs
 if($LASTEXITCODE -ne 0 -and $Repair){& $node (Join-Path $PSScriptRoot 'runtime\node\node_modules\npm\bin\npm-cli.js') ci --omit=dev --ignore-scripts --no-audit --no-fund;& $node node_modules/playwright/cli.js install chromium --only-shell;& $node scripts/diagnose-runtime.mjs}
 if($LASTEXITCODE -ne 0){throw 'Runtime check failed.'}
 if($DeepTest){& $node scripts/customer-selftest.mjs;if($LASTEXITCODE -ne 0){throw 'Deep test failed; see data/selftest evidence.'}}
}finally{Pop-Location}
