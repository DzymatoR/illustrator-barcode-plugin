# Vývoj

Uživatelský návod je v [README.md](README.md). Tady jsou informace pro úpravy pluginu.

Plugin je rozšíření CEP: panel v HTML/JS a ExtendScript, který kreslí do dokumentu. Kódování a
výpočet geometrie běží v panelu (dá se testovat v Node), ExtendScript dostane hotové obdélníky v mm.

## Instalace pro vývoj (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Skript zapne `PlayerDebugMode` (povolí nepodepsaná rozšíření) a vytvoří odkaz
`%APPDATA%\Adobe\CEP\extensions\cz.barcodes.illustrator` → tato složka. Změny v souborech se projeví
po zavření a otevření panelu. Odinstalace: `uninstall.ps1`.

macOS: `defaults write com.adobe.CSXS.11 PlayerDebugMode 1` (a totéž pro 12), pak složku zkopíruj nebo
nalinkuj do `~/Library/Application Support/Adobe/CEP/extensions/`.

## Balíček a vydání

```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

Vytvoří `dist\carove-kody-<verze>.zip` s panelem, instalačními skripty a `CTIME.txt`.

Číslo verze se bere z `package.json`. Stejné číslo musí být i v `CSXS/manifest.xml` a `js/about.js`
(zobrazuje se v patičce panelu), jinak `build.ps1` skončí chybou.

Vydání: zvýšit verzi na všech třech místech, spustit `build.ps1` a zip přiložit k novému release na GitHubu.

## Struktura

| Soubor | Účel |
|---|---|
| `js/barcode.js` | kódování čárových kódů, kontrolní číslice, geometrie v mm, SVG náhled |
| `js/qr.js` | kodér QR a převod modulů na obdélníky |
| `js/main.js` | logika panelu, uložení nastavení |
| `js/cep.js` | minimální obal nad CEP API |
| `js/about.js` | verze, autor a odkaz na návod v patičce panelu |
| `jsx/host.jsx` | ExtendScript: kreslení do dokumentu, barvy, text, aktualizace výběru |
| `CSXS/manifest.xml` | manifest CEP rozšíření |
| `test/` | testy kodérů |
| `docs/` | obrázky do návodu |

`jsx/host.jsx` a skripty `.ps1` musí zůstat v UTF-8 s BOM, jinak ExtendScript a PowerShell 5.1 pokazí diakritiku.

## Testy a ladění

```powershell
npm test
```

Testy pokrývají kodéry a výpočet rozměrů. Kreslení v Illustratoru se testuje ručně.

Ladění panelu: se souborem `.debug` v kořeni otevři v Chrome `http://localhost:8088`. Mimo Illustrator
jde `index.html` otevřít v prohlížeči a funguje v něm náhled.

## Plán

- EAN-8, UPC-A, doplňky EAN-2 a EAN-5
- dávkové generování ze seznamu čísel
- podepsaný balíček `.zxp`
