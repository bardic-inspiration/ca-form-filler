// Issue #42: the cell ⋯ menu's Layout picker offers the arrangements for the
// photo count; picking one keeps the cell automatic and is one undo step, and
// dragging a handle makes the cell manual.
// Needs a Chrome, Chromium or Edge binary: set CHROME_PATH, or have one on PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, unlock, withPage } from './browser.mjs';

const T = 100 / 3;

// One observation holding three photos, added as the app adds them.
const setup = `(() => {
  const c = document.createElement('canvas');
  c.width = 300; c.height = 200;
  const url = c.toDataURL('image/jpeg', 0.9);
  addObservation();
  const o = state.report.observations.at(-1);
  for (let i = 0; i < 3; i++) {
    const photo = createPhoto(url, 'p.jpg');
    state.report.photos[photo.id] = photo;
    photosChanging(state.report, o.display, o.photoIds);
    o.photoIds.push(photo.id);
  }
  renderAll();
})()`;

const widths = `JSON.stringify([...document.querySelectorAll('#obs-body .photo')].map((f) => Number(f.style.getPropertyValue('--w'))))`;
const openMenu = `(() => {
  const cell = document.querySelector('#obs-body .photo-cell');
  showPhotoCellMenu(cell.querySelector('[data-cell-menu]'), cell.dataset.target);
})()`;
const layoutButtons = `JSON.stringify([...document.querySelectorAll('.photo-menu [aria-label="Layout"] button')]
  .map((b) => [b.getAttribute('aria-label'), b.getAttribute('aria-pressed')]))`;

test('the Layout picker offers the arrangements for the photo count and keeps the cell automatic', () => withPage(async (cdp) => {
  await unlock(cdp);
  await evaluate(cdp, setup);
  assert.deepEqual(JSON.parse(await evaluate(cdp, widths)), [50, 50, 100]);

  await evaluate(cdp, openMenu);
  assert.deepEqual(JSON.parse(await evaluate(cdp, layoutButtons)), [
    ['Half + Half, then Full', 'true'],
    ['Full, then Full, then Full', 'false'],
    ['Third + Third + Third', 'false'],
  ]);
  const widthPressed = `[...document.querySelectorAll('.photo-menu [aria-label="Default photo width"] button')]
    .some((b) => b.getAttribute('aria-pressed') === 'true')`;
  assert.equal(await evaluate(cdp, widthPressed), false, 'no default width is current while automatic');
  await evaluate(cdp, `document.querySelectorAll('.photo-menu [aria-label="Layout"] button')[2].click()`);
  assert.deepEqual(JSON.parse(await evaluate(cdp, widths)), [T, T, T]);
  assert.equal(await evaluate(cdp, 'state.report.observations[0].display.sizing'), 'auto');
  assert.deepEqual(JSON.parse(await evaluate(cdp, layoutButtons)).map((b) => b[1]), ['false', 'false', 'true']);

  // One undo step back to the default.
  await evaluate(cdp, 'closePopover(); undo()');
  assert.deepEqual(JSON.parse(await evaluate(cdp, widths)), [50, 50, 100]);

  // Removing a photo re-applies the default for the new count.
  await evaluate(cdp, `(() => {
    const o = state.report.observations[0];
    setArrangement(state.report, o.display, o.photoIds, [100, 100, 100]);
    removePhoto('obs:' + o.id, o.photoIds[0]);
  })()`);
  assert.deepEqual(JSON.parse(await evaluate(cdp, widths)), [50, 50]);
}, { profilePrefix: 'fr-layout-picker-' }));

test('dragging a size handle makes the cell manual; new photos leave the others alone', () => withPage(async (cdp) => {
  await unlock(cdp);
  await evaluate(cdp, setup);
  await evaluate(cdp, `(() => {
    const fig = document.querySelectorAll('#obs-body .photo')[2];
    selectPhoto(fig.dataset.photoId);
    const handle = fig.querySelector('.photo-handle[data-corner=se]');
    const r = handle.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const flow = fig.parentElement.getBoundingClientRect();
    const opts = (cx) => ({ bubbles: true, pointerId: 1, clientX: cx, clientY: y, button: 0 });
    handle.setPointerCapture = () => {};
    handle.dispatchEvent(new PointerEvent('pointerdown', opts(x)));
    handle.dispatchEvent(new PointerEvent('pointermove', opts(x - flow.width * 0.4)));
    handle.dispatchEvent(new PointerEvent('pointerup', opts(x - flow.width * 0.4)));
  })()`);
  const after = JSON.parse(await evaluate(cdp, widths));
  assert.deepEqual(after.slice(0, 2), [50, 50]);
  assert.ok(after[2] > 55 && after[2] < 65, `dragged to about 60%: ${after[2]}`);
  assert.equal(await evaluate(cdp, 'state.report.observations[0].display.sizing'), 'manual');

  await evaluate(cdp, `(() => {
    const o = state.report.observations[0];
    const photo = createPhoto(state.report.photos[o.photoIds[0]].original, 'q.jpg');
    state.report.photos[photo.id] = photo;
    photosChanging(state.report, o.display, o.photoIds);
    o.photoIds.push(photo.id);
    refreshPhotoCell('obs:' + o.id);
  })()`);
  assert.deepEqual(JSON.parse(await evaluate(cdp, widths)), [...after, 100]);

  // The menu shows no layout as current; picking one makes the cell automatic again.
  await evaluate(cdp, openMenu);
  assert.ok(JSON.parse(await evaluate(cdp, layoutButtons)).every((b) => b[1] === 'false'));
  await evaluate(cdp, `document.querySelector('.photo-menu [aria-label="Layout"] button').click()`);
  assert.deepEqual(JSON.parse(await evaluate(cdp, widths)), [50, 50, 50, 50]);
  assert.equal(await evaluate(cdp, 'state.report.observations[0].display.sizing'), 'auto');
}, { profilePrefix: 'fr-layout-picker-drag-' }));
