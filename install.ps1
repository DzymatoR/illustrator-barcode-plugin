# Instalace panelu „Čárové kódy“ do Illustratoru (Windows, bez práv správce).
#  1) povolí nepodepsaná CEP rozšíření (PlayerDebugMode) pro CSXS 9–12
#  2) -Copy : zkopíruje panel do %APPDATA%\Adobe\CEP\extensions (pro kolegy, ze zipu)
#     jinak : vytvoří tam odkaz (junction) na tuto složku (pro vývoj)
# Po instalaci restartuj Illustrator: Okno > Rozšíření > Čárové kódy
param([switch]$Copy)
$ErrorActionPreference = 'Stop'
$id = 'cz.barcodes.illustrator'
$src = $PSScriptRoot
$extDir = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$dst = Join-Path $extDir $id
$items = 'CSXS', 'css', 'js', 'jsx', 'index.html'

foreach ($i in $items) {
    if (-not (Test-Path (Join-Path $src $i))) { throw "Chybí $i – spusť instalaci z rozbalené složky." }
}

foreach ($v in 9..12) {
    $key = "HKCU:\Software\Adobe\CSXS.$v"
    if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
    Set-ItemProperty -Path $key -Name PlayerDebugMode -Value '1' -Type String
}
Write-Host 'PlayerDebugMode = 1 (CSXS.9-12)'

New-Item -ItemType Directory -Force -Path $extDir | Out-Null
if (Test-Path $dst) {
    $item = Get-Item $dst -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        cmd /c rmdir "$dst" | Out-Null      # jen odkaz, cíl zůstane
    } elseif ($Copy) {
        Remove-Item $dst -Recurse -Force     # předchozí zkopírovaná verze
    } else {
        throw "$dst už existuje a není to odkaz – odstraň ho ručně, nebo použij -Copy."
    }
}

if ($Copy) {
    New-Item -ItemType Directory -Force -Path $dst | Out-Null
    foreach ($i in $items) { Copy-Item (Join-Path $src $i) -Destination $dst -Recurse -Force }
    Write-Host "Zkopírováno do: $dst"
} else {
    cmd /c mklink /J "$dst" "$src" | Out-Null
    Write-Host "Odkaz: $dst -> $src"
}
Write-Host 'Hotovo. Restartuj Illustrator a otevři Okno > Rozšíření > Čárové kódy.'
