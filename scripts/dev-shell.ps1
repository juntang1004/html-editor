# Dot-source this file: . .\scripts\dev-shell.ps1
# Changes apply only to the current shell. Build caches stay outside OneDrive.
$cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
if (Test-Path -LiteralPath $cargoBin) { $env:PATH = $cargoBin + ';' + $env:PATH }
$env:CARGO_TARGET_DIR = Join-Path $env:LOCALAPPDATA 'SlideStudioDev\cargo-target'
Write-Host "Rust build cache: $env:CARGO_TARGET_DIR"
