/*
 * ExtendScript (ES3) – kreslení čárového kódu do dokumentu Illustratoru.
 * Panel předá hotovou geometrii v mm (viz js/barcode.js → layout()); tady se jen kreslí.
 * Všechny funkce vracejí řetězec: "OK:<zpráva>" nebo "ERR:<zpráva>".
 */
var BC_NOTE_PREFIX = 'BCPLUGIN1:';
var BC_BOUNDS_NAME = 'Světlá zóna';
var BC_MM = 72 / 25.4;

function bcParse(s) {
    // Vstup vytváří panel přes JSON.stringify → bezpečný objektový literál.
    return eval('(' + s + ')');
}

function bcQuote(s) {
    return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
}

function bcDoc() {
    if (app.documents.length === 0) throw new Error('Není otevřený žádný dokument.');
    return app.activeDocument;
}

/** Informace o dokumentu + seznam přímých/globálních barev pro panel. */
function bcDocInfo() {
    try {
        if (app.documents.length === 0) return 'OK:{"doc":false,"spots":[]}';
        var doc = app.activeDocument;
        var out = [];
        for (var i = 0; i < doc.spots.length; i++) {
            var sp = doc.spots[i];
            if (sp.colorType === ColorModel.REGISTRATION) continue;
            out.push('{"name":' + bcQuote(sp.name) + ',"spot":' + (sp.colorType === ColorModel.SPOT) + '}');
        }
        var cmyk = doc.documentColorSpace === DocumentColorSpace.CMYK;
        return 'OK:{"doc":true,"cmyk":' + cmyk + ',"spots":[' + out.join(',') + ']}';
    } catch (e) {
        return 'ERR:' + e.message;
    }
}

function bcMakeColor(doc, c) {
    if (c && c.mode === 'spot' && c.spot) {
        var sp;
        try { sp = doc.spots.getByName(c.spot); } catch (e) { throw new Error('Barva „' + c.spot + '“ v dokumentu není.'); }
        var sc = new SpotColor();
        sc.spot = sp;
        sc.tint = c.tint != null ? c.tint : 100;
        return sc;
    }
    if (doc.documentColorSpace === DocumentColorSpace.CMYK) {
        var k = new CMYKColor();
        k.cyan = 0; k.magenta = 0; k.yellow = 0; k.black = 100;
        return k;
    }
    var r = new RGBColor();
    r.red = 0; r.green = 0; r.blue = 0;
    return r;
}

function bcWhite(doc) {
    if (doc.documentColorSpace === DocumentColorSpace.CMYK) {
        var k = new CMYKColor();
        k.cyan = 0; k.magenta = 0; k.yellow = 0; k.black = 0;
        return k;
    }
    var r = new RGBColor();
    r.red = 255; r.green = 255; r.blue = 255;
    return r;
}

/** Rekurzivně obarví cesty (po převodu textu na křivky). */
function bcPaint(item, color, overprint) {
    if (item.typename === 'PathItem') {
        item.filled = true;
        item.stroked = false;
        item.fillColor = color;
        item.fillOverprint = overprint;
    } else if (item.typename === 'CompoundPathItem') {
        for (var i = 0; i < item.pathItems.length; i++) bcPaint(item.pathItems[i], color, overprint);
    } else if (item.typename === 'GroupItem') {
        for (var j = 0; j < item.pageItems.length; j++) bcPaint(item.pageItems[j], color, overprint);
    }
}

var bcFontCache = null;

/** Seznam všech písem (jednou za běh Illustratoru): [{name, family, style, font}]. */
function bcAllFonts() {
    if (bcFontCache) return bcFontCache;
    var list = [];
    var n = app.textFonts.length;
    for (var i = 0; i < n; i++) {
        try {
            var f = app.textFonts[i];
            list.push({ name: f.name, family: f.family, style: f.style, font: f });
        } catch (e) {}
    }
    bcFontCache = list;
    return list;
}

/** Písma OCR pro nabídku v panelu. */
function bcListFonts() {
    try {
        var all = bcAllFonts(), out = [];
        for (var i = 0; i < all.length; i++) {
            if (/ocr/i.test(all[i].name) || /ocr/i.test(all[i].family)) {
                out.push('{"name":' + bcQuote(all[i].name) + ',"family":' + bcQuote(all[i].family) + ',"style":' + bcQuote(all[i].style) + '}');
            }
        }
        return 'OK:[' + out.join(',') + ']';
    } catch (e) {
        return 'ERR:' + e.message;
    }
}

function bcNorm(s) {
    return String(s).toLowerCase().replace(/[\s\-_]/g, '');
}

/**
 * name = PostScriptový název, název rodiny, nebo '' (automaticky OCR-B).
 * Vrací { font, fallback } – fallback = požadované písmo se nenašlo.
 */
function bcFindFont(name) {
    var all, i;
    if (name) {
        try { return { font: app.textFonts.getByName(name), fallback: false }; } catch (e) {}
        all = bcAllFonts();
        var want = bcNorm(name);
        for (i = 0; i < all.length; i++) {
            if (bcNorm(all[i].name) === want || bcNorm(all[i].family + all[i].style) === want || bcNorm(all[i].family) === want) {
                return { font: all[i].font, fallback: false };
            }
        }
    }
    all = bcAllFonts();
    for (i = 0; i < all.length; i++) {
        if (/^ocr[\s\-_]?b/i.test(all[i].name) || /^ocr[\s\-_]?b/i.test(all[i].family)) {
            return { font: all[i].font, fallback: !!name };
        }
    }
    try { return { font: app.textFonts.getByName('ArialMT'), fallback: true }; } catch (e2) {}
    return { font: null, fallback: true };
}

/**
 * Nakreslí kód. left/top = levý horní roh (včetně světlé zóny) v pt, souřadnice dokumentu.
 * Vrací { group, warnings }.
 */
function bcDraw(doc, req, left, top) {
    var L = req.layout;
    var warnings = [];
    var layer = doc.activeLayer;
    if (layer.locked || !layer.visible) throw new Error('Aktivní vrstva je zamčená nebo skrytá.');

    var color = bcMakeColor(doc, req.color);
    var overprint = !!(req.color && req.color.overprint);

    var group = layer.groupItems.add();
    group.name = L.name + ' ' + L.data;

    // obdélník světlé zóny (i neviditelný – drží rozměr skupiny a slouží pro „Aktualizovat“)
    var bounds = group.pathItems.rectangle(top, left, L.width * BC_MM, L.height * BC_MM);
    bounds.name = BC_BOUNDS_NAME;
    bounds.stroked = false;
    if (L.background) {
        bounds.filled = true;
        bounds.fillColor = bcWhite(doc);
        bounds.fillOverprint = false;
    } else {
        bounds.filled = false;
    }

    // čáry jako jedna složená cesta
    var cp = group.compoundPathItems.add();
    cp.name = 'Čáry';
    for (var i = 0; i < L.rects.length; i++) {
        var r = L.rects[i];
        var p = cp.pathItems.rectangle(top - r[1] * BC_MM, left + r[0] * BC_MM, r[2] * BC_MM, r[3] * BC_MM);
        p.filled = true;
        p.stroked = false;
        p.fillColor = color;
        p.fillOverprint = overprint;
    }

    // text
    if (L.texts && L.texts.length) {
        var f = bcFindFont(req.font);
        if (f.fallback) warnings.push('Písmo ' + (req.font ? '„' + req.font + '“' : 'OCR-B') + ' nenalezeno' + (f.font ? ', použito ' + f.font.name : '') + '.');
        for (var t = 0; t < L.texts.length; t++) {
            var T = L.texts[t];
            var cx = left + T.x * BC_MM;
            var wantTop = top - T.top * BC_MM;
            var tf = group.textFrames.pointText([cx, wantTop - T.size * 0.72]);
            tf.contents = T.s;
            var ca = tf.textRange.characterAttributes;
            ca.size = T.size;
            if (f.font) ca.textFont = f.font;
            ca.fillColor = color;
            ca.overprintFill = overprint;
            var right = T.align === 'right';
            tf.textRange.paragraphAttributes.justification = right ? Justification.RIGHT : Justification.CENTER;
            if (req.outlineText) {
                var g = tf.createOutline();
                bcPaint(g, color, overprint);
                var gb = g.geometricBounds; // [left, top, right, bottom]
                g.translate(right ? cx - gb[2] : cx - (gb[0] + gb[2]) / 2, wantTop - gb[1]);
            }
        }
    }

    group.note = BC_NOTE_PREFIX + req.paramsJson;
    return { group: group, warnings: warnings };
}

function bcResult(group, warnings) {
    var msg = group.name;
    if (warnings.length) msg += ' | ' + warnings.join(' | ');
    return 'OK:' + msg;
}

function bcWithDocCoords(fn) {
    var saved = app.coordinateSystem;
    app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
    try { return fn(); } finally { app.coordinateSystem = saved; }
}

/** Vytvoří kód uprostřed aktuálního pohledu. */
function bcCreate(reqJson) {
    try {
        var req = bcParse(reqJson);
        var doc = bcDoc();
        return bcWithDocCoords(function () {
            var c = doc.activeView.centerPoint;
            var left = c[0] - req.layout.width * BC_MM / 2;
            var top = c[1] + req.layout.height * BC_MM / 2;
            var res = bcDraw(doc, req, left, top);
            doc.selection = null;
            res.group.selected = true;
            return bcResult(res.group, res.warnings);
        });
    } catch (e) {
        return 'ERR:' + e.message;
    }
}

/** Najde ve výběru skupinu vytvořenou pluginem (i při přímém výběru vnořeného objektu). */
function bcFindSelected(doc) {
    var sel = doc.selection;
    if (!sel || !sel.length) return null;
    for (var i = 0; i < sel.length; i++) {
        var it = sel[i];
        while (it && it.typename !== 'Layer' && it.typename !== 'Document') {
            if (it.typename === 'GroupItem' && String(it.note).indexOf(BC_NOTE_PREFIX) === 0) return it;
            it = it.parent;
        }
    }
    return null;
}

/** Vrátí uložené parametry vybraného kódu (pro načtení do panelu). */
function bcReadSelected() {
    try {
        var g = bcFindSelected(bcDoc());
        if (!g) return 'ERR:Ve výběru není čárový kód z tohoto pluginu.';
        return 'OK:' + String(g.note).substring(BC_NOTE_PREFIX.length);
    } catch (e) {
        return 'ERR:' + e.message;
    }
}

/** Nahradí vybraný kód novým (stejný levý horní roh světlé zóny, stejná vrstva a pořadí). */
function bcUpdateSelected(reqJson) {
    try {
        var req = bcParse(reqJson);
        var doc = bcDoc();
        var old = bcFindSelected(doc);
        if (!old) return 'ERR:Ve výběru není čárový kód z tohoto pluginu.';
        return bcWithDocCoords(function () {
            var ref = old;
            try { ref = old.pathItems.getByName(BC_BOUNDS_NAME); } catch (e) {}
            var gb = ref.geometricBounds;
            var res = bcDraw(doc, req, gb[0], gb[1]);
            res.group.move(old, ElementPlacement.PLACEBEFORE);
            old.remove();
            doc.selection = null;
            res.group.selected = true;
            return bcResult(res.group, res.warnings);
        });
    } catch (e) {
        return 'ERR:' + e.message;
    }
}
