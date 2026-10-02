# Run only on the disposable GitHub Actions runner; never uninstall a user's installation.
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Installer acceptance requires an isolated CI runner.' }
$acceptRoot = Join-Path $env:RUNNER_TEMP 'wenshu-installer-acceptance'
New-Item -ItemType Directory -Path $acceptRoot -Force | Out-Null
$installDir = Join-Path $acceptRoot 'installed'
$installer = (Resolve-Path 'dist/0.5.0/Wenshu-0.5.0-Setup-x64.exe').Path
$installed = Start-Process -FilePath $installer -ArgumentList @('/S',"/D=$installDir") -Wait -PassThru -WindowStyle Hidden
if ($installed.ExitCode -ne 0) { throw 'Installer failed' }
$appExecutable = Join-Path $installDir '文枢.exe'
if (!(Test-Path -LiteralPath $appExecutable)) { throw 'Installed executable missing' }
& node scripts/smoke-desktop.mjs $appExecutable
if ($LASTEXITCODE -ne 0) { throw 'Installed application did not start' }
# Reinstallation must preserve the user's data directory.
$userDataDir = Join-Path $env:APPDATA 'Wenshu\workspace'
New-Item -ItemType Directory -Force $userDataDir | Out-Null
$sentinelFile = Join-Path $userDataDir 'acceptance-sentinel.txt'
Set-Content -LiteralPath $sentinelFile -Value 'keep'
$reinstalled = Start-Process -FilePath $installer -ArgumentList @('/S',"/D=$installDir") -Wait -PassThru -WindowStyle Hidden
if ($reinstalled.ExitCode -ne 0 -or !(Test-Path -LiteralPath $sentinelFile)) { throw 'Reinstall did not preserve data' }
$uninstaller = Get-ChildItem -LiteralPath $installDir -File | Where-Object { $_.Name -like '*Uninstall*.exe' -or $_.Name -like '*卸载*.exe' } | Select-Object -First 1
if (!$uninstaller) { throw 'Uninstaller missing' }
$removed = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -Wait -PassThru -WindowStyle Hidden
if ($removed.ExitCode -ne 0 -or !(Test-Path -LiteralPath $sentinelFile)) { throw 'Uninstall did not preserve data' }
Write-Output 'Installer, reinstall, startup and retained-data uninstall checks passed.'
