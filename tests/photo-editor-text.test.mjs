// Regression test for issue #6: on the text tool, clicking the canvas opened
// a floating textarea that the browser immediately blurred again, because
// <canvas> isn't focusable and the browser's default mousedown action blurs
// whatever was just focused. That default action only fires for a *trusted*
// mousedown, so this can't be reproduced with synthetic DOM events — it needs
// a real click, dispatched here over the Chrome DevTools Protocol (CDP) using
// Node's built-in WebSocket client (no added dependency).
// Needs a Chrome, Chromium or Edge binary: set CHROME_PATH, or have one on PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { click, evaluate, unlock, withPage } from './browser.mjs';

// A minimal 1x1 transparent PNG; only needs to decode, its content is irrelevant.
const TINY_PNG = 'data:image/png;base64,'
  + 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('text tool: clicking the canvas keeps the text box focused so text can be typed', () => withPage(async (cdp) => {
  await unlock(cdp);

  // Load a photo straight into state and open the markup editor on it,
  // the way clicking a photo's "Markup" action would.
  const { x, y } = JSON.parse(await evaluate(cdp, `
    (async () => {
      const photo = createPhoto(${JSON.stringify(TINY_PNG)}, 'test.png');
      state.report.photos[photo.id] = photo;
      await openPhotoEditor(photo.id);
      setEditorTool('text');
      const r = document.getElementById('pe-canvas').getBoundingClientRect();
      return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    })()
  `, { awaitPromise: true }));

  // A real, trusted click (not a synthetic dispatchEvent) is required: only
  // trusted input triggers the browser's default focus-stealing behavior
  // that this fix prevents.
  await click(cdp, x, y);
  // Give the (buggy, pre-fix) blur handler's setTimeout a chance to run.
  await new Promise((r) => setTimeout(r, 150));

  const focusedTextBox = await evaluate(cdp,
    "!!(document.activeElement && document.activeElement.classList.contains('pe-text-input'))");
  assert.equal(focusedTextBox, true, 'the text box should stay focused after clicking the canvas');

  await cdp.send('Input.insertText', { text: 'Test label' });
  const typedValue = await evaluate(cdp, 'document.activeElement.value');
  assert.equal(typedValue, 'Test label');

  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });

  const shapes = await evaluate(cdp,
    "JSON.stringify(editor.work.markup.filter((s) => s.type === 'text').map((s) => s.text))");
  assert.deepEqual(JSON.parse(shapes), ['Test label']);
}, { profilePrefix: 'fr-editor-', windowSize: '1280,900' }));
