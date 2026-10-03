// Issue #41: two halves and three thirds fill one row exactly, on screen at
// phone, tablet and desktop widths and in print, whether the size comes from
// the cell default or from each photo. The cell menu offers Full, Half, Third.
// Needs a Chrome, Chromium or Edge binary: set CHROME_PATH, or have one on PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, waitUntilTrue, unlock, withPage } from './browser.mjs';

const THIRD = 100 / 3;
// Each cell: { cell: cell default width, photos: per-photo widths (null = default) }.
const CELLS = [
  { cell: 50, photos: [null, null, null, null] },
  { cell: THIRD, photos: [null, null, null, null, null, null] },
  { cell: 100, photos: [50, 50, THIRD, THIRD, THIRD] },
];
// Expected row index of each photo, per cell.
const ROWS = [[0, 0, 1, 1], [0, 0, 0, 1, 1, 1], [0, 0, 1, 1, 1]];
const TOLERANCE = 0.002; // of the cell width

const setup = `(async () => {
  const c = document.createElement('canvas');
  c.width = 300; c.height = 200;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a7'; ctx.fillRect(0, 0, 300, 200);
  const wide = c.toDataURL('image/jpeg', 0.9);
  // Tall caps never bind for these wide photos.
  state.report.config.photoMaxHeightTable = 6;
  for (const { cell, photos } of ${JSON.stringify(CELLS)}) {
    addObservation();
    const o = state.report.observations.at(-1);
    o.display = { photoWidth: cell };
    for (const width of photos) {
      const photo = createPhoto(wide, 'p.jpg');
      if (width != null) photo.display = { ...photo.display, width };
      state.report.photos[photo.id] = photo;
      o.photoIds.push(photo.id);
    }
  }
  renderAll();
})()`;

const measure = (flowSel, figSel) => `JSON.stringify([...document.querySelectorAll(${JSON.stringify(flowSel)})].map((flow) => {
  const f = flow.getBoundingClientRect();
  return [...flow.querySelectorAll(${JSON.stringify(figSel)})].map((fig) => {
    const r = fig.getBoundingClientRect();
    return { left: (r.left - f.left) / f.width, right: (r.right - f.left) / f.width, y: (r.top - f.top) / f.width };
  });
}))`;

const allLoaded = (figSel) => `[...document.querySelectorAll(${JSON.stringify(figSel)})]
  .every((fig) => fig.style.getPropertyValue('--ar') && fig.querySelector('img').complete)`;

function rows(figs) {
  const tops = [];
  return figs.map((f) => {
    let i = tops.findIndex((t) => Math.abs(t - f.y) < TOLERANCE);
    if (i < 0) i = tops.push(f.y) - 1;
    return i;
  });
}

function assertFullRows(cells, where) {
  assert.equal(cells.length, CELLS.length, `${where}: one flow per cell`);
  cells.forEach((figs, c) => {
    const r = rows(figs);
    assert.deepEqual(r, ROWS[c], `${where} cell ${c}: row breaks`);
    figs.forEach((f, i) => {
      if (r[i - 1] !== r[i]) assert.ok(Math.abs(f.left) <= TOLERANCE, `${where} cell ${c} photo ${i} starts its row at ${f.left}`);
      if (r[i + 1] !== r[i]) assert.ok(Math.abs(f.right - 1) <= TOLERANCE, `${where} cell ${c} photo ${i} ends its row at ${f.right}`);
    });
  });
}

for (const [label, width] of [['phone', 360], ['tablet', 768], ['desktop', 1280]]) {
  test(`halves and thirds fill whole rows on screen and in print at ${label} width (${width}px)`, () => withPage(async (cdp) => {
    await unlock(cdp);
    await evaluate(cdp, setup, { awaitPromise: true });
    await waitUntilTrue(cdp, allLoaded('.photo-cell .photo'));
    assertFullRows(JSON.parse(await evaluate(cdp, measure('.photo-cell .photo-flow', '.photo'))), 'screen');

    await evaluate(cdp, 'renderPrint((id) => state.report.photos[id].original)');
    await cdp.send('Emulation.setEmulatedMedia', { media: 'print' });
    await evaluate(cdp, "document.getElementById('print-root').style.width = '6.5in'");
    await waitUntilTrue(cdp, allLoaded('.pr-flow .pr-fig'));
    const print = JSON.parse(await evaluate(cdp, measure('.pr-flow', '.pr-fig')));
    // The PDF also has General Observations flows; the table's come last.
    assertFullRows(print.slice(-CELLS.length), 'print');
  }, { profilePrefix: 'fr-photo-presets-', windowSize: `${width},900` }));
}

test('the cell menu offers Full, Half and Third as the default photo width', () => withPage(async (cdp) => {
  await unlock(cdp);
  await evaluate(cdp, setup, { awaitPromise: true });
  const labels = JSON.parse(await evaluate(cdp, `(() => {
    showPhotoCellMenu(document.querySelector('.photo-cell [data-cell-menu]'), document.querySelector('.photo-cell').dataset.target);
    const group = document.querySelector('.photo-menu [aria-label="Default photo width"]');
    return JSON.stringify([...group.querySelectorAll('button')].map((b) => [b.textContent, b.getAttribute('aria-pressed')]));
  })()`));
  assert.deepEqual(labels, [['Full', 'false'], ['Half', 'true'], ['Third', 'false']]);
}, { profilePrefix: 'fr-photo-presets-menu-' }));
