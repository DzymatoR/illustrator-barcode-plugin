/*
 * Kódování čárových kódů a výpočet geometrie.
 * Bez závislostí na Illustratoru – běží v CEP panelu i v Node (testy).
 *
 * Výstup encoderu (v modulech X):
 *   { symbology, data, hri, bars: [{x, w, guard}], width, quietLeft, quietRight, textSlots }
 * Výstup layoutu (v mm, počátek vlevo nahoře včetně světlé zóny, y roste dolů):
 *   { rects: [[x,y,w,h]], texts: [{s,x,top,size}], width, height, warnings }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./qr.js'));
  else root.Barcode = factory(root.QR);
})(typeof self !== 'undefined' ? self : this, function (QR) {
  'use strict';

  // ---------- kontrolní číslice ----------

  /** GS1 modulo 10 (váhy 3,1,3,... zprava). Platí pro EAN-13, ITF-14, I2/5. */
  function gs1CheckDigit(digits) {
    let sum = 0;
    for (let i = digits.length - 1, w = 3; i >= 0; i--, w = 4 - w) {
      sum += (digits.charCodeAt(i) - 48) * w;
    }
    return String((10 - (sum % 10)) % 10);
  }

  function onlyDigits(s) {
    return /^[0-9]+$/.test(s);
  }

  class BarcodeError extends Error {}

  /**
   * Doplní nebo ověří kontrolní číslici pro kódy s pevnou délkou.
   * mode: 'auto' (doplní při délce n-1, ověří při délce n), 'verify' (vyžaduje délku n),
   *       'ignore' (délka n, kontrolní číslice se neověřuje).
   */
  function resolveFixed(input, n, mode, name) {
    const s = String(input || '').replace(/\s+/g, '');
    if (!s) throw new BarcodeError('Zadej číslo.');
    if (!onlyDigits(s)) throw new BarcodeError(name + ' smí obsahovat jen číslice.');
    const warnings = [];
    if (s.length === n - 1 && mode !== 'verify' && mode !== 'ignore') {
      return { data: s + gs1CheckDigit(s), warnings, computed: true };
    }
    if (s.length !== n) {
      const need = mode === 'auto' ? `${n - 1} nebo ${n}` : `${n}`;
      throw new BarcodeError(`${name} potřebuje ${need} číslic (zadáno ${s.length}).`);
    }
    if (mode !== 'ignore') {
      const ok = gs1CheckDigit(s.slice(0, -1));
      if (ok !== s[n - 1]) {
        throw new BarcodeError(`Chybná kontrolní číslice: ${s[n - 1]}, správně má být ${ok} (${s.slice(0, -1)}${ok}).`);
      }
    }
    return { data: s, warnings, computed: false };
  }

  // ---------- EAN-13 ----------

  const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011',
    '0110001', '0101111', '0111011', '0110111', '0001011'];
  const EAN_R = EAN_L.map(p => p.replace(/./g, c => (c === '0' ? '1' : '0')));
  const EAN_G = EAN_R.map(p => p.split('').reverse().join(''));
  const EAN_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
    'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

  /** Převede binární řetězec modulů na pruhy (sloučené sousední '1'). */
  function runsFromBits(bits, offset, guardMask) {
    const bars = [];
    let i = 0;
    while (i < bits.length) {
      if (bits[i] === '1') {
        let j = i;
        while (j < bits.length && bits[j] === '1') j++;
        bars.push({ x: offset + i, w: j - i, guard: guardMask ? guardMask[i] === '1' : false });
        i = j;
      } else i++;
    }
    return bars;
  }

  function encodeEAN13(input, opts) {
    const r = resolveFixed(input, 13, opts.checkDigit, 'EAN-13');
    const d = r.data;
    const parity = EAN_PARITY[+d[0]];
    let bits = '101';
    let guard = '111';
    for (let i = 1; i <= 6; i++) {
      bits += (parity[i - 1] === 'L' ? EAN_L : EAN_G)[+d[i]];
      guard += '0000000';
    }
    bits += '01010';
    guard += '11111';
    for (let i = 7; i <= 12; i++) {
      bits += EAN_R[+d[i]];
      guard += '0000000';
    }
    bits += '101';
    guard += '111';

    const quietLeft = 11, quietRight = 7;
    const bars = runsFromBits(bits, quietLeft, guard);
    // pozice číslic (středy v modulech od levého okraje světlé zóny)
    const textSlots = [{ s: d[0], x: quietLeft - 4, under: 'left-margin' }];
    for (let i = 1; i <= 6; i++) textSlots.push({ s: d[i], x: quietLeft + 3 + (i - 1) * 7 + 3.5 });
    for (let i = 7; i <= 12; i++) textSlots.push({ s: d[i], x: quietLeft + 3 + 42 + 5 + (i - 7) * 7 + 3.5 });

    return {
      symbology: 'EAN13', data: d, hri: d, bars, width: quietLeft + 95 + quietRight,
      quietLeft, quietRight, textSlots, warnings: r.warnings, checkComputed: r.computed,
    };
  }

  // ---------- Interleaved 2 of 5 / ITF-14 ----------

  const I25 = ['nnwwn', 'wnnnw', 'nwnnw', 'wwnnn', 'nnwnw',
    'wnwnn', 'nwwnn', 'nnnww', 'wnnwn', 'nwnwn'];

  /** Vrátí pruhy I2/5 pro sudý počet číslic; ratio = šířka širokého prvku v modulech. */
  function i25Bars(d, ratio, quiet) {
    // sekvence prvků: střídavě čára/mezera, začíná čárou
    const els = ['n', 'n', 'n', 'n']; // start
    for (let i = 0; i < d.length; i += 2) {
      const a = I25[+d[i]], b = I25[+d[i + 1]];
      for (let k = 0; k < 5; k++) els.push(a[k], b[k]);
    }
    els.push('w', 'n', 'n'); // stop
    const bars = [];
    let x = quiet;
    els.forEach((e, idx) => {
      const w = e === 'w' ? ratio : 1;
      if (idx % 2 === 0) bars.push({ x, w, guard: false });
      x += w;
    });
    return { bars, symbolWidth: x - quiet };
  }

  function encodeITF14(input, opts) {
    const r = resolveFixed(input, 14, opts.checkDigit, 'ITF-14');
    const ratio = opts.ratio || 2.5;
    const quiet = 10;
    const { bars, symbolWidth } = i25Bars(r.data, ratio, quiet);
    const d = r.data;
    // GS1 doporučuje HRI ve skupinách: 1 2 5 5 1
    const hri = `${d[0]} ${d.slice(1, 3)} ${d.slice(3, 8)} ${d.slice(8, 13)} ${d[13]}`;
    return {
      symbology: 'ITF14', data: d, hri, bars, width: quiet * 2 + symbolWidth,
      quietLeft: quiet, quietRight: quiet, textSlots: null, warnings: r.warnings, checkComputed: r.computed,
    };
  }

  function encodeI25(input, opts) {
    let s = String(input || '').replace(/\s+/g, '');
    if (!s) throw new BarcodeError('Zadej číslo.');
    if (!onlyDigits(s)) throw new BarcodeError('Interleaved 2/5 smí obsahovat jen číslice.');
    const warnings = [];
    let computed = false;
    if (opts.checkDigit === 'add') {
      s += gs1CheckDigit(s);
      computed = true;
    }
    if (s.length % 2) {
      s = '0' + s;
      warnings.push('Lichý počet číslic – doplněna úvodní 0.');
    }
    const ratio = opts.ratio || 2.5;
    const quiet = 10;
    const { bars, symbolWidth } = i25Bars(s, ratio, quiet);
    return {
      symbology: 'I25', data: s, hri: s, bars, width: quiet * 2 + symbolWidth,
      quietLeft: quiet, quietRight: quiet, textSlots: null, warnings, checkComputed: computed,
    };
  }

  // ---------- specifikace a výchozí hodnoty ----------

  const SPECS = {
    EAN13: {
      name: 'EAN-13', encode: encodeEAN13,
      xNominal: 0.33, xMin: 0.264, xMax: 0.66, heightNominal: 22.85, guardExt: 5,
      checkModes: ['auto', 'verify', 'ignore'], hasRatio: false, hasBearer: false,
    },
    ITF14: {
      name: 'ITF-14', encode: encodeITF14,
      xNominal: 1.016, xMin: 0.495, xMax: 1.016, heightNominal: 31.75, heightMin: 31.75,
      ratioMin: 2.25, ratioMax: 3.0,
      checkModes: ['auto', 'verify', 'ignore'], hasRatio: true, hasBearer: true,
    },
    I25: {
      name: 'Interleaved 2/5', encode: encodeI25,
      xNominal: 0.5, xMin: 0.19, xMax: 2, heightNominal: 15,
      ratioMin: 2.0, ratioMax: 3.0,
      checkModes: ['none', 'add'], hasRatio: true, hasBearer: true,
    },
    QR: {
      name: 'QR', is2D: true,
      xNominal: 0.5, xMin: 0.25, xMax: 10,
      checkModes: [], hasRatio: false, hasBearer: false,
    },
  };

  function encode(symbology, input, opts) {
    const spec = SPECS[symbology];
    if (!spec || !spec.encode) throw new BarcodeError('Neznámý typ kódu: ' + symbology);
    return spec.encode(input, opts || {});
  }

  // ---------- rozlišení zařízení ----------

  /** Informace o modulu vůči rozlišení výstupního zařízení. */
  function dpiInfo(xMm, dpi) {
    if (!dpi || dpi <= 0) return null;
    const dots = (xMm * dpi) / 25.4;
    const rounded = Math.max(1, Math.round(dots));
    return {
      dots,
      integer: Math.abs(dots - rounded) < 1e-3,
      rounded,
      snappedMm: (rounded * 25.4) / dpi,
      dotMm: 25.4 / dpi,
    };
  }

  function snapToDots(mm, dpi) {
    if (!dpi || dpi <= 0) return mm;
    const dot = 25.4 / dpi;
    return Math.round(mm / dot) * dot;
  }

  // ---------- layout ----------

  /**
   * opts: {
   *   x (mm), height (mm, výška běžných čar), ratio, checkDigit,
   *   bwr (mm, zúžení čar), dpi, snapDpi (bool),
   *   quietMark (bool, jen EAN-13: znak „>“ v pravé světlé zóně),
   *   showText (bool), fontSize (pt | 0 = auto), textGap (mm),
   *   bearer: 'none'|'tb'|'frame', bearerThickness (mm), background (bool)
   * }
   */
  function layout(symbology, input, opts) {
    const spec = SPECS[symbology];
    if (spec && spec.is2D) return layoutQR(spec, input, opts || {});
    const enc = encode(symbology, input, opts);
    const warnings = enc.warnings.slice();
    let X = +opts.x || spec.xNominal;
    let bwr = +opts.bwr || 0;
    let ratio = +opts.ratio || 2.5;

    if (opts.snapDpi && opts.dpi > 0) {
      X = snapToDots(X, opts.dpi);
      bwr = snapToDots(bwr, opts.dpi);
      if (spec.hasRatio) {
        // široký prvek na celé body
        const wide = snapToDots(X * ratio, opts.dpi);
        ratio = wide / X;
      }
    }
    if (spec.hasRatio && ratio !== (+opts.ratio || 2.5)) {
      // přepočítat s upraveným poměrem
      Object.assign(enc, encode(symbology, input, Object.assign({}, opts, { ratio })));
    }

    // kontroly vůči specifikaci
    if (X < spec.xMin - 1e-9) warnings.push(`Modul X ${fmt(X)} mm je pod minimem ${spec.xMin} mm.`);
    if (X > spec.xMax + 1e-9) warnings.push(`Modul X ${fmt(X)} mm je nad maximem ${spec.xMax} mm.`);
    if (spec.hasRatio && (ratio < spec.ratioMin - 1e-9 || ratio > spec.ratioMax + 1e-9)) {
      warnings.push(`Poměr širokého prvku ${fmt(ratio, 2)} je mimo rozsah ${spec.ratioMin}–${spec.ratioMax}.`);
    }
    const H = +opts.height || spec.heightNominal * (X / spec.xNominal);
    if (symbology === 'EAN13' && H < spec.heightNominal * (X / spec.xNominal) - 0.01) {
      warnings.push(`Zkrácená výška čar (nominál pro tento modul je ${fmt(spec.heightNominal * X / spec.xNominal, 2)} mm).`);
    }
    if (spec.heightMin && H < spec.heightMin - 0.01) {
      warnings.push(`Výška čar ${fmt(H, 2)} mm je pod minimem ${spec.heightMin} mm.`);
    }
    if (bwr > 0 && bwr >= X * 0.5) warnings.push('Korekce BWR je příliš velká vůči modulu.');
    if (opts.dpi > 0 && !opts.snapDpi) {
      const di = dpiInfo(X, opts.dpi);
      if (!di.integer) {
        warnings.push(`Modul = ${fmt(di.dots, 2)} bodu při ${opts.dpi} dpi; doporučeno ${fmt(di.snappedMm, 4)} mm (${di.rounded} b.).`);
      }
    }

    // bearer bars
    const bearer = spec.hasBearer ? (opts.bearer || 'none') : 'none';
    const bt = bearer !== 'none' ? (+opts.bearerThickness || 2 * X) : 0;

    const rects = [];
    const symW = enc.width * X;
    const offX = bearer === 'frame' ? bt : 0;
    const offY = bt;

    // čáry
    for (const b of enc.bars) {
      const h = H + (b.guard && spec.guardExt ? spec.guardExt * X : 0);
      const w = Math.max(b.w * X - bwr, X * 0.05);
      rects.push([offX + b.x * X + (b.w * X - w) / 2, offY, w, h]);
    }

    // nosné pruhy (bez překryvů, aby compound path neudělal díry)
    if (bearer === 'tb' || bearer === 'frame') {
      const fullW = symW + 2 * offX;
      rects.push([0, 0, fullW, bt]);
      rects.push([0, offY + H, fullW, bt]);
      if (bearer === 'frame') {
        rects.push([0, bt, bt, H]);
        rects.push([fullW - bt, bt, bt, H]);
      }
    }

    let height = offY + H + bt;
    if (symbology === 'EAN13') height = Math.max(height, offY + H + spec.guardExt * X);

    // text (HRI)
    const texts = [];
    let textTop = null;
    let fontSize = 0;
    if (opts.showText) {
      fontSize = +opts.fontSize > 0 ? +opts.fontSize : autoFontSize(symbology, X);
      const gap = opts.textGap != null && opts.textGap !== '' ? +opts.textGap : (symbology === 'EAN13' ? 0.5 * X : 2 * X);
      textTop = offY + H + bt + gap;
      if (enc.textSlots) {
        for (const t of enc.textSlots) texts.push({ s: t.s, x: offX + t.x * X, top: textTop, size: fontSize });
        // značka světlé zóny: špička „>“ leží na pravém okraji světlé zóny
        if (symbology === 'EAN13' && opts.quietMark) {
          texts.push({ s: '>', x: offX + symW, top: textTop, size: fontSize, align: 'right' });
        }
      } else {
        texts.push({ s: enc.hri, x: offX + symW / 2, top: textTop, size: fontSize });
      }
      height = Math.max(height, textTop + fontSize * 25.4 / 72 * 0.72);
    }

    const width = symW + 2 * offX;
    return {
      symbology, name: spec.name, data: enc.data, hri: enc.hri, checkComputed: enc.checkComputed,
      X, ratio, H, bwr, rects, texts, fontSize, width, height,
      background: opts.background ? [0, 0, width, height] : null,
      warnings,
    };
  }

  /** QR: opts { x (mm), ecl, quiet (moduly), bwr, dpi, snapDpi, background }. */
  function layoutQR(spec, input, opts) {
    const text = String(input == null ? '' : input).trim();
    let q;
    try { q = QR.encode(text, { ecl: opts.ecl || 'M' }); } catch (e) {
      if (e instanceof QR.QRError) throw new BarcodeError(e.message);
      throw e;
    }
    const warnings = [];
    let X = +opts.x || spec.xNominal;
    let bwr = +opts.bwr || 0;
    if (opts.snapDpi && opts.dpi > 0) {
      X = Math.max(snapToDots(X, opts.dpi), 25.4 / opts.dpi);
      bwr = snapToDots(bwr, opts.dpi);
    }
    if (X < spec.xMin - 1e-9) warnings.push(`Modul ${fmt(X)} mm je pod doporučeným minimem ${spec.xMin} mm.`);
    if (bwr > 0 && bwr >= X * 0.5) warnings.push('Korekce BWR je příliš velká vůči modulu.');
    if (opts.dpi > 0 && !opts.snapDpi) {
      const di = dpiInfo(X, opts.dpi);
      if (!di.integer) {
        warnings.push(`Modul = ${fmt(di.dots, 2)} bodu při ${opts.dpi} dpi; doporučeno ${fmt(di.snappedMm, 4)} mm (${di.rounded} b.).`);
      }
    }
    const quiet = opts.quiet != null && opts.quiet !== '' && !isNaN(+opts.quiet) ? Math.max(0, +opts.quiet) : 4;
    if (quiet < 4) warnings.push('Světlá zóna QR kódu má mít aspoň 4 moduly.');

    const src = bwr > 0 ? QR.toRectsInset(q.modules, Math.min(bwr / 2 / X, 0.45)) : QR.toRects(q.modules);
    const rects = src.map(r => [(r[0] + quiet) * X, (r[1] + quiet) * X, r[2] * X, r[3] * X]);
    const side = (q.size + 2 * quiet) * X;
    return {
      symbology: 'QR', name: 'QR', data: text, label: text.length > 40 ? text.slice(0, 40) + '…' : text,
      hri: text, checkComputed: false,
      X, ratio: 0, H: q.size * X, bwr, rects, texts: [], fontSize: 0, width: side, height: side,
      background: opts.background ? [0, 0, side, side] : null,
      warnings,
      info: `Verze ${q.version} (${q.size} × ${q.size} modulů), korekce ${q.ecl}`,
    };
  }

  /** Výchozí velikost písma v pt odvozená od modulu. */
  function autoFontSize(symbology, X) {
    const mm = symbology === 'EAN13' ? 11.5 * X : (symbology === 'ITF14' ? 4.5 * X : 6 * X);
    return Math.round((mm * 72 / 25.4) * 10) / 10;
  }

  function fmt(n, d) {
    return (+n).toFixed(d == null ? 3 : d).replace(/\.?0+$/, '');
  }

  /** SVG náhled (pro panel). */
  function toSVG(L, fill) {
    const f = fill || '#000';
    const pad = 0.5;
    let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${L.width + 2 * pad} ${L.height + 2 * pad}">`;
    out += `<rect x="${-pad}" y="${-pad}" width="${L.width + 2 * pad}" height="${L.height + 2 * pad}" fill="#fff"/>`;
    out += `<path fill="${f}" d="`;
    for (const r of L.rects) out += `M${r[0].toFixed(4)} ${r[1].toFixed(4)}h${r[2].toFixed(4)}v${r[3].toFixed(4)}h${(-r[2]).toFixed(4)}z`;
    out += '"/>';
    for (const t of L.texts) {
      const sizeMm = t.size * 25.4 / 72;
      out += `<text x="${t.x.toFixed(3)}" y="${(t.top + sizeMm * 0.72).toFixed(3)}" font-size="${sizeMm.toFixed(3)}" text-anchor="${t.align === 'right' ? 'end' : 'middle'}" font-family="OCR-B, OCRB, Consolas, monospace" fill="${f}">${t.s.replace('>', '&gt;')}</text>`;
    }
    return out + '</svg>';
  }

  return { gs1CheckDigit, encode, layout, dpiInfo, snapToDots, autoFontSize, toSVG, SPECS, BarcodeError };
});
