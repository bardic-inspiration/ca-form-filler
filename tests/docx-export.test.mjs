// Issue #52: Export Word runs in the browser: the toolbar offers it, it
// downloads a .docx named like the PDF, with the report's photos, and every
// XML part parses.
// Needs a Chrome, Chromium or Edge binary: set CHROME_PATH, or have one on PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, unlock, waitUntilTrue, withPage } from './browser.mjs';
import { unzip } from './unzip.mjs';

const setup = `(() => {
  const image = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#3a7'; ctx.fillRect(0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.9);
  };
  const r = state.report;
  r.header.project = 'Riverside Park';
  r.header.projectNumber = '2401';
  const add = (url) => { const p = createPhoto(url, 'p.jpg'); r.photos[p.id] = p; return p.id; };
  const g = createGeneralObservation();
  g.text = 'Site is <tidy> & safe';
  g.images.push(add(image(300, 200)));
  r.generalObservations.push(g);
  addObservation();
  const o = r.observations.at(-1);
  o.description = 'Cracked paver';
  o.photoIds.push(add(image(300, 200)), add(image(200, 300)));
  renderAll();
  window.__download = null;
  downloadBlob = (name, blob) => { window.__download = { name, blob }; };
})()`;

test('Export Word downloads a .docx of the report', async () => {
  await withPage(async (cdp) => {
    await unlock(cdp);
    await evaluate(cdp, setup);

    // Offered in the toolbar's overflow menu, next to Export CSV.
    await evaluate(cdp, "document.querySelector('[data-action=overflow]').click()");
    const items = await evaluate(cdp, "[...document.querySelectorAll('#popover button')].map((b) => b.textContent.trim())");
    assert.ok(items.includes('Export Word'), 'menu: ' + items.join(', '));
    await evaluate(cdp, "[...document.querySelectorAll('#popover button')].find((b) => b.textContent.trim() === 'Export Word').click()");

    await waitUntilTrue(cdp, 'window.__download !== null', 15000);
    const { name, type, base64 } = JSON.parse(await evaluate(cdp, `(async () => {
      const { name, blob } = window.__download;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (const b of bytes) s += String.fromCharCode(b);
      return JSON.stringify({ name, type: blob.type, base64: btoa(s) });
    })()`, { awaitPromise: true }));
    assert.equal(name, fileBaseName(), 'file name');
    assert.equal(type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    const files = unzip(new Uint8Array(Buffer.from(base64, 'base64')));
    const media = Object.keys(files).filter((n) => n.startsWith('word/media/'));
    assert.equal(media.length, 4, 'three photos and the logo: ' + media.join(', '));

    const xmlParts = Object.keys(files).filter((n) => /\.(xml|rels)$/.test(n));
    const sources = Object.fromEntries(xmlParts.map((n) => [n, new TextDecoder().decode(files[n])]));
    const errors = JSON.parse(await evaluate(cdp, `JSON.stringify(Object.entries(${JSON.stringify(sources)})
      .filter(([, xml]) => new DOMParser().parseFromString(xml, 'application/xml').querySelector('parsererror'))
      .map(([n]) => n))`));
    assert.deepEqual(errors, [], 'XML parts that do not parse');
    assert.match(sources['word/document.xml'], /Site is &lt;tidy&gt; &amp; safe/);
    assert.match(sources['word/document.xml'], /Cracked paver/);
  });

  function fileBaseName() {
    const d = new Date();
    const yymmdd = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    return `${yymmdd}_2401_FOR-01.docx`;
  }
});
