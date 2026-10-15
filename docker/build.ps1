<#
.SYNOPSIS
    Build the gym image and package it for a server.

.DESCRIPTION
    Builds the image -- which runs the test suite against the compiled
    backend -- tags it gym:<version> and gym:latest, and fills
    release\gym-<version>\ with what a server needs: the image as a
    .tar.gz, compose.yaml, gym.env.example and DEPLOY.md. Copy that folder
    to the server; the source code never leaves this machine.

.EXAMPLE
    .\docker\build.ps1 1.0.0

.EXAMPLE
    .\docker\build.ps1 1.0.1 -SkipTests
#>
param(
    [Parameter(Mandatory = $true)][string] $Version,
    [switch] $SkipTests
)

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "release\gym-$Version"

$buildArgs = @("build", "--tag", "gym:$Version", "--tag", "gym:latest")
if ($SkipTests) { $buildArgs += @("--build-arg", "SKIP_TESTS=1") }
& docker @buildArgs $root
if ($LASTEXITCODE -ne 0) { Write-Error "docker build failed"; exit 1 }

New-Item -ItemType Directory -Force -Path $out | Out-Null
$tar = Join-Path $out "gym-$Version.tar"
& docker save --output $tar "gym:$Version" "gym:latest"
if ($LASTEXITCODE -ne 0) { Write-Error "docker save failed"; exit 1 }

# Gzipped, it's about a third of the size to upload, and `docker load`
# reads it as it is. (PowerShell has no gzip command, hence .NET.)
Write-Host "Compressing $tar.gz"
$source = [IO.File]::OpenRead($tar)
$target = [IO.File]::Create("$tar.gz")
$gzip = New-Object IO.Compression.GZipStream($target, [IO.Compression.CompressionLevel]::Optimal)
try { $source.CopyTo($gzip) } finally { $gzip.Dispose(); $target.Dispose(); $source.Dispose() }
Remove-Item $tar

Copy-Item -Path (Join-Path $PSScriptRoot "compose.yaml"), (Join-Path $PSScriptRoot "gym.env.example"), (Join-Path $root "DEPLOY.md") -Destination $out
Write-Host "Ready: $out"
