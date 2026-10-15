# Builds dist/todolist-<version>.zip. Use -SkipTests to skip the test run.
param([switch]$SkipTests)

$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root

$version = (Get-Content -Raw -Path 'package.json' | ConvertFrom-Json).version
$name = "todolist-$version"
$dist = Join-Path $root 'dist'
$stage = Join-Path $dist $name
$archive = Join-Path $dist "$name.zip"

if (-not $SkipTests) {
    Write-Host '==> Running tests (with the coverage gate)'
    npm run test:coverage
    if ($LASTEXITCODE -ne 0) { throw "Tests failed (exit code $LASTEXITCODE)" }
}

Write-Host "==> Staging $name"
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
if (Test-Path $archive) { Remove-Item -Force $archive }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

foreach ($dir in 'backend', 'db', 'CSS', 'JS', 'assets') {
    Copy-Item -Recurse -Path $dir -Destination $stage
}
foreach ($file in 'index.html', 'package.json', 'package-lock.json', 'Dockerfile', 'docker-compose.yml', '.dockerignore', 'README.md', 'LICENSE') {
    Copy-Item -Path $file -Destination $stage
}

Write-Host "==> Creating $archive"
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $archive, [System.IO.Compression.CompressionLevel]::Optimal, $true)

Remove-Item -Recurse -Force $stage
Write-Host "==> Built $archive"
