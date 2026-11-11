/* Logika panelu: formulář ↔ stav, živý náhled, volání host.jsx. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'bc-settings-v1';

  const CHECK_LABELS = {
    auto: 'Automaticky (doplnit / ověřit)',
    verify: 'Vyžadovat a ověřit',
    ignore: 'Neověřovat',
    none: 'Bez kontrolní číslice',
    add: 'Přidat (modulo 10)',
  };

  const DEFAULTS = {
    sym: 'EAN13',
    num: '',
    per: {
      EAN13: { check: 'auto', x: 0.33, height: 22.85, quietMark: false },
      ITF14: { check: 'auto', x: 1.016, height: 31.75, ratio: 2.5, bearer: 'frame', bearerT: 4.8 },
      I25: { check: 'none', x: 0.5, height: 15, ratio: 2.5, bearer: 'none', bearerT: 1 },
      QR: { x: 0.5, ecl: 'M', quiet: 4 },
    },
    qrText: '',
    colorMode: 'auto', spot: '', overprint: false,
    showText: true, font: '', fontCustom: false, fontSize: '', outline: true,
    background: false, dpi: '', snap: false, bwr: 0,
  };

  let state = load();
  let lastLayout = null;
  let docInfo = null;
  let fonts = [];

  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { /* bez úložiště */ }
    if (s && s.font === 'OCRB') s.font = ''; // starší verze: výchozí název → automatika
    return merge(DEFAULTS, s || {});
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* bez úložiště */ }
  }
  function merge(base, over) {
    const out = JSON.parse(JSON.stringify(base));
    for (const k of Object.keys(over || {})) {
      if (k === 'per') {
        for (const sym of Object.keys(out.per)) Object.assign(out.per[sym], (over.per || {})[sym] || {});
      } else if (k in out) out[k] = over[k];
    }
    return out;
  }

  const per = () => state.per[state.sym];
  const spec = () => Barcode.SPECS[state.sym];
  const isQR = () => state.sym === 'QR';
  const content = () => (isQR() ? state.qrText : state.num);
  const num = (v, d) => (v === '' || v == null || isNaN(+v) ? d : +v);
  const f = (n, d = 3) => (+n).toFixed(d).replace('.', ',');

  // ---------- formulář ----------

  function renderForm() {
    $('sym').value = state.sym;
    $('num').value = content();
    $('numLabel').textContent = isQR() ? 'Obsah' : 'Číslo';
    $('num').placeholder = isQR() ? 'text nebo adresa (URL)' : 'např. 859400000000';

    const sel = $('check');
    sel.innerHTML = '';
    for (const m of spec().checkModes) sel.add(new Option(CHECK_LABELS[m], m));
    if (spec().checkModes.length && !spec().checkModes.includes(per().check)) per().check = spec().checkModes[0];
    sel.value = per().check || '';
    $('ecl').value = state.per.QR.ecl;
    $('quiet').value = state.per.QR.quiet;

    const p = per();
    $('x').value = round(p.x, 4);
    $('height').value = p.height != null ? round(p.height, 3) : '';
    $('mag').value = round(p.x / Barcode.SPECS.EAN13.xNominal * 100, 1);
    $('ratio').value = p.ratio != null ? p.ratio : '';
    $('bearer').value = p.bearer || 'none';
    $('bearerT').value = p.bearerT != null ? p.bearerT : '';

    $('colorMode').value = state.colorMode;
    $('overprint').checked = state.overprint;
    $('showText').checked = state.showText;
    $('font').value = state.font;
    renderFonts();
    $('fontSize').value = state.fontSize;
    $('outline').checked = state.outline;
    $('quietMark').checked = !!state.per.EAN13.quietMark;
    $('background').checked = state.background;
    $('dpi').value = state.dpi;
    $('snap').checked = state.snap;
    $('bwr').value = state.bwr;

    for (const row of document.querySelectorAll('[data-only]')) {
      row.classList.toggle('hidden', !row.dataset.only.split(' ').includes(state.sym));
    }
    $('bearerT').closest('.row').classList.toggle('hidden', !spec().hasBearer || (p.bearer || 'none') === 'none');
    $('spotRow').classList.toggle('hidden', state.colorMode !== 'spot');
    renderSpots();
  }

  function round(v, d) {
    return v == null || v === '' ? '' : +(+v).toFixed(d);
  }

  function bind() {
    $('sym').addEventListener('change', e => { state.sym = e.target.value; renderForm(); update(); });
    $('num').addEventListener('input', e => { if (isQR()) state.qrText = e.target.value; else state.num = e.target.value; update(); });
    $('ecl').addEventListener('change', e => { state.per.QR.ecl = e.target.value; update(); });
    $('quiet').addEventListener('input', e => { state.per.QR.quiet = num(e.target.value, 4); update(); });
    $('num').addEventListener('keydown', e => { if (e.key === 'Enter') create(); });
    $('check').addEventListener('change', e => { per().check = e.target.value; update(); });

    $('mag').addEventListener('input', e => {
      const m = num(e.target.value, null);
      if (!m) return;
      const s = Barcode.SPECS.EAN13;
      per().x = s.xNominal * m / 100;
      per().height = s.heightNominal * m / 100;
      $('x').value = round(per().x, 4);
      $('height').value = round(per().height, 3);
      update();
    });
    $('x').addEventListener('input', e => {
      const x = num(e.target.value, null);
      if (!x) return;
      const p = per(), s = spec();
      // výšku škálovat jen pokud byla nominální pro předchozí modul
      if (state.sym === 'EAN13' && Math.abs(p.height - s.heightNominal * p.x / s.xNominal) < 0.01) {
        p.height = s.heightNominal * x / s.xNominal;
        $('height').value = round(p.height, 3);
      }
      p.x = x;
      $('mag').value = round(x / Barcode.SPECS.EAN13.xNominal * 100, 1);
      update();
    });
    $('height').addEventListener('input', e => { const v = num(e.target.value, null); if (v) { per().height = v; update(); } });
    $('ratio').addEventListener('input', e => { const v = num(e.target.value, null); if (v) { per().ratio = v; update(); } });
    $('bearer').addEventListener('change', e => { per().bearer = e.target.value; renderForm(); update(); });
    $('bearerT').addEventListener('input', e => { const v = num(e.target.value, null); if (v) { per().bearerT = v; update(); } });
    $('background').addEventListener('change', e => { state.background = e.target.checked; update(); });

    $('colorMode').addEventListener('change', e => { state.colorMode = e.target.value; renderForm(); update(); });
    $('spot').addEventListener('change', e => { state.spot = e.target.value; update(); });
    $('overprint').addEventListener('change', e => { state.overprint = e.target.checked; update(); });
    $('refreshSpots').addEventListener('click', refreshDoc);

    $('showText').addEventListener('change', e => { state.showText = e.target.checked; update(); });
    $('font').addEventListener('input', e => { state.font = e.target.value.trim(); update(); });
    $('fontSel').addEventListener('change', e => {
      const v = e.target.value;
      state.fontCustom = v === '__custom';
      if (!state.fontCustom) state.font = v;
      renderForm();
      update();
    });
    $('fontSize').addEventListener('input', e => { state.fontSize = e.target.value; update(); });
    $('quietMark').addEventListener('change', e => { state.per.EAN13.quietMark = e.target.checked; update(); });
    $('outline').addEventListener('change', e => { state.outline = e.target.checked; update(); });

    $('dpi').addEventListener('input', e => { state.dpi = e.target.value; update(); });
    $('snap').addEventListener('change', e => { state.snap = e.target.checked; update(); });
    $('bwr').addEventListener('input', e => { state.bwr = num(e.target.value, 0); update(); });

    $('create').addEventListener('click', create);
    $('update').addEventListener('click', updateSelected);
    $('load').addEventListener('click', loadSelected);
  }

  // ---------- výpočet a náhled ----------

  function layoutOpts() {
    const p = per();
    return {
      checkDigit: p.check,
      x: p.x, height: p.height, ratio: p.ratio,
      bearer: p.bearer, bearerThickness: p.bearerT,
      bwr: num(state.bwr, 0) / 1000,
      dpi: num(state.dpi, 0), snapDpi: state.snap,
      showText: state.showText, fontSize: num(state.fontSize, 0),
      background: state.background,
      quietMark: !!p.quietMark,
      ecl: p.ecl, quiet: p.quiet,
    };
  }

  function update() {
    save();
    const msgs = [];
    lastLayout = null;
    $('num').classList.remove('invalid');
    $('fontSize').placeholder = 'auto (' + String(Barcode.autoFontSize(state.sym, per().x)).replace('.', ',') + ')';

    if (!content().trim()) {
      $('result').textContent = '';
      $('preview').innerHTML = '<span class="empty">' + (isQR() ? 'Zadej obsah' : 'Zadej číslo') + '</span>';
    } else {
      try {
        const L = Barcode.layout(state.sym, content(), layoutOpts());
        lastLayout = L;
        const d = L.data;
        if (isQR()) $('result').textContent = '';
        else $('result').innerHTML = L.checkComputed
          ? `${d.slice(0, -1)}<b title="dopočtená kontrolní číslice">${d.slice(-1)}</b>`
          : d;
        if (L.info) msgs.push(['info', L.info]);
        $('preview').innerHTML = Barcode.toSVG(L, previewColor());
        for (const w of L.warnings) msgs.push(['warn', w]);
        msgs.push(['info', `Rozměr ${f(L.width, 2)} × ${f(L.height, 2)} mm (vč. světlé zóny)`]);
      } catch (e) {
        if (!(e instanceof Barcode.BarcodeError)) console.error(e);
        $('num').classList.add('invalid');
        $('result').textContent = '';
        $('preview').innerHTML = '<span class="empty">—</span>';
        msgs.push(['err', e.message]);
      }
    }
    if (state.colorMode === 'spot' && !state.spot) msgs.push(['warn', 'Vyber vzorník barvy.']);

    $('messages').innerHTML = msgs.map(([c, t]) => `<li class="${c}">${escapeHtml(t)}</li>`).join('');
    $('create').disabled = !lastLayout;
    $('update').disabled = !lastLayout;
    renderDpiInfo();
    renderDocInfo();
  }

  function renderDpiInfo() {
    const dpi = num(state.dpi, 0);
    const el = $('dpiInfo');
    if (!dpi) { el.textContent = 'Zadej rozlišení výstupu (např. 2400 pro CTP) pro kontrolu modulu.'; return; }
    const X = lastLayout ? lastLayout.X : per().x;
    const i = Barcode.dpiInfo(X, dpi);
    let t = `Bod ${f(i.dotMm, 4)} mm · X = ${f(X, 4)} mm = ${f(i.dots, 2)} b.`;
    if (lastLayout && lastLayout.bwr) t += ` · BWR ${f(lastLayout.bwr * 1000, 1)} µm`;
    if (lastLayout && spec().hasRatio) t += ` · poměr ${f(lastLayout.ratio, 3)}`;
    el.textContent = t;
  }

  function renderDocInfo() {
    const el = $('docInfo');
    if (!CEP.available) { el.textContent = 'Mimo Illustrator – jen náhled.'; return; }
    if (!docInfo || !docInfo.doc) { el.textContent = 'Není otevřený dokument.'; return; }
    if (state.colorMode === 'spot') el.textContent = 'Čáry i text budou v barvě vzorníku (tón 100 %).';
    else el.textContent = docInfo.cmyk ? 'Dokument CMYK → čáry jen v kanálu K (0/0/0/100).' : 'Dokument RGB → čáry RGB 0/0/0. Pro tisk použij dokument CMYK.';
  }

  function renderSpots() {
    const sel = $('spot');
    const spots = (docInfo && docInfo.spots) || [];
    sel.innerHTML = '';
    sel.add(new Option('— vyber —', ''));
    for (const s of spots) sel.add(new Option(s.name + (s.spot ? '' : ' (globální)'), s.name));
    if (state.spot && !spots.some(s => s.name === state.spot)) sel.add(new Option(state.spot + ' (v dokumentu chybí)', state.spot));
    sel.value = state.spot;
  }

  /** Výběr písma: automatika, nalezená písma OCR, vlastní název. */
  function renderFonts() {
    const sel = $('fontSel');
    sel.innerHTML = '';
    sel.add(new Option('Automaticky (OCR-B)', ''));
    for (const fnt of fonts) sel.add(new Option((fnt.family + ' ' + fnt.style).trim(), fnt.name));
    sel.add(new Option('Jiné…', '__custom'));
    const known = state.font === '' || fonts.some(fnt => fnt.name === state.font);
    const custom = state.fontCustom || !known;
    sel.value = custom ? '__custom' : state.font;
    $('fontRow').classList.toggle('hidden', !custom);
  }

  async function refreshFonts() {
    const r = await CEP.call('bcListFonts');
    if (!r.ok) return;
    try { fonts = JSON.parse(r.value); } catch (e) { fonts = []; }
    renderFonts();
  }

  function previewColor() {
    return '#000';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // ---------- Illustrator ----------

  async function refreshDoc() {
    const r = await CEP.call('bcDocInfo');
    if (r.ok) {
      try { docInfo = JSON.parse(r.value); } catch (e) { docInfo = null; }
    } else docInfo = null;
    renderSpots();
    update();
  }

  function request() {
    const L = lastLayout;
    return {
      layout: {
        name: L.name, data: L.label || L.data, width: L.width, height: L.height,
        rects: L.rects, texts: L.texts, background: L.background,
      },
      color: { mode: state.colorMode, spot: state.spot, overprint: state.overprint },
      font: state.font,
      outlineText: state.outline,
      paramsJson: JSON.stringify(state),
    };
  }

  function status(text, kind) {
    const el = $('status');
    el.textContent = text;
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  async function run(fn) {
    if (!lastLayout) return;
    if (state.colorMode === 'spot' && !state.spot) { status('Vyber vzorník barvy.', 'err'); return; }
    status('Kreslím…');
    const r = await CEP.call(fn, JSON.stringify(request()));
    if (r.ok) {
      const [name, ...warn] = r.value.split(' | ');
      status('✓ ' + name + (warn.length ? ' — ' + warn.join(' ') : ''), 'ok');
    } else status(r.value, 'err');
  }

  const create = () => run('bcCreate');
  const updateSelected = () => run('bcUpdateSelected');

  async function loadSelected() {
    const r = await CEP.call('bcReadSelected');
    if (!r.ok) { status(r.value, 'err'); return; }
    try {
      state = merge(DEFAULTS, JSON.parse(r.value));
      renderForm();
      update();
      status('Nastavení načteno z výběru.', 'ok');
    } catch (e) {
      status('Uložená data kódu jsou poškozená.', 'err');
    }
  }

  // ---------- start ----------

  CEP.applyTheme();
  CEP.on('com.adobe.csxs.events.ThemeColorChanged', CEP.applyTheme);
  CEP.on('documentAfterActivate', refreshDoc);
  CEP.on('documentAfterDeactivate', refreshDoc);
  window.addEventListener('focus', refreshDoc);

  bind();
  renderForm();
  update();
  refreshDoc();
  refreshFonts();
})();
