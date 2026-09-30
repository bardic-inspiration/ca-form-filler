// The General Observations photo cell (the dashed drop zone / photo
// container) must span the observation's full width like the text box above
// it, not sit behind a fixed narrow cap.
// Uses the Chrome DevTools Protocol for real layout. Needs a Chrome,
// Chromium or Edge binary: set CHROME_PATH, or have one on PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, waitUntilTrue, withPage as withChromePage } from './browser.mjs';

function withPage(fn) {
  return withChromePage(fn, { profilePrefix: 'fr-gen-photo-width-', windowSize: '1600,900' });
}

test('general observation photo cell spans the full width of the observation text', () => withPage(async (cdp) => {
  await evaluate(cdp, `[...document.querySelectorAll('#sec-general button')]
    .find((b) => b.textContent.includes('Add general observation')).click()`);
  await waitUntilTrue(cdp, "!!document.querySelector('.gen-body .photo-cell')");
  const rects = JSON.parse(await evaluate(cdp, `JSON.stringify({
    text: document.querySelector('.gen-body textarea').getBoundingClientRect(),
    cell: document.querySelector('.gen-body .photo-cell').getBoundingClientRect(),
  })`));

  assert.ok(rects.text.width > 600, `text box should be wide on a desktop viewport (got ${rects.text.width})`);
  assert.ok(
    Math.abs(rects.cell.width - rects.text.width) <= 1,
    `photo cell width ${rects.cell.width} should match the text box width ${rects.text.width}`,
  );
}));
