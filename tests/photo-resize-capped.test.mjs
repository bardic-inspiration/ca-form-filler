// Issue #53: a photo-cell handle sizes a photo (css — photos) using
// `width: min(pct-of-cell, cap-h * --ar)`, so a photo taller than the cell's
// max-height cap renders narrower than its --w. The drag math used to measure
// the pointer offset from the *uncapped* width for --w, not the photo's actual
// (capped) rendered width where the handle visually sits, so dragging such a
// photo moved --w (and its label) with no visible effect until the drag had
// covered the gap between the two. General Observations' height cap (4in
// over a ~5.7in-wide cell) is loose enough that any portrait photo there
// triggers it at or near 100% width.
// Needs a Chrome, Chromium or Edge binary: set CHROME_PATH, or have one on PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, waitUntilTrue, unlock, withPage } from './browser.mjs';

// A portrait (width < height) photo, so the height cap binds at 100% width.
const addPortraitPhoto = (cdp, target) => evaluate(cdp, `(async () => {
  const c = document.createElement('canvas');
  c.width = 200; c.height = 300;
  c.getContext('2d').fillRect(0, 0, 200, 300);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
  const file = new File([blob], 'portrait.jpg', { type: 'image/jpeg' });
  await addPhotosTo(${target}, [file]);
})()`, { awaitPromise: true });

const GEN = "'gen:' + state.report.generalObservations[0].id";

function setup(fn) {
  return withPage(async (cdp) => {
    await unlock(cdp);
    await evaluate(cdp, 'state.report.generalObservations.push(createGeneralObservation()); renderAll();');
    await fn(cdp);
    // Tall enough that the portrait photo's handle is reachable without
    // scrolling changing the measurements mid-drag.
  }, { windowSize: '1280,2400' });
}

// Press and release the selected photo's handle, moving it by dx px.
async function dragHandle(cdp, photoId, corner, dx) {
  await evaluate(cdp, `selectPhoto(${JSON.stringify(photoId)})`);
  await waitUntilTrue(cdp, "document.querySelectorAll('.photo.selected .photo-handle').length === 4");
  await waitUntilTrue(cdp, "[...document.querySelectorAll('.photo img')].every((i) => i.complete && i.naturalWidth)");
  const { x, y } = JSON.parse(await evaluate(cdp, `(() => {
    document.querySelector('.photo.selected').scrollIntoView({ block: 'center' });
    const r = document.querySelector('.photo.selected .photo-handle[data-corner=${corner}]').getBoundingClientRect();
    return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  })()`));
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  if (dx) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + dx, y, button: 'left' });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + dx, y, button: 'left', clickCount: 1 });
}

test('dragging a height-capped photo inward shrinks it right away, not after a dead zone', () => setup(async (cdp) => {
  await addPortraitPhoto(cdp, GEN);
  const photoId = await evaluate(cdp, 'state.report.generalObservations[0].images[0]');
  const widthOf = () => evaluate(cdp, `document.querySelector('.photo[data-photo-id=${JSON.stringify(photoId)}]').getBoundingClientRect().width`);
  const before = await widthOf();
  // Drag the sw (west) handle inward by 100px: a small, realistic drag.
  await dragHandle(cdp, photoId, 'sw', 100);
  const after = await widthOf();
  assert.ok(after < before - 50, `expected a visible shrink from a 100px drag: before=${before} after=${after}`);
}));
