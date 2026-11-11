# Odebere panel z Illustratoru. Zdrojová složka (u odkazu) zůstane. PlayerDebugMode nechává beze změny.
$dst = Join-Path $env:APPDATA 'Adobe\CEP\extensions\cz.barcodes.illustrator'
if (Test-Path $dst) {
    $item = Get-Item $dst -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        cmd /c rmdir "$dst" | Out-Null
    } else {
        Remove-Item $dst -Recurse -Force
    }
    Write-Host "Odebráno: $dst"
} else { Write-Host 'Panel není nainstalovaný.' }
