// The .page container must track the toolbar's content width on desktop:
// aligned edge to edge below the shared max-width (issue #13: the container
// looked "awkwardly narrow" against the full-bleed toolbar bar), but capped
// and centered together with it above that width, so a wide monitor doesn't
// stretch the form's fields edge to edge across the whole screen.
// Uses the Chrome DevTools Protocol for real layout. Needs a Chrome,
// Chromium or Edge binary: set CHROME_PATH, or have one on PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, withPage as withChromePage } from './browser.mjs';

function withPage(fn, { windowSize = '1600,900' } = {}) {
  return withChromePage(fn, { profilePrefix: 'fr-page-width-', windowSize });
}

async function getRects(cdp) {
  return JSON.parse(await evaluate(cdp, `JSON.stringify({
    toolbar: document.querySelector('.toolbar').getBoundingClientRect(),
    toolbarInner: document.querySelector('.toolbar-inner').getBoundingClientRect(),
    page: document.querySelector('.page').getBoundingClientRect(),
  })`));
}

test('page container tracks the toolbar below the shared max-width', () => withPage(async (cdp) => {
  const rects = await getRects(cdp);

  assert.ok(
    Math.abs(rects.page.left - rects.toolbar.left) <= 1,
    `page (left edge ${rects.page.left}) should align with the toolbar (left edge ${rects.toolbar.left})`,
  );
  assert.ok(
    Math.abs(rects.page.right - rects.toolbar.right) <= 1,
    `page (right edge ${rects.page.right}) should align with the toolbar (right edge ${rects.toolbar.right}), not sit inset behind a narrower cap`,
  );
}, { windowSize: '1300,900' }));

test('page container stays capped and centered with the toolbar on an ultra-wide viewport', () => withPage(async (cdp) => {
  const rects = await getRects(cdp);

  assert.ok(
    rects.page.width <= 1440 + 1,
    `page (width ${rects.page.width}) should be capped instead of stretching edge to edge on a wide monitor`,
  );
  assert.ok(
    Math.abs(rects.page.left - rects.toolbarInner.left) <= 1 && Math.abs(rects.page.right - rects.toolbarInner.right) <= 1,
    `page (left ${rects.page.left}, right ${rects.page.right}) should stay aligned with the toolbar's centered content ` +
    `(left ${rects.toolbarInner.left}, right ${rects.toolbarInner.right})`,
  );
  assert.ok(
    rects.page.left > 1,
    'page should be centered (not flush left) once it is narrower than the full-bleed toolbar',
  );
}, { windowSize: '1920,1080' }));
