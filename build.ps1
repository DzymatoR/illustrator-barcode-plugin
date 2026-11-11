# Vytvoří dist\carove-kody-<verze>.zip pro kolegy: rozbalit a spustit Instalovat.cmd.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$version = (Get-Content (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
$name = "carove-kody-$version"

# číslo verze musí být stejné v package.json, v manifestu i v patičce panelu
$manifest = Get-Content (Join-Path $root 'CSXS\manifest.xml') -Raw -Encoding UTF8
$about = Get-Content (Join-Path $root 'js\about.js') -Raw -Encoding UTF8
if ($manifest -notmatch "ExtensionBundleVersion=`"$([regex]::Escape($version))`"") { throw "CSXS\manifest.xml nemá verzi $version." }
if ($about -notmatch "version: '$([regex]::Escape($version))'") { throw "js\about.js nemá verzi $version." }
$dist = Join-Path $root 'dist'
$stage = Join-Path $dist $name
$zip = Join-Path $dist "$name.zip"

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
if (Test-Path $zip) { Remove-Item $zip -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

foreach ($i in 'CSXS', 'css', 'js', 'jsx', 'index.html', 'install.ps1', 'uninstall.ps1', 'Instalovat.cmd', 'Odinstalovat.cmd', 'CTIME.txt') {
    Copy-Item (Join-Path $root $i) -Destination $stage -Recurse -Force
}
Compress-Archive -Path $stage -DestinationPath $zip
Remove-Item $stage -Recurse -Force
Write-Host "Hotovo: $zip"
