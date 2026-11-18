. (Join-Path $PSScriptRoot 'Common.ps1')
$path=Join-Path $PSScriptRoot 'data\logs\server.pid'
if(-not (Test-Path -LiteralPath $path)){Write-Host 'No process record. Nothing stopped.';return}
$serverPid=[int](Get-Content -LiteralPath $path -Raw).Trim()
$entry=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'app\dist-server\server\index.js'))
$process=Get-CimInstance Win32_Process -Filter "ProcessId=$serverPid"
if($process){if($process.Name -ne 'node.exe' -or -not $process.CommandLine.Contains($entry)){throw 'Process identity mismatch. Nothing stopped.'};Stop-Process -Id $serverPid}
Remove-Item -LiteralPath $path
Write-Host 'Stopped. Your data and queued task history are preserved.'
