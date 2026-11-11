// Spuštění: node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../js/barcode.js');

/** Převede pruhy zpět na binární řetězec modulů (jen pro celočíselné šířky). */
function bits(enc) {
  const arr = new Array(enc.width).fill('0');
  for (const b of enc.bars) for (let i = 0; i < b.w; i++) arr[b.x + i] = '1';
  return arr.join('');
}

test('GS1 kontrolní číslice', () => {
  assert.equal(B.gs1CheckDigit('400638133393'), '1');
  assert.equal(B.gs1CheckDigit('590123412345'), '7');
  assert.equal(B.gs1CheckDigit('1540014128876'), '3');
  assert.equal(B.gs1CheckDigit('000000000000'), '0');
});

test('EAN-13: doplnění a ověření kontrolní číslice', () => {
  assert.equal(B.encode('EAN13', '400638133393', { checkDigit: 'auto' }).data, '4006381333931');
  assert.equal(B.encode('EAN13', '4006381333931', { checkDigit: 'auto' }).data, '4006381333931');
  assert.throws(() => B.encode('EAN13', '4006381333932', { checkDigit: 'auto' }), /správně má být 1/);
  assert.throws(() => B.encode('EAN13', '400638133393', { checkDigit: 'verify' }), /13 číslic/);
  assert.equal(B.encode('EAN13', '4006381333932', { checkDigit: 'ignore' }).data, '4006381333932');
  assert.throws(() => B.encode('EAN13', '40063813339a', { checkDigit: 'auto' }), /jen číslice/);
});

test('EAN-13: vzor modulů', () => {
  const e = B.encode('EAN13', '4006381333931', { checkDigit: 'auto' });
  assert.equal(e.width, 113);
  const s = bits(e).slice(11, 11 + 95);
  // 4 → parita LGLLGG
  const expected = '101' +
    '0001101' + '0100111' + '0101111' + '0111101' + '0001001' + '0110011' +
    '01010' +
    '1000010' + '1000010' + '1000010' + '1110100' + '1000010' + '1100110' +
    '101';
  assert.equal(s, expected);
  assert.equal(bits(e).slice(0, 11), '0'.repeat(11));
  assert.equal(bits(e).slice(106), '0'.repeat(7));
  // ochranné čáry: 3 + 2 + 3 pruhy (101, 01010, 101)
  assert.equal(e.bars.filter(b => b.guard).length, 6);
});

test('ITF-14: struktura', () => {
  const e = B.encode('ITF14', '1540014128876', { checkDigit: 'auto', ratio: 2.5 });
  assert.equal(e.data, '15400141288763');
  assert.equal(e.hri, '1 54 00141 28876 3');
  // 2 start + 14*2 + 2 stop = 32 čar
  assert.equal(e.bars.length, 2 + 14 * 5 / 2 + 2);
  // šířka symbolu: start 4 + 7 párů * (každá číslice 3n+2w, ×2) + stop (w+2n)
  const symbol = 4 + 7 * 2 * (3 + 2 * 2.5) + (2.5 + 2);
  assert.equal(e.width, 20 + symbol);
});

test('I2/5: lichá délka a kontrolní číslice', () => {
  const a = B.encode('I25', '123', { checkDigit: 'none' });
  assert.equal(a.data, '0123');
  assert.equal(a.warnings.length, 1);
  const b = B.encode('I25', '123', { checkDigit: 'add' });
  assert.equal(b.data, '1236');
  assert.equal(b.warnings.length, 0);
  // vzor I2/5 pro "12" s poměrem 2 (celočíselně): 1=wnnnw (čáry), 2=nwnnw (mezery)
  const c = B.encode('I25', '12', { checkDigit: 'none', ratio: 2 });
  const s = bits(c).slice(10, -10);
  // start 1010, pak páry (č,m): (w,n)(n,w)(n,n)(n,n)(w,w), stop 11 0 1
  assert.equal(s, '1010' + '110' + '100' + '10' + '10' + '1100' + '1101');
});

test('DPI: zaokrouhlení modulu', () => {
  const i = B.dpiInfo(0.33, 2400);
  assert.ok(!i.integer);
  assert.equal(i.rounded, 31);
  assert.ok(Math.abs(i.snappedMm - 31 * 25.4 / 2400) < 1e-12);
  assert.ok(B.dpiInfo(0.254, 100).integer);
});

test('Layout EAN-13 100 %', () => {
  const L = B.layout('EAN13', '400638133393', { checkDigit: 'auto', x: 0.33, showText: true });
  assert.ok(Math.abs(L.width - 37.29) < 1e-9);
  assert.equal(L.texts.length, 13);
  assert.ok(Math.abs(L.H - 22.85) < 1e-9);
  // ochranné čáry delší o 5X
  const longest = Math.max(...L.rects.map(r => r[3]));
  assert.ok(Math.abs(longest - (22.85 + 5 * 0.33)) < 1e-9);
  assert.deepEqual(L.warnings, []);
});

test('Layout: BWR a snap na DPI', () => {
  const L = B.layout('EAN13', '400638133393', { checkDigit: 'auto', x: 0.33, bwr: 0.02, dpi: 2400, snapDpi: true });
  const dot = 25.4 / 2400;
  assert.ok(Math.abs(L.X / dot - Math.round(L.X / dot)) < 1e-9);
  assert.ok(Math.abs(L.bwr - 2 * dot) < 1e-12);
  const first = L.rects[0];
  assert.ok(Math.abs(first[2] - (L.X - L.bwr)) < 1e-9);
});

test('Layout ITF-14 s rámem: nosné pruhy se nepřekrývají', () => {
  const L = B.layout('ITF14', '1540014128876', { checkDigit: 'auto', x: 1.016, ratio: 2.5, bearer: 'frame', bearerThickness: 4.8 });
  const bearers = L.rects.slice(-4);
  const area = bearers.reduce((a, r) => a + r[2] * r[3], 0);
  const outer = L.width * (L.H + 2 * 4.8);
  const inner = (L.width - 2 * 4.8) * L.H;
  assert.ok(Math.abs(area - (outer - inner)) < 1e-6);
  assert.deepEqual(L.warnings, []);
});

test('Varování mimo specifikaci', () => {
  const L = B.layout('ITF14', '1540014128876', { checkDigit: 'auto', x: 0.3, ratio: 2.5, height: 20 });
  assert.ok(L.warnings.some(w => /pod minimem 0.495/.test(w)));
  assert.ok(L.warnings.some(w => /Výška čar/.test(w)));
});

test('EAN-13: značka světlé zóny >', () => {
  const o = { checkDigit: 'auto', x: 0.33, showText: true };
  const L = B.layout('EAN13', '400638133393', Object.assign({ quietMark: true }, o));
  assert.equal(L.texts.length, 14);
  const m = L.texts[13];
  assert.equal(m.s, '>');
  assert.equal(m.align, 'right');
  assert.ok(Math.abs(m.x - L.width) < 1e-9);
  assert.equal(B.layout('EAN13', '400638133393', Object.assign({ quietMark: true }, o, { showText: false })).texts.length, 0);
  assert.ok(B.toSVG(L).includes('&gt;'));
});
