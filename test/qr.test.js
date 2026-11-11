const test = require('node:test');
const assert = require('node:assert/strict');
const QR = require('../js/qr.js');
const B = require('../js/barcode.js');

const darkCount = m => m.reduce((a, row) => a + row.filter(Boolean).length, 0);
const area = rects => rects.reduce((a, r) => a + r[2] * r[3], 0);

test('QR: velikost a výběr verze podle kapacity', () => {
  // známé kapacity: 1-M numericky 34, 1-L bajtově 17, 40-L bajtově 2953
  assert.equal(QR.encode('1'.repeat(34), { ecl: 'M' }).version, 1);
  assert.equal(QR.encode('1'.repeat(35), { ecl: 'M' }).version, 2);
  assert.equal(QR.encode('a'.repeat(17), { ecl: 'L' }).version, 1);
  assert.equal(QR.encode('a'.repeat(18), { ecl: 'L' }).version, 2);
  assert.equal(QR.encode('a'.repeat(2953), { ecl: 'L' }).version, 40);
  assert.throws(() => QR.encode('a'.repeat(2954), { ecl: 'L' }), /příliš dlouhý/);
  const q = QR.encode('https://example.com', { ecl: 'M' });
  assert.equal(q.size, q.version * 4 + 17);
  assert.equal(q.modules.length, q.size);
});

test('QR: režimy', () => {
  assert.equal(QR.encode('0123456789').mode, 'numeric');
  assert.equal(QR.encode('HELLO WORLD').mode, 'alphanumeric');
  assert.equal(QR.encode('Žluťoučký kůň').mode, 'byte');
});

test('QR: vyhledávací vzory v rozích', () => {
  const q = QR.encode('test', { ecl: 'H' });
  const finder = ['1111111', '1000001', '1011101', '1011101', '1011101', '1000001', '1111111'];
  for (const [ox, oy] of [[0, 0], [q.size - 7, 0], [0, q.size - 7]]) {
    for (let y = 0; y < 7; y++) {
      const row = q.modules[oy + y].slice(ox, ox + 7).map(v => (v ? '1' : '0')).join('');
      assert.equal(row, finder[y]);
    }
  }
});

test('QR: obdélníky pokrývají přesně tmavé moduly', () => {
  const q = QR.encode('https://www.example.com/produkt?id=12345', { ecl: 'Q' });
  const rects = QR.toRects(q.modules);
  assert.equal(area(rects), darkCount(q.modules));
  const seen = q.modules.map(r => r.map(() => 0));
  for (const [x, y, w, h] of rects) for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) seen[yy][xx]++;
  for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) assert.equal(seen[y][x], q.modules[y][x] ? 1 : 0);
  assert.ok(rects.length < darkCount(q.modules));
  // zúžení 0 = stejná plocha; kladné zúžení plochu zmenší a nic nepřesáhne modul
  assert.ok(Math.abs(area(QR.toRectsInset(q.modules, 0)) - darkCount(q.modules)) < 1e-9);
  const inset = QR.toRectsInset(q.modules, 0.1);
  assert.ok(area(inset) < darkCount(q.modules));
  for (const [x, y, w, h] of inset) {
    assert.ok(w > 0 && h > 0);
    assert.ok(q.modules[Math.floor(y + h / 2)][Math.floor(x + 0.05)]);
  }
});

test('QR: layout', () => {
  const L = B.layout('QR', 'https://example.com', { x: 0.5, ecl: 'M', quiet: 4 });
  const q = QR.encode('https://example.com', { ecl: 'M' });
  assert.ok(Math.abs(L.width - (q.size + 8) * 0.5) < 1e-9);
  assert.equal(L.width, L.height);
  assert.equal(L.texts.length, 0);
  assert.deepEqual(L.warnings, []);
  assert.ok(Math.min(...L.rects.map(r => r[0])) >= 2 - 1e-9); // světlá zóna 4 × 0,5 mm
  assert.ok(B.layout('QR', 'x', { x: 0.5, quiet: 2 }).warnings.some(w => /aspoň 4 moduly/.test(w)));
  assert.throws(() => B.layout('QR', '  ', {}), B.BarcodeError);
  const long = B.layout('QR', 'a'.repeat(60), {});
  assert.equal(long.label.length, 41);
});
