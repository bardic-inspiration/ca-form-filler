// Issue #63: in the photo editor, a text label can be selected, resized by
// its corner handles and re-edited by double-click, with undo/redo, and the
// result is saved to the photo and survives rotation. Real mouse input over
// the Chrome DevTools Protocol.
// Needs a Chrome, Chromium or Edge binary: set CHROME_PATH, or have one on PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { click, evaluate, unlock, waitUntilTrue, withPage } from './browser.mjs';

const mouse = (cdp, type, x, y, clickCount = 1) =>
  cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount });
const json = async (cdp, expr) => JSON.parse(await evaluate(cdp, `JSON.stringify(${expr})`));
const frame = () => new Promise((r) => setTimeout(r, 60));
const key = async (cdp, k, code, vk, text) => {
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, text });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
};

// Screen position of an image-pixel point in the editor canvas.
const toScreen = (pt) => `(() => {
  const r = document.getElementById('pe-canvas').getBoundingClientRect();
  const { scale, ox, oy } = editor.view;
  return { x: Math.round(r.left + ox + ${pt}.x * scale), y: Math.round(r.top + oy + ${pt}.y * scale) };
})()`;

test('photo editor: select, resize and re-edit a text label, with undo/redo', () => withPage(async (cdp) => {
  await unlock(cdp);
  await evaluate(cdp, `
    (async () => {
      const c = document.createElement('canvas');
      c.width = 400; c.height = 300;
      const g = c.getContext('2d'); g.fillStyle = '#888'; g.fillRect(0, 0, 400, 300);
      const photo = createPhoto(c.toDataURL('image/png'), 'test.png');
      photo.markup.push({ id: 't1', type: 'text', x: 100, y: 100, text: 'Hi', size: 20, color: '#E02424', width: 0 });
      state.report.photos[photo.id] = photo;
      window.testPhotoId = photo.id;
      await openPhotoEditor(photo.id);
    })()
  `, { awaitPromise: true });
  await frame();

  // Click the label: it is selected and drawn with handles.
  const mid = await json(cdp, toScreen('{ x: 108, y: 110 }'));
  await click(cdp, mid.x, mid.y);
  assert.equal(await evaluate(cdp, 'editor.selectedId'), 't1');

  // Drag the bottom-right handle outwards: the font grows, top-left stays.
  const se = await json(cdp, toScreen(`(() => {
    const ctx = document.getElementById('pe-canvas').getContext('2d');
    return textHandles(shapeBounds(selectedShape(), ctx), 6 / editor.view.scale).find((c) => c.handle === 'se');
  })()`));
  await mouse(cdp, 'mouseMoved', se.x, se.y);
  assert.equal(await evaluate(cdp, "document.getElementById('pe-canvas').style.cursor"), 'nwse-resize');
  await mouse(cdp, 'mousePressed', se.x, se.y);
  for (let i = 1; i <= 5; i++) await mouse(cdp, 'mouseMoved', se.x + i * 12, se.y + i * 6);
  await mouse(cdp, 'mouseReleased', se.x + 60, se.y + 30);
  const grown = await json(cdp, 'editor.work.markup[0]');
  assert.ok(grown.size > 30, `size should grow, got ${grown.size}`);
  assert.equal(grown.x, 100);
  assert.equal(grown.y, 100);
  assert.equal(await evaluate(cdp, 'editor.undo.length'), 1, 'one drag is one undo step');

  // Undo and redo the resize.
  await evaluate(cdp, "editorCommand('undo')", { awaitPromise: true });
  assert.equal(await evaluate(cdp, 'editor.work.markup[0].size'), 20);
  await evaluate(cdp, "editorCommand('redo')", { awaitPromise: true });
  assert.equal(await evaluate(cdp, 'editor.work.markup[0].size'), grown.size);

  // Clicking empty space deselects.
  const empty = await json(cdp, toScreen('{ x: 350, y: 260 }'));
  await click(cdp, empty.x, empty.y);
  assert.equal(await evaluate(cdp, 'editor.selectedId'), null);

  // Double-click opens the text box with the current text; Enter commits.
  await click(cdp, mid.x, mid.y, 1);
  await click(cdp, mid.x, mid.y, 2);
  await waitUntilTrue(cdp, "!!document.querySelector('.pe-text-input')");
  assert.equal(await evaluate(cdp, "document.querySelector('.pe-text-input').value"), 'Hi');
  await evaluate(cdp, "document.querySelector('.pe-text-input').select()");
  await cdp.send('Input.insertText', { text: 'Bye' });
  await key(cdp, 'Enter', 'Enter', 13, '\r');
  assert.equal(await evaluate(cdp, 'editor.work.markup[0].text'), 'Bye');
  await evaluate(cdp, "editorCommand('undo')", { awaitPromise: true });
  assert.equal(await evaluate(cdp, 'editor.work.markup[0].text'), 'Hi');
  await evaluate(cdp, "editorCommand('redo')", { awaitPromise: true });
  assert.equal(await evaluate(cdp, 'editor.work.markup[0].text'), 'Bye');

  // Rotating keeps the size and text; saving writes them to the photo.
  await evaluate(cdp, "editorCommand('rotate')", { awaitPromise: true });
  await evaluate(cdp, "editorCommand('save')", { awaitPromise: true });
  const saved = await json(cdp, 'state.report.photos[window.testPhotoId].markup[0]');
  assert.equal(saved.text, 'Bye');
  assert.equal(saved.size, grown.size);
}, { profilePrefix: 'fr-text-edit-', windowSize: '1280,900' }));

test('photo editor: double-tapping a text label opens it for editing', () => withPage(async (cdp) => {
  await unlock(cdp);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  await evaluate(cdp, `
    (async () => {
      const c = document.createElement('canvas');
      c.width = 400; c.height = 300;
      const photo = createPhoto(c.toDataURL('image/png'), 'test.png');
      photo.markup.push({ id: 't1', type: 'text', x: 100, y: 100, text: 'Hi', size: 20, color: '#E02424', width: 0 });
      state.report.photos[photo.id] = photo;
      await openPhotoEditor(photo.id);
    })()
  `, { awaitPromise: true });
  await frame();
  const mid = await json(cdp, toScreen('{ x: 108, y: 110 }'));
  const tap = async () => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: mid.x, y: mid.y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await tap();
  assert.equal(await evaluate(cdp, 'editor.selectedId'), 't1');
  assert.equal(await evaluate(cdp, "!!document.querySelector('.pe-text-input')"), false, 'one tap only selects');
  await tap();
  await waitUntilTrue(cdp, "!!document.querySelector('.pe-text-input')");
  assert.equal(await evaluate(cdp, "document.querySelector('.pe-text-input').value"), 'Hi');
}, { profilePrefix: 'fr-text-tap-', windowSize: '1280,900' }));
