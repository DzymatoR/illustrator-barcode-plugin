/*
 * Údaje o pluginu zobrazené v patičce panelu.
 * VERSION musí odpovídat package.json a CSXS/manifest.xml (build.ps1 to hlídá).
 */
(function (root) {
  'use strict';
  const ABOUT = {
    name: 'Čárové kódy',
    version: '0.2.0',
    author: 'DzymatoR',
    repo: 'https://github.com/DzymatoR/illustrator-barcode-plugin',
  };
  root.ABOUT = ABOUT;

  function openUrl(url) {
    // v Illustratoru otevřít ve výchozím prohlížeči, ne uvnitř panelu
    if (root.cep && root.cep.util && root.cep.util.openURLInDefaultBrowser) root.cep.util.openURLInDefaultBrowser(url);
    else root.open(url, '_blank');
  }

  const el = document.getElementById('about');
  if (!el) return;
  el.textContent = `${ABOUT.name} ${ABOUT.version} · ${ABOUT.author} · `;
  const a = document.createElement('a');
  a.href = ABOUT.repo + '#readme';
  a.textContent = 'návod';
  a.title = ABOUT.repo;
  a.addEventListener('click', e => { e.preventDefault(); openUrl(a.href); });
  el.appendChild(a);
})(window);
