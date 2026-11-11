/*
 * Minimální obal nad CEP API (náhrada za CSInterface.js).
 * Mimo Illustrator (v prohlížeči) panel funguje jen pro náhled.
 */
(function (root) {
  'use strict';
  const cep = root.__adobe_cep__;

  const CEP = {
    available: !!cep,

    /** Spustí ExtendScript, vrátí Promise s výsledným řetězcem. */
    evalScript(script) {
      return new Promise(resolve => {
        if (!cep) return resolve('ERR:Panel neběží v Illustratoru.');
        cep.evalScript(script, r => resolve(r == null ? '' : String(r)));
      });
    },

    /** Zavolá funkci z host.jsx s řetězcovými argumenty; vrací {ok, value}. */
    async call(fn, ...args) {
      const r = await CEP.evalScript(fn + '(' + args.map(a => JSON.stringify(String(a))).join(',') + ')');
      if (r.indexOf('OK:') === 0) return { ok: true, value: r.slice(3) };
      if (r.indexOf('ERR:') === 0) return { ok: false, value: r.slice(4) };
      return { ok: false, value: r === 'EvalScript error.' ? 'Chyba skriptu v Illustratoru (host.jsx).' : r };
    },

    hostEnv() {
      try { return JSON.parse(cep.getHostEnvironment()); } catch (e) { return null; }
    },

    on(type, fn) {
      if (cep) cep.addEventListener(type, fn);
    },

    /** Převezme barvy panelu z Illustratoru. */
    applyTheme() {
      const env = CEP.hostEnv();
      const c = env && env.appSkinInfo && env.appSkinInfo.panelBackgroundColor && env.appSkinInfo.panelBackgroundColor.color;
      if (!c) return;
      const lum = (0.299 * c.red + 0.587 * c.green + 0.114 * c.blue) / 255;
      const s = document.documentElement.style;
      s.setProperty('--bg', `rgb(${c.red | 0},${c.green | 0},${c.blue | 0})`);
      document.documentElement.dataset.theme = lum > 0.5 ? 'light' : 'dark';
    },
  };

  root.CEP = CEP;
})(window);
