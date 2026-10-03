// Issue #42 in the app: adding and removing photos re-applies the default
// arrangement while a cell is automatic, the cell ⋯ menu's Layout picker
// switches arrangements in one undo step, and dragging a size handle makes the
// cell manual so later additions leave existing sizes alone.
// Needs a Chrome, Chromium or Edge binary: set CHROME_PATH, or have one on PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, waitUntilTrue, unlock, withPage } from './browser.mjs';

const T = 100 / 3;

// Adds `n` photos through the app's own add path (as a file drop or pick would).
const addPhotos = (cdp, n) => evaluate(cdp, `(async () => {
  const c = document.createElement('canvas');
  c.width = 300; c.height = 200;
  c.getContext('2d').fillRect(0, 0, 300, 200);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
  const files = Array.from({ length: ${n} }, (_, i) => new File([blob], 'p' + i + '.jpg', { type: 'image/jpeg' }));
  await addPhotosTo('obs:' + state.report.observations[0].id, files);
})()`, { awaitPromise: true });

const widths = (cdp) => evaluate(cdp, `JSON.stringify([...document.querySelectorAll('.photo-cell .photo')]
  .map((f) => Number(f.style.getPropertyValue('--w'))))`).then(JSON.parse);

const openMenu = (cdp) => evaluate(cdp, "document.querySelector('[data-cell-menu]').click()");

const layoutButtons = (cdp) => evaluate(cdp, `JSON.stringify([...document.querySelectorAll('.layout-picker button')]
  .map((b) => ({ key: b.dataset.arrangement, pressed: b.getAttribute('aria-pressed'), label: b.getAttribute('aria-label'),
    h: b.getBoundingClientRect().height })))`).then(JSON.parse);

const mode = (cdp) => evaluate(cdp, 'cellDisplay(state.report.observations[0].display, "obs").photoMode');

function setup(fn) {
  return withPage(async (cdp) => {
    await unlock(cdp);
    await evaluate(cdp, 'addObservation(); renderAll();');
    await fn(cdp);
  });
}

test('an automatic cell re-arranges as photos are added and removed', () => setup(async (cdp) => {
  await addPhotos(cdp, 1);
  assert.deepEqual(await widths(cdp), [100]);
  await addPhotos(cdp, 1);
  assert.deepEqual(await widths(cdp), [50, 50]);
  await addPhotos(cdp, 1);
  assert.deepEqual(await widths(cdp), [50, 50, 100]);
  await evaluate(cdp, "removePhoto('obs:' + state.report.observations[0].id, state.report.observations[0].photoIds[0])");
  assert.deepEqual(await widths(cdp), [50, 50]);
  assert.equal(await mode(cdp), 'auto');
}));

test('the Layout picker offers the arrangements for the photo count, one undo step each', () => setup(async (cdp) => {
  await addPhotos(cdp, 3);
  await openMenu(cdp);
  const buttons = await layoutButtons(cdp);
  assert.deepEqual(buttons.map((b) => [b.key, b.pressed, b.label]), [
    ['2-1', 'true', 'Half, Full'], ['1-1-1', 'false', 'Full, Full, Full'], ['3', 'false', 'Third'],
  ]);
  for (const b of buttons) assert.ok(b.h >= 36, `touch target ${b.h}px`);
  await evaluate(cdp, "document.querySelector('.layout-picker [data-arrangement=\"3\"]').click()");
  assert.deepEqual(await widths(cdp), [T, T, T]);
  assert.equal(await mode(cdp), 'auto');
  assert.deepEqual((await layoutButtons(cdp)).map((b) => b.pressed), ['false', 'false', 'true'], 'menu stays open, updated');
  await evaluate(cdp, 'undo()');
  assert.deepEqual(await widths(cdp), [50, 50, 100]);
}));

test('dragging a size handle makes the cell manual; added photos then leave existing sizes alone', () => setup(async (cdp) => {
  await addPhotos(cdp, 2);
  await evaluate(cdp, "selectPhoto(state.report.observations[0].photoIds[1])");
  await waitUntilTrue(cdp, "document.querySelectorAll('.photo.selected .photo-handle').length === 4");
  const { x, y, w } = JSON.parse(await evaluate(cdp, `(() => {
    const r = document.querySelector('.photo.selected .photo-handle[data-corner=se]').getBoundingClientRect();
    const f = document.querySelector('.photo-flow').getBoundingClientRect();
    return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2, w: f.width });
  })()`));
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x - w * 0.15, y, button: 'left' });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x - w * 0.15, y, button: 'left', clickCount: 1 });
  assert.equal(await mode(cdp), 'manual');
  const [first, second] = await widths(cdp);
  assert.equal(first, 50);
  assert.ok(second > 30 && second < 40, `dragged photo is ${second}%`);
  await addPhotos(cdp, 1);
  assert.deepEqual(await widths(cdp), [first, second, 100]);
  await openMenu(cdp);
  assert.ok((await layoutButtons(cdp)).every((b) => b.pressed === 'false'), 'no layout is current on a manual cell');
}));

test('the cell menu button is hidden when there is only one arrangement', () => setup(async (cdp) => {
  await addPhotos(cdp, 1);
  assert.equal(await evaluate(cdp, "document.querySelectorAll('[data-cell-menu]').length"), 0);
  await addPhotos(cdp, 1);
  assert.equal(await evaluate(cdp, "document.querySelectorAll('[data-cell-menu]').length"), 1);
}));
