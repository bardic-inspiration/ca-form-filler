// Issue #17: on a phone-width viewport an observation row is a card with
// `overflow: hidden` (`.obs-table tr` in *css — responsive*), and a full-width
// photo's resize and crop handles sit 18px outside the photo's edge. With only
// 5px of `.photo-cell` padding between the photo and the card edge, 13px of
// each 36px handle is clipped and can't be reached by touch.
// Needs a Chrome, Chromium or Edge binary: set CHROME_PATH, or have one on PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, waitUntilTrue, unlock, withPage as withChromePage } from './browser.mjs';

// A rect is fully inside another once every edge is within it — otherwise
// `.obs-table tr`'s `overflow: hidden` would clip it, visually and to touch.
function fullyInside(inner, outer) {
  return inner.left >= outer.left - 0.5 && inner.top >= outer.top - 0.5
    && inner.right <= outer.right + 0.5 && inner.bottom <= outer.bottom + 0.5;
}

function withPage(fn) {
  return withChromePage(async (cdp) => {
    await unlock(cdp);
    // One observation holding one full-width (default 100%) photo.
    await evaluate(cdp, `(async () => {
      const c = document.createElement('canvas');
      c.width = 200; c.height = 100;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#3a7'; ctx.fillRect(0, 0, 200, 100);
      const photo = createPhoto(c.toDataURL('image/jpeg', 0.9), 'test.jpg');
      state.report.photos[photo.id] = photo;
      addObservation();
      state.report.observations[0].photoIds.push(photo.id);
      renderAll();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    })()`, { awaitPromise: true });
    await waitUntilTrue(cdp, "document.querySelector('.photo img').complete && document.querySelector('.photo').offsetHeight > 40");
    await fn(cdp);
  }, { profilePrefix: 'fr-handles-mobile-', windowSize: '390,844' });
}

async function cardAndRects(cdp, selector) {
  return evaluate(cdp, `JSON.stringify({
    card: document.querySelector('#obs-body tr').getBoundingClientRect().toJSON(),
    rects: [...document.querySelectorAll(${JSON.stringify(selector)})].map((el) => el.getBoundingClientRect().toJSON()),
  })`).then(JSON.parse);
}

test('every resize handle of a full-width photo is fully visible inside its card on a phone-width viewport', () => withPage(async (cdp) => {
  await evaluate(cdp, "selectPhoto(document.querySelector('.photo').dataset.photoId);");
  await waitUntilTrue(cdp, "document.querySelectorAll('.photo-handle').length === 4");
  const { card, rects } = await cardAndRects(cdp, '.photo-handle');
  assert.equal(rects.length, 4);
  for (const rect of rects) {
    assert.ok(fullyInside(rect, card), `handle ${JSON.stringify(rect)} clipped by card ${JSON.stringify(card)}`);
  }
}));

test('every crop handle of a full-width photo is fully visible inside its card on a phone-width viewport', () => withPage(async (cdp) => {
  await evaluate(cdp, "startPhotoCrop(document.querySelector('.photo'));", { awaitPromise: true });
  await waitUntilTrue(cdp, "document.querySelectorAll('.crop-handle').length === 8");
  const { card, rects } = await cardAndRects(cdp, '.crop-handle');
  assert.equal(rects.length, 8);
  for (const rect of rects) {
    assert.ok(fullyInside(rect, card), `handle ${JSON.stringify(rect)} clipped by card ${JSON.stringify(card)}`);
  }
}));
