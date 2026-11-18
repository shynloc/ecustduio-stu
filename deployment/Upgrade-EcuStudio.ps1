param([string]$InstallDir='', [switch]$NoBrowser, [switch]$Recover)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Common.ps1')
function Test-EcuInstall([string]$Path) {
  return $Path -and (Test-Path -LiteralPath (Join-Path $Path 'data\app.sqlite')) -and (Test-Path -LiteralPath (Join-Path $Path 'app\package.json')) -and (Test-Path -LiteralPath (Join-Path $Path 'ecustudio.json'))
}
try {
  if(-not $InstallDir){
    $candidates=@((Join-Path $env:LOCALAPPDATA 'EcuStudio'),'D:\EduStudio')
    # Find custom installations from the existing per-user startup shortcuts.
    $startup=[Environment]::GetFolderPath('Startup')
    if(Test-Path -LiteralPath $startup){
      $shell=New-Object -ComObject WScript.Shell
      foreach($link in (Get-ChildItem -LiteralPath $startup -Filter 'EcuStudio-*.lnk' -File)){
        $shortcut=$shell.CreateShortcut($link.FullName)
        if($shortcut.WorkingDirectory){$candidates+=$shortcut.WorkingDirectory}
      }
    }
    # Existing running service paths also identify non-default installs.
    foreach($process in (Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue)){
      if($process.CommandLine -match '"([^"\r\n]+)\\app\\dist-server\\server\\index\.js"'){$candidates+=$Matches[1]}
    }
    $found=@($candidates | Where-Object {Test-EcuInstall $_} | ForEach-Object {[IO.Path]::GetFullPath($_).TrimEnd('\')} | Sort-Object -Unique)
    if($found.Count -eq 1){$InstallDir=$found[0]}
    elseif($found.Count -gt 1){
      Write-Host 'Multiple workbench installations found. Select the one to upgrade:'
      for($i=0;$i -lt $found.Count;$i++){Write-Host ('['+($i+1)+'] '+$found[$i])}
      $choice=Read-Host 'Installation number'
      $selected=0;if(-not [int]::TryParse($choice,[ref]$selected) -or $selected -lt 1 -or $selected -gt $found.Count){throw 'No valid installation selected.'}
      $InstallDir=$found[$selected-1]
    } else {$InstallDir=(Read-Host 'Original installation folder (contains app and data; do not enter the new ZIP folder)').Trim('"')}
  }
  if(-not (Test-EcuInstall $InstallDir)){throw 'Original installation not found. Use the folder containing app, data and ecustudio.json.'}
  $target=[IO.Path]::GetFullPath($InstallDir)
  $node=Get-EcuNode $target
  $arguments=@((Join-Path $PSScriptRoot 'upgrade.mjs'),'--source',$PSScriptRoot,'--target',$target)
  if($NoBrowser){$arguments+='--no-browser'};if($Recover){$arguments+='--recover'}
  Write-Host ('Original installation: '+$target)
  Write-Host 'Keep this window open. Existing accounts, materials and credentials are retained.'
  & $node @arguments
  if($LASTEXITCODE -ne 0){throw 'Upgrade/recovery did not complete. Read the message above; the backup path is recorded under data\upgrade-backups.'}
} catch {Write-Error $_.Exception.Message;exit 1}
