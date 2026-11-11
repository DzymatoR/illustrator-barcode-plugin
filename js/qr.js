/*
 * Kodér QR kódu (model 2, verze 1–40, úrovně L/M/Q/H).
 * Režimy: numerický, alfanumerický, bajtový (UTF-8). Bez závislostí.
 *
 *   QR.encode(text, { ecl: 'M', minVersion: 1 }) → { version, size, ecl, mask, mode, modules: boolean[][] }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QR = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ECC_PER_BLOCK = {
    L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  };
  const NUM_BLOCKS = {
    L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  };
  const FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };
  const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

  class QRError extends Error {}

  // ---------- data ----------

  function utf8(str) {
    const out = [];
    for (const ch of str) {
      const c = ch.codePointAt(0);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  function pushBits(bits, value, len) {
    for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  }

  /** Vrátí { mode, modeBits, count, ccBits: [v1-9, v10-26, v27-40], data: bit[] }. */
  function makeSegment(text) {
    const bits = [];
    if (/^[0-9]+$/.test(text)) {
      for (let i = 0; i < text.length; i += 3) {
        const part = text.substr(i, 3);
        pushBits(bits, parseInt(part, 10), part.length * 3 + 1);
      }
      return { mode: 'numeric', modeBits: 1, count: text.length, ccBits: [10, 12, 14], data: bits };
    }
    if ([...text].every(c => ALNUM.indexOf(c) >= 0)) {
      let i = 0;
      for (; i + 2 <= text.length; i += 2) pushBits(bits, ALNUM.indexOf(text[i]) * 45 + ALNUM.indexOf(text[i + 1]), 11);
      if (i < text.length) pushBits(bits, ALNUM.indexOf(text[i]), 6);
      return { mode: 'alphanumeric', modeBits: 2, count: text.length, ccBits: [9, 11, 13], data: bits };
    }
    const bytes = utf8(text);
    for (const b of bytes) pushBits(bits, b, 8);
    return { mode: 'byte', modeBits: 4, count: bytes.length, ccBits: [8, 16, 16], data: bits };
  }

  function numRawDataModules(ver) {
    let r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const n = Math.floor(ver / 7) + 2;
      r -= (25 * n - 10) * n - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }

  function numDataCodewords(ver, ecl) {
    return Math.floor(numRawDataModules(ver) / 8) - ECC_PER_BLOCK[ecl][ver] * NUM_BLOCKS[ecl][ver];
  }

  // ---------- Reed–Solomon nad GF(2^8) ----------

  function gfMul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }

  function rsDivisor(degree) {
    const res = new Array(degree).fill(0);
    res[degree - 1] = 1;
    let rootPow = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < degree; j++) {
        res[j] = gfMul(res[j], rootPow);
        if (j + 1 < degree) res[j] ^= res[j + 1];
      }
      rootPow = gfMul(rootPow, 2);
    }
    return res;
  }

  function rsRemainder(data, divisor) {
    const res = divisor.map(() => 0);
    for (const b of data) {
      const factor = b ^ res.shift();
      res.push(0);
      divisor.forEach((coef, i) => { res[i] ^= gfMul(coef, factor); });
    }
    return res;
  }

  function addEccAndInterleave(data, ver, ecl) {
    const numBlocks = NUM_BLOCKS[ecl][ver];
    const eccLen = ECC_PER_BLOCK[ecl][ver];
    const raw = Math.floor(numRawDataModules(ver) / 8);
    const numShort = numBlocks - (raw % numBlocks);
    const shortLen = Math.floor(raw / numBlocks);
    const divisor = rsDivisor(eccLen);
    const blocks = [];
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
      k += dat.length;
      const ecc = rsRemainder(dat, divisor);
      if (i < numShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const out = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((b, j) => {
        if (i !== shortLen - eccLen || j >= numShort) out.push(b[i]);
      });
    }
    return out;
  }

  // ---------- matice ----------

  function alignmentPositions(ver) {
    if (ver === 1) return [];
    const n = Math.floor(ver / 7) + 2;
    const step = ver === 32 ? 26 : Math.floor((ver * 4 + n * 2 + 1) / (n * 2 - 2)) * 2;
    const res = [6];
    for (let pos = ver * 4 + 17 - 7; res.length < n; pos -= step) res.splice(1, 0, pos);
    return res;
  }

  function buildMatrix(ver, ecl, codewords, forcedMask) {
    const size = ver * 4 + 17;
    const m = [], fn = [];
    for (let y = 0; y < size; y++) { m.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    const setFn = (x, y, dark) => { m[y][x] = dark; fn[y][x] = true; };

    // časování
    for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
    // vyhledávací vzory + oddělovače
    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        setFn(x, y, dist !== 2 && dist !== 4);
      }
    }
    // zarovnávací vzory
    const ap = alignmentPositions(ver), n = ap.length;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        setFn(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }

    function drawFormat(mask) {
      const data = (FORMAT_BITS[ecl] << 3) | mask;
      let rem = data;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const bits = ((data << 10) | rem) ^ 0x5412;
      const bit = i => ((bits >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) setFn(8, i, bit(i));
      setFn(8, 7, bit(6)); setFn(8, 8, bit(7)); setFn(7, 8, bit(8));
      for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(i));
      setFn(8, size - 8, true);
    }
    drawFormat(0); // rezervace míst

    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const bits = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const dark = ((bits >>> i) & 1) !== 0;
        const a = size - 11 + (i % 3), b = Math.floor(i / 3);
        setFn(a, b, dark); setFn(b, a, dark);
      }
    }

    // data (cik-cak od pravého dolního rohu)
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!fn[y][x] && i < codewords.length * 8) {
            m[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
      }
    }

    const MASKS = [
      (x, y) => (x + y) % 2 === 0,
      (x, y) => y % 2 === 0,
      (x, y) => x % 3 === 0,
      (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
      (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
      (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0,
      (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0,
    ];
    const applyMask = k => {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (!fn[y][x] && MASKS[k](x, y)) m[y][x] = !m[y][x];
      }
    };

    let best = forcedMask;
    if (best == null) {
      let min = Infinity;
      for (let k = 0; k < 8; k++) {
        applyMask(k); drawFormat(k);
        const p = penalty(m, size);
        if (p < min) { min = p; best = k; }
        applyMask(k); // XOR zpět
      }
    }
    applyMask(best);
    drawFormat(best);
    return { modules: m, mask: best, size };
  }

  function penalty(m, size) {
    let p = 0;
    const lines = [];
    for (let y = 0; y < size; y++) lines.push(m[y]);
    for (let x = 0; x < size; x++) lines.push(m.map(row => row[x]));
    for (const line of lines) {
      // N1: běhy 5+ stejných modulů
      let run = 1;
      for (let i = 1; i <= size; i++) {
        if (i < size && line[i] === line[i - 1]) run++;
        else { if (run >= 5) p += run - 2; run = 1; }
      }
      // N3: vzor podobný vyhledávacímu (1:1:3:1:1 se 4 světlými moduly)
      const s = line.map(v => (v ? '1' : '0')).join('');
      for (const pat of ['10111010000', '00001011101']) {
        for (let at = s.indexOf(pat); at >= 0; at = s.indexOf(pat, at + 1)) p += 40;
      }
    }
    // N2: bloky 2×2
    let dark = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (m[y][x]) dark++;
      if (x + 1 < size && y + 1 < size && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
    }
    // N4: vyváženost tmavých modulů
    p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return p;
  }

  // ---------- veřejné API ----------

  function encode(text, opts) {
    opts = opts || {};
    const ecl = opts.ecl || 'M';
    if (!ECC_PER_BLOCK[ecl]) throw new QRError('Neznámá úroveň korekce: ' + ecl);
    text = String(text == null ? '' : text);
    if (!text) throw new QRError('Zadej obsah QR kódu.');
    const seg = makeSegment(text);

    let ver = Math.max(1, Math.min(40, opts.minVersion | 0 || 1));
    let used;
    for (; ; ver++) {
      if (ver > 40) throw new QRError('Obsah je pro QR kód příliš dlouhý (úroveň ' + ecl + ').');
      const cc = seg.ccBits[ver <= 9 ? 0 : ver <= 26 ? 1 : 2];
      if (seg.count < (1 << cc)) {
        used = 4 + cc + seg.data.length;
        if (used <= numDataCodewords(ver, ecl) * 8) break;
      }
    }

    const capacity = numDataCodewords(ver, ecl) * 8;
    const bits = [];
    pushBits(bits, seg.modeBits, 4);
    pushBits(bits, seg.count, seg.ccBits[ver <= 9 ? 0 : ver <= 26 ? 1 : 2]);
    for (const b of seg.data) bits.push(b);
    pushBits(bits, 0, Math.min(4, capacity - bits.length));
    pushBits(bits, 0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xEC; bits.length < capacity; pad ^= 0xEC ^ 0x11) pushBits(bits, pad, 8);

    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      data.push(b);
    }
    const res = buildMatrix(ver, ecl, addEccAndInterleave(data, ver, ecl), opts.mask);
    return { version: ver, size: res.size, ecl, mask: res.mask, mode: seg.mode, modules: res.modules };
  }

  /**
   * Sloučí tmavé moduly do obdélníků [x, y, w, h] (v modulech): vodorovné běhy,
   * které se spojí se stejným během na dalších řádcích.
   */
  function toRects(modules) {
    const size = modules.length;
    const open = new Map(); // "x,w" → rect rozpracovaný z předchozího řádku
    const out = [];
    for (let y = 0; y < size; y++) {
      const next = new Map();
      for (let x = 0; x < size;) {
        if (!modules[y][x]) { x++; continue; }
        let e = x;
        while (e < size && modules[y][e]) e++;
        const key = x + ',' + (e - x);
        const prev = open.get(key);
        if (prev) { prev[3]++; next.set(key, prev); }
        else { const r = [x, y, e - x, 1]; out.push(r); next.set(key, r); }
        x = e;
      }
      open.clear();
      next.forEach((v, k) => open.set(k, v));
    }
    return out;
  }

  /**
   * Obdélníky po řádcích se zúžením tmavých ploch o e (v modulech) na každé hraně,
   * která sousedí se světlým modulem (korekce nárůstu bodu). Nepřekrývají se.
   */
  function toRectsInset(modules, e) {
    const size = modules.length, out = [];
    const dark = (x, y) => x >= 0 && y >= 0 && x < size && y < size && modules[y][x];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size;) {
        if (!modules[y][x]) { x++; continue; }
        let end = x;
        while (end < size && modules[y][end]) end++;
        for (let s = x; s < end;) {
          const top = !dark(s, y - 1), bottom = !dark(s, y + 1);
          let t = s + 1;
          while (t < end && !dark(t, y - 1) === top && !dark(t, y + 1) === bottom) t++;
          const l = s === x ? e : 0, r = t === end ? e : 0;
          out.push([s + l, y + (top ? e : 0), t - s - l - r, 1 - (top ? e : 0) - (bottom ? e : 0)]);
          s = t;
        }
        x = end;
      }
    }
    return out;
  }

  return { encode, toRects, toRectsInset, QRError, numDataCodewords };
});
