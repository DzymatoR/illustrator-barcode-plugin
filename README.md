# illustrator-barcode-plugin

Panel pro Adobe Illustrator (2019+), který generuje **vektorové čárové kódy** přímo do dokumentu:

- **EAN-13**: zvětšení 80–200 %, prodloužené ochranné čáry, číslice pod kódem, volitelná značka světlé zóny `>`
- **ITF-14**: poměr širokého prvku, nosné pruhy (nahoře a dole nebo rám), HRI ve skupinách 1 2 5 5 1
- **Interleaved 2/5**: volitelná kontrolní číslice, při lichém počtu číslic doplní úvodní 0
- **QR kód**: verze 1–40, korekce chyb L/M/Q/H, text i URL včetně diakritiky (UTF-8), nastavitelná světlá zóna

## Co umí

- **Trvalý panel** (Okno > Rozšíření > Čárové kódy) se živým náhledem a kontrolou vstupu.
- **Kontrolní číslice**: dopočítá ji (12 → 13 číslic) nebo ověří a ukáže správnou.
- **Jedna barva**: v CMYK dokumentu jsou čáry jen v kanálu K (0/0/0/100), bez sytě černé. Místo toho lze zvolit přímou barvu ze vzorníku dokumentu. Volitelně přetisk.
- **Vektory**: čáry tvoří jednu složenou cestu, text se volitelně převede na křivky.
- **Kontrola tisku**: rozlišení zařízení (dpi), přepočet modulu na body, zaokrouhlení modulu, BWR i poměru na celé body, korekce šířky čar (BWR) v µm.
- **Kontrola specifikace**: upozorní na modul X mimo rozsah GS1, zkrácenou výšku a poměr mimo rozsah.
- **Aktualizace**: kód si parametry ukládá do sebe. Vyber ho, změň číslo nebo nastavení a klikni na *Aktualizovat výběr*. Tlačítko ⤓ načte nastavení vybraného kódu zpět do panelu.
- Skupina obsahuje neviditelný obdélník **Světlá zóna** s rozměry kódu včetně světlých zón, takže se k němu dá přichytávat.

## Instalace pro vývoj (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Skript zapne `PlayerDebugMode` (povolí nepodepsaná rozšíření) a vytvoří odkaz
`%APPDATA%\Adobe\CEP\extensions\cz.barcodes.illustrator` → tato složka. Pak restartuj Illustrator.
Odinstalace: `uninstall.ps1`.

## Balíček pro kolegy

```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

Vytvoří `dist\carove-kody-<verze>.zip`. Kolega zip rozbalí a dvojklikem spustí `Instalovat.cmd`
(postup je v přiloženém `CTIME.txt`). Instalace panel zkopíruje do profilu uživatele a zapne
`PlayerDebugMode`, práva správce nejsou potřeba. Novou verzi nainstaluje stejně, přepíše tu starou.
Číslo verze se bere z `package.json`; stejné číslo musí být i v `CSXS/manifest.xml` a `js/about.js`
(zobrazuje se v patičce panelu), jinak `build.ps1` skončí chybou.

macOS: `defaults write com.adobe.CSXS.11 PlayerDebugMode 1` (a totéž pro 12), pak složku zkopíruj nebo nalinkuj
do `~/Library/Application Support/Adobe/CEP/extensions/`.

## Písmo

Panel nabízí všechna nainstalovaná písma s „OCR“ v názvu (např. *OCR-B-10 AT*). Volba *Automaticky* vezme
první nalezené OCR-B. Přes *Jiné…* lze zadat libovolné písmo názvem rodiny nebo PostScriptovým názvem.
Když se písmo nenajde, použije se Arial a panel to ohlásí.

## Struktura

| Soubor | Účel |
|---|---|
| `js/barcode.js` | kódování čárových kódů, kontrolní číslice, geometrie v mm, SVG náhled (bez závislosti na Illustratoru) |
| `js/qr.js` | kodér QR a převod modulů na obdélníky |
| `js/main.js` | logika panelu, uložení nastavení |
| `js/cep.js` | minimální obal nad CEP API |
| `js/about.js` | verze, autor a odkaz na návod v patičce panelu |
| `jsx/host.jsx` | ExtendScript: kreslení do dokumentu, barvy, text, aktualizace výběru |
| `CSXS/manifest.xml` | manifest CEP rozšíření |
| `test/` | testy kodérů (`npm test`) |

Ladění panelu: s `.debug` v kořeni otevři v Chrome `http://localhost:8088`. Mimo Illustrator jde
`index.html` otevřít v prohlížeči a funguje v něm náhled.

## Plán

- doplňky EAN-2 a EAN-5, EAN-8, UPC-A
- dávkové generování ze seznamu čísel
- podepsaný balíček `.zxp`
