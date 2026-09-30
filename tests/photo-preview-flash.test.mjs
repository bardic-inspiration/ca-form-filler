// Issue #18: a cropped or marked-up photo shows its final look as soon as its
// cell renders. `setPhotoImage()` used to show `photo.original` first and swap
// in the flattened preview once `flattenPhoto()` resolved, so every re-render
// flashed the uncropped photo at a different height.
// Needs a Chrome, Chromium or Edge binary: set CHROME_PATH, or have one on PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, waitUntilTrue, unlock, withPage as withChromePage } from './browser.mjs';

function withPage(fn) {
  return withChromePage(async (cdp) => {
    await unlock(cdp);
    // One observation holding one 200×100 photo, cropped to its left 50×100
    // (aspect 0.5, where the uncropped original's is 2).
    await evaluate(cdp, `(() => {
      const c = document.createElement('canvas');
      c.width = 200; c.height = 100;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#3a7'; ctx.fillRect(0, 0, 200, 100);
      const photo = createPhoto(c.toDataURL('image/jpeg', 0.9), 'test.jpg');
      photo.crop = { x: 0, y: 0, w: 50, h: 100 };
      state.report.photos[photo.id] = photo;
      addObservation();
      state.report.observations[0].photoIds.push(photo.id);
      window.testPhoto = photo;
    })()`);
    await fn(cdp);
  }, { profilePrefix: 'fr-preview-flash-', windowSize: '1280,900' });
}

test('re-rendering a photo with a cached preview shows the preview straight away', () => withPage(async (cdp) => {
  await evaluate(cdp, 'flattenPhoto(testPhoto, 1000, 0.85).then(() => true)', { awaitPromise: true });
  const src = await evaluate(cdp, `(() => {
    renderAll();
    return document.querySelector('.photo img').getAttribute('src');
  })()`);
  const cached = await evaluate(cdp, 'cachedFlattened(testPhoto, 1000)');
  assert.notEqual(cached, await evaluate(cdp, 'testPhoto.original'), 'the preview was not cached');
  assert.equal(src, cached, 'the cell rendered something other than the cached preview');
}));

test('a stale cached preview is not shown after the crop changes', () => withPage(async (cdp) => {
  await evaluate(cdp, 'flattenPhoto(testPhoto, 1000, 0.85).then(() => true)', { awaitPromise: true });
  const stale = await evaluate(cdp, 'cachedFlattened(testPhoto, 1000)');
  const src = await evaluate(cdp, `(() => {
    testPhoto.crop = { x: 0, y: 0, w: 100, h: 100 };
    renderAll();
    return document.querySelector('.photo img').getAttribute('src');
  })()`);
  assert.notEqual(src, stale);
  await waitUntilTrue(cdp, `(() => {
    const img = document.querySelector('.photo img');
    return img.complete && img.naturalWidth === img.naturalHeight && img.getAttribute('src') !== testPhoto.original;
  })()`);
}));

test('a photo without a cached preview never shows the uncropped original', () => withPage(async (cdp) => {
  // Every image load in the cell, from render until the preview is in.
  await evaluate(cdp, `(() => {
    window.loads = [];
    document.addEventListener('load', (e) => {
      if (e.target.closest && e.target.closest('.photo')) {
        loads.push({ w: e.target.naturalWidth, h: e.target.naturalHeight, original: e.target.getAttribute('src') === testPhoto.original });
      }
    }, true);
    renderAll();
    window.firstSrc = document.querySelector('.photo img').getAttribute('src');
  })()`);
  assert.notEqual(await evaluate(cdp, 'firstSrc'), await evaluate(cdp, 'testPhoto.original'));
  await waitUntilTrue(cdp, "document.querySelector('.photo img').getAttribute('src') === cachedFlattened(testPhoto, 1000) && document.querySelector('.photo img').complete");
  await new Promise((r) => setTimeout(r, 100));
  const loads = await evaluate(cdp, 'loads');
  assert.ok(loads.length > 0, 'no image loads recorded');
  for (const l of loads) {
    assert.equal(l.original, false, 'the uncropped original was shown');
    assert.ok(Math.abs(l.w / l.h - 0.5) < 0.02, `an image at aspect ${l.w}/${l.h} was shown, not the crop's 0.5`);
  }
}));
