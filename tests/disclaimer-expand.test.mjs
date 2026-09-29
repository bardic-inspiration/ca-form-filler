// The disclaimer box clipped its text with a fixed 2-line WebKit line-clamp
// and gave no way to read the rest without opening Edit mode (issue #22).
// It should instead be a short, scrollable box with a native vertical resize
// handle, so the full text stays reachable without editing.
// Uses the Chrome DevTools Protocol for real layout. Needs a Chrome,
// Chromium or Edge binary: set CHROME_PATH, or have one on PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, withPage as withChromePage } from './browser.mjs';

function withPage(fn) {
  return withChromePage(fn, { profilePrefix: 'fr-disclaimer-', windowSize: '1600,900' });
}

test('disclaimer box is a short, resizable, scrollable box, not a text-only clamp', () => withPage(async (cdp) => {
  const info = JSON.parse(await evaluate(cdp, `JSON.stringify((() => {
    const el = document.querySelector('.disclaimer-text');
    const cs = getComputedStyle(el);
    return {
      text: el.textContent,
      resize: cs.resize,
      overflowY: cs.overflowY,
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
    };
  })())`));

  assert.match(info.text, /Contractor/, 'full disclaimer text should still be in the DOM, not truncated with an ellipsis');
  assert.equal(info.resize, 'vertical', 'the disclaimer box should expose a native vertical resize handle');
  assert.equal(info.overflowY, 'auto', 'the disclaimer box should scroll, so the full text is reachable without editing');
  assert.ok(
    info.scrollHeight <= info.clientHeight,
    `the default disclaimer should fit the box on a typical desktop screen without scrolling (scrollHeight ${info.scrollHeight} vs clientHeight ${info.clientHeight})`,
  );
}));

test('a longer disclaimer overflows the default box and is reachable by scrolling', () => withPage(async (cdp) => {
  const info = JSON.parse(await evaluate(cdp, `JSON.stringify((() => {
    const el = document.querySelector('.disclaimer-text');
    el.textContent += ' '.repeat(4) + el.textContent;
    return { clientHeight: el.clientHeight, scrollHeight: el.scrollHeight };
  })())`));

  assert.ok(
    info.scrollHeight > info.clientHeight,
    `a disclaimer much longer than the default should still overflow the box (scrollHeight ${info.scrollHeight} vs clientHeight ${info.clientHeight})`,
  );
}));
