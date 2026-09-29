// Issue #27: filtering observations by status or tag left the row visible on
// narrow viewports. The mobile responsive rule `.obs-table tr { display: block }`
// (needed to turn table rows into stacked cards) is more specific than
// `.row-hidden { display: none }`, so it silently won the cascade and the
// hidden class never actually hid anything below the 899px breakpoint.
// Needs a Chrome, Chromium or Edge binary: set CHROME_PATH, or have one on PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, waitUntilTrue, unlock, withPage as withChromePage } from './browser.mjs';

function withPage(fn) {
  return withChromePage(async (cdp) => {
    await unlock(cdp);
    await evaluate(cdp, 'addObservation(); renderAll();');
    await fn(cdp);
  }, { profilePrefix: 'fr-filter-mobile-', windowSize: '390,844' });
}

test('filtering by status hides the single non-matching observation row on a phone-width viewport', () => withPage(async (cdp) => {
  await evaluate(cdp, `
    [...document.querySelectorAll('[aria-label="Filter by status"] button')]
      .find((b) => b.textContent === 'Complete').click();
  `);
  await waitUntilTrue(cdp, "document.querySelector('#obs-body tr').classList.contains('row-hidden')");
  const { display, visible } = await evaluate(cdp, `(() => {
    const row = document.querySelector('#obs-body tr');
    return { display: getComputedStyle(row).display, visible: row.offsetParent !== null };
  })()`);
  assert.equal(display, 'none', 'filtered-out row should not be rendered on a narrow viewport');
  assert.equal(visible, false, 'filtered-out row should not take up layout space');
}));
