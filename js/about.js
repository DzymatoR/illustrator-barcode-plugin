/*
 * Údaje o pluginu zobrazené v patičce panelu.
 * VERSION musí odpovídat package.json a CSXS/manifest.xml (build.ps1 to hlídá).
 */
(function (root) {
  'use strict';
  const ABOUT = {
    name: 'Čárové kódy',
    version: '0.2.1',
    author: 'DzymatoR',
    repo: 'https://github.com/DzymatoR/illustrator-barcode-plugin',
    donate: 'https://ko-fi.com/dzymator',
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
  function addLink(text, url, title) {
    const a = document.createElement('a');
    a.href = url;
    a.textContent = text;
    a.title = title;
    a.addEventListener('click', e => { e.preventDefault(); openUrl(url); });
    el.appendChild(a);
  }
  addLink('návod', ABOUT.repo + '#readme', ABOUT.repo);
  el.appendChild(document.createTextNode(' · '));
  addLink('☕ kafe', ABOUT.donate, 'Plugin je zdarma. Jestli vám šetří práci, můžete autora pozvat na kávu: ' + ABOUT.donate);
})(window);
