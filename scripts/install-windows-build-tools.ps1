$ErrorActionPreference = 'Stop'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw 'Open PowerShell as Administrator, then run this script. This script does not elevate itself.' }
$setupDir = Join-Path $env:TEMP 'slide-studio-dev-setup'
New-Item -ItemType Directory -Path $setupDir -Force | Out-Null
$installer = Join-Path $setupDir 'vs_buildtools.exe'
if (-not (Test-Path -LiteralPath $installer)) {
    Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vs_buildtools.exe' -OutFile $installer -UseBasicParsing
}
$signature = Get-AuthenticodeSignature -LiteralPath $installer
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') {
    throw 'Microsoft installer signature verification failed.'
}
Write-Host 'Installing Visual Studio 2022 C++ Build Tools and Windows SDK. This may take several minutes.'
$arguments = '--quiet --wait --norestart --nocache --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.22621'
$process = Start-Process -FilePath $installer -ArgumentList $arguments -WindowStyle Hidden -PassThru -Wait
if ($process.ExitCode -notin @(0, 3010)) { throw "Build Tools installer failed: $($process.ExitCode). Check dd_* logs in TEMP." }
Write-Host "Installer exit code: $($process.ExitCode)"
if ($process.ExitCode -eq 3010) { Write-Host 'A restart is required before completing build verification.' }
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (Test-Path -LiteralPath $vswhere) {
    & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
}
