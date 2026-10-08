// Issue #43: one sizing UI. The Layout picker is the main control; a corner
// handle sizes a photo freely and makes the cell manual; a Reset button, shown
// only on a manual cell, makes it automatic again. There is no alignment:
// photos always left-align. Controls are touch-sized and work without hover.
// Needs a Chrome, Chromium or Edge binary: set CHROME_PATH, or have one on PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, waitUntilTrue, unlock, withPage } from './browser.mjs';

const addPhotos = (cdp, target, n) => evaluate(cdp, `(async () => {
  const c = document.createElement('canvas');
  c.width = 300; c.height = 200;
  c.getContext('2d').fillRect(0, 0, 300, 200);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
  const files = Array.from({ length: ${n} }, (_, i) => new File([blob], 'p' + i + '.jpg', { type: 'image/jpeg' }));
  await addPhotosTo(${target}, files);
})()`, { awaitPromise: true });

const OBS = "'obs:' + state.report.observations[0].id";
const GEN = "'gen:' + state.report.generalObservations[0].id";

const widths = (cdp) => evaluate(cdp, `JSON.stringify([...document.querySelectorAll('.obs-table .photo-cell .photo')]
  .map((f) => Number(f.style.getPropertyValue('--w'))))`).then(JSON.parse);

const mode = (cdp) => evaluate(cdp, 'cellDisplay(state.report.observations[0].display).photoMode');
const resetCount = (cdp) => evaluate(cdp, "document.querySelectorAll('.obs-table .photo-reset').length");

function setup(fn, opts) {
  return withPage(async (cdp) => {
    await unlock(cdp);
    await evaluate(cdp, 'addObservation(); renderAll();');
    await fn(cdp);
  }, opts);
}

// Press and release the selected photo's se handle, moving it by dx px.
async function dragHandle(cdp, photoIndex, dx) {
  await evaluate(cdp, `selectPhoto(state.report.observations[0].photoIds[${photoIndex}])`);
  await waitUntilTrue(cdp, "document.querySelectorAll('.photo.selected .photo-handle').length === 4");
  await waitUntilTrue(cdp, "[...document.querySelectorAll('.photo img')].every((i) => i.complete && i.naturalWidth)");
  const { x, y } = JSON.parse(await evaluate(cdp, `(() => {
    document.querySelector('.photo.selected').scrollIntoView({ block: 'center' });
    const r = document.querySelector('.photo.selected .photo-handle[data-corner=se]').getBoundingClientRect();
    return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  })()`));
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  if (dx) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + dx, y, button: 'left' });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + dx, y, button: 'left', clickCount: 1 });
}

test('Reset shows only on a manual cell and makes it automatic again in one undo step', () => setup(async (cdp) => {
  await addPhotos(cdp, OBS, 3);
  assert.equal(await resetCount(cdp), 0, 'no Reset on an automatic cell');
  const flowWidth = await evaluate(cdp, "document.querySelector('.photo-flow').getBoundingClientRect().width");
  await dragHandle(cdp, 2, -flowWidth * 0.27);
  assert.equal(await mode(cdp), 'manual');
  const [, , dragged] = await widths(cdp);
  assert.ok(dragged > 60 && dragged < 80, `freeform width, not a preset: ${dragged}%`);
  assert.equal(await resetCount(cdp), 1, 'Reset shows on a manual cell');
  await evaluate(cdp, "document.querySelector('.obs-table .photo-reset').click()");
  assert.equal(await mode(cdp), 'auto');
  assert.deepEqual(await widths(cdp), [50, 50, 100]);
  assert.equal(await resetCount(cdp), 0);
  assert.equal(await evaluate(cdp, 'document.querySelectorAll(".popover:not([hidden]), dialog[open]").length'), 0, 'no confirmation');
  await evaluate(cdp, 'undo()');
  assert.equal(await mode(cdp), 'manual');
  assert.equal((await widths(cdp))[2], dragged);
}));

test('pressing a handle without dragging still makes the cell manual', () => setup(async (cdp) => {
  await addPhotos(cdp, OBS, 2);
  await dragHandle(cdp, 0, 0);
  assert.equal(await mode(cdp), 'manual');
  assert.deepEqual(await widths(cdp), [50, 50], 'sizes unchanged');
  assert.equal(await resetCount(cdp), 1);
}));

test('the cell menu has no alignment or per-photo reset; photos always left-align', () => setup(async (cdp) => {
  await evaluate(cdp, `state.report.generalObservations.push(Object.assign(createGeneralObservation(), { display: { photoAlign: 'center' } }));
    state.report.observations[0].display.photoAlign = 'center'; renderAll();`);
  await addPhotos(cdp, OBS, 2);
  await addPhotos(cdp, GEN, 1);
  await evaluate(cdp, "makePhotoCellManual(state.report, 'gen', state.report.generalObservations[0].display, state.report.generalObservations[0].images); state.report.photos[state.report.generalObservations[0].images[0]].display.width = 50; renderAll();");
  await evaluate(cdp, "document.querySelector('.obs-table [data-cell-menu]').click()");
  await waitUntilTrue(cdp, "!!document.querySelector('.photo-menu')");
  const menu = await evaluate(cdp, "document.querySelector('.photo-menu').textContent");
  assert.ok(!/Alignment|Center|Reset photos|Default photo width/.test(menu), menu);
  assert.equal(await evaluate(cdp, "document.querySelectorAll('.align-center').length"), 0);
  const offsets = JSON.parse(await evaluate(cdp, `JSON.stringify([...document.querySelectorAll('.photo-flow')].map((flow) => {
    const fig = flow.querySelector('.photo').getBoundingClientRect();
    const img = flow.querySelector('.photo img').getBoundingClientRect();
    return [fig.left - flow.getBoundingClientRect().left, img.left - fig.left];
  }))`));
  assert.equal(offsets.length, 2);
  for (const [fig, img] of offsets) assert.ok(Math.abs(fig) < 0.5 && Math.abs(img) < 0.5, `left-aligned: ${fig}, ${img}`);
  const print = await evaluate(cdp, `(() => {
    const g = state.report.generalObservations[0];
    const flow = printPhotoFlow('gen', g.display, g.images, (id) => state.report.photos[id].original);
    return flow.className;
  })()`);
  assert.equal(print, 'pr-flow');
}));

for (const width of [360, 768, 1280]) {
  test(`photo sizing controls are at least 36px and visible without hover at ${width}px`, () => setup(async (cdp) => {
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }] });
    await addPhotos(cdp, OBS, 3);
    await evaluate(cdp, "makePhotoCellManual(state.report, 'obs', state.report.observations[0].display, state.report.observations[0].photoIds); renderAll();");
    await evaluate(cdp, "selectPhoto(state.report.observations[0].photoIds[0])");
    await waitUntilTrue(cdp, "document.querySelectorAll('.photo.selected .photo-handle').length === 4");
    const sel = '.obs-table .photo-add, .obs-table [data-cell-menu], .obs-table .photo-reset, .photo.selected .photo-handle';
    const before = JSON.parse(await evaluate(cdp, `JSON.stringify([...document.querySelectorAll(${JSON.stringify(sel)})].map((el) => {
      const r = el.getBoundingClientRect();
      return { c: el.className, w: r.width, h: r.height, o: getComputedStyle(el).opacity };
    }))`));
    assert.equal(before.length, 7, JSON.stringify(before));
    for (const b of before) {
      assert.ok(b.w >= 36 && b.h >= 36, `${b.c}: ${b.w}×${b.h}`);
      assert.equal(b.o, '1', `${b.c} visible without hover`);
    }
    await evaluate(cdp, "document.querySelector('.obs-table [data-cell-menu]').click()");
    await waitUntilTrue(cdp, "!!document.querySelector('.photo-menu')");
    const menu = JSON.parse(await evaluate(cdp, `JSON.stringify([...document.querySelectorAll('.photo-menu button')].map((el) => {
      const r = el.getBoundingClientRect();
      return { t: el.textContent || el.getAttribute('aria-label'), w: r.width, h: r.height };
    }))`));
    assert.equal(menu.length, 3, JSON.stringify(menu));
    for (const b of menu) assert.ok(b.w >= 36 && b.h >= 36, `${b.t}: ${b.w}×${b.h}`);
  }, { profilePrefix: `fr-resize-ui-${width}-`, windowSize: `${width},900` }));
}

// Issue #53: a photo whose height cap already clamps it narrower than its
// nominal --w% (common for General Observations, whose cap-to-width ratio is
// more generous than the table's) must still track the pointer immediately.
test('a handle resizes a photo that is already narrower than --w% due to its height cap', () => setup(async (cdp) => {
  await evaluate(cdp, 'state.report.generalObservations.push(createGeneralObservation()); renderAll();');
  await evaluate(cdp, `(async () => {
    const c = document.createElement('canvas');
    c.width = 200; c.height = 300; // portrait: the height cap clamps it below 100% width
    c.getContext('2d').fillRect(0, 0, 200, 300);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
    await addPhotosTo(${GEN}, [new File([blob], 'p.jpg', { type: 'image/jpeg' })]);
  })()`, { awaitPromise: true });
  await evaluate(cdp, `selectPhoto(photoList(${GEN})[0])`);
  await waitUntilTrue(cdp, "document.querySelectorAll('.photo.selected .photo-handle').length === 4");
  await waitUntilTrue(cdp, "[...document.querySelectorAll('.photo img')].every((i) => i.complete && i.naturalWidth)");
  await evaluate(cdp, `
    const r = document.querySelector('.photo.selected').getBoundingClientRect();
    window.scrollBy(0, r.top - 20);
  `);

  const before = JSON.parse(await evaluate(cdp, `JSON.stringify({
    w: Number(document.querySelector('.photo.selected').style.getPropertyValue('--w')),
    width: document.querySelector('.photo.selected').getBoundingClientRect().width,
  })`));
  assert.equal(before.w, 100, 'nominal width starts at 100%');
  const flowWidth = await evaluate(cdp, "document.querySelector('.gen-body .photo-flow').getBoundingClientRect().width");
  assert.ok(before.width < flowWidth * 0.9, `photo should already be clamped narrower than the flow: ${before.width} vs ${flowWidth}`);

  const { x, y } = JSON.parse(await evaluate(cdp, `(() => {
    const r = document.querySelector('.photo.selected .photo-handle[data-corner=se]').getBoundingClientRect();
    return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  })()`));
  const dx = -20;
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + dx, y, button: 'left' });
  const mid = await evaluate(cdp, "document.querySelector('.photo.selected').getBoundingClientRect().width");
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + dx, y, button: 'left', clickCount: 1 });

  assert.ok(Math.abs(mid - (before.width + dx)) < 5, `width should follow the pointer immediately, not stay at ${before.width} (got ${mid})`);
}, { windowSize: '1280,1600' }));
