// Issue #40: the editor's photo layout is a scaled preview of the PDF's. At
// phone, tablet and desktop widths, each photo's box as a fraction of its
// cell's width, and which photos share a row, match the printed layout.
// Needs a Chrome, Chromium or Edge binary: set CHROME_PATH, or have one on PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, waitUntilTrue, unlock, withPage } from './browser.mjs';

// Per-photo widths (%) in each cell: shared rows, a near-full row of small
// photos (where gap scale shows most), and a tall photo held by the height cap.
const OBS_WIDTHS = [[50, 50, 33, 33, 33], [16, 16, 16, 16, 16, 16, 100], [60, 40, 100, 25, 75]];
const GEN_WIDTHS = [[30, 70, 50, 50, 100], [16, 16, 16, 16, 16, 16, 10, 10]];
const TALL_EVERY = 3; // every third photo is portrait 1:3, so it hits the cap
const TOLERANCE = 0.002; // of the cell width

const setup = `(async () => {
  const image = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#3a7'; ctx.fillRect(0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.9);
  };
  const wide = image(300, 200);
  const tall = image(100, 300);
  let n = 0;
  const photos = (widths) => widths.map((width) => {
    const photo = createPhoto(n++ % ${TALL_EVERY} === ${TALL_EVERY - 1} ? tall : wide, 'p.jpg');
    photo.display = { ...photo.display, width };
    state.report.photos[photo.id] = photo;
    return photo.id;
  });
  for (const widths of ${JSON.stringify(OBS_WIDTHS)}) {
    addObservation();
    state.report.observations.at(-1).photoIds.push(...photos(widths));
  }
  for (const widths of ${JSON.stringify(GEN_WIDTHS)}) {
    const g = createGeneralObservation();
    g.images.push(...photos(widths));
    state.report.generalObservations.push(g);
  }
  renderAll();
})()`;

// Every photo box in each flow, relative to the flow and in units of its width.
const measure = (flowSel, figSel) => `JSON.stringify([...document.querySelectorAll(${JSON.stringify(flowSel)})].map((flow) => {
  const f = flow.getBoundingClientRect();
  return { width: f.width, figs: [...flow.querySelectorAll(${JSON.stringify(figSel)})].map((fig) => {
    const r = fig.getBoundingClientRect();
    return { x: (r.left - f.left) / f.width, y: (r.top - f.top) / f.width, w: r.width / f.width, h: r.height / f.width };
  }) };
}))`;

const allLoaded = (figSel) => `[...document.querySelectorAll(${JSON.stringify(figSel)})]
  .every((fig) => fig.style.getPropertyValue('--ar') && fig.querySelector('img').complete)`;

// Index of each photo's row, by its top edge.
function rows(figs) {
  const tops = [];
  return figs.map((f) => {
    let i = tops.findIndex((t) => Math.abs(t - f.y) < TOLERANCE);
    if (i < 0) i = tops.push(f.y) - 1;
    return i;
  });
}

async function screenAndPrint(cdp) {
  await unlock(cdp);
  await evaluate(cdp, setup, { awaitPromise: true });
  await waitUntilTrue(cdp, allLoaded('.photo-cell .photo'));
  const screen = JSON.parse(await evaluate(cdp, measure('.photo-cell .photo-flow', '.photo')));

  await evaluate(cdp, 'renderPrint((id) => state.report.photos[id].original)');
  await cdp.send('Emulation.setEmulatedMedia', { media: 'print' });
  // The PDF's content box: Letter minus the 1in side margins of @page.
  await evaluate(cdp, "document.getElementById('print-root').style.width = '6.5in'");
  await waitUntilTrue(cdp, allLoaded('.pr-flow .pr-fig'));
  const print = JSON.parse(await evaluate(cdp, measure('.pr-flow', '.pr-fig')));
  // Screen renders general observations before the table; so does the PDF.
  return { screen, print };
}

for (const [label, width] of [['phone', 360], ['tablet', 768], ['desktop', 1280]]) {
  test(`photo layout on screen matches the PDF at ${label} width (${width}px)`, () => withPage(async (cdp) => {
    const { screen, print } = await screenAndPrint(cdp);
    assert.equal(screen.length, OBS_WIDTHS.length + GEN_WIDTHS.length, 'one photo flow per cell on screen');
    assert.equal(print.length, screen.length, 'one photo flow per cell in print');
    screen.forEach((s, c) => {
      const p = print[c];
      assert.deepEqual(rows(s.figs), rows(p.figs), `cell ${c}: same photos share a row`);
      s.figs.forEach((sf, i) => {
        for (const k of ['x', 'y', 'w', 'h']) {
          assert.ok(Math.abs(sf[k] - p.figs[i][k]) <= TOLERANCE,
            `cell ${c} photo ${i} ${k}: screen ${sf[k].toFixed(4)} vs print ${p.figs[i][k].toFixed(4)} (flow ${s.width}px vs ${p.width}px)`);
        }
      });
    });
  }, { profilePrefix: 'fr-photo-parity-', windowSize: `${width},900` }));
}
