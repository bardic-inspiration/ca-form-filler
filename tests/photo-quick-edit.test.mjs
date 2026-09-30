// In-cell photo quick edits (issue #10): the floating toolbar, crop mode with
// real mouse and touch input over the Chrome DevTools Protocol, quick rotate,
// and undo. Needs a Chrome, Chromium or Edge binary: set CHROME_PATH, or have
// one on PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { click, evaluate, waitUntilTrue, unlock, withPage as withChromePage } from './browser.mjs';

async function drag(cdp, from, to, steps = 8) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
  }
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1 });
}

async function touchDrag(cdp, from, to, steps = 8) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await new Promise((r) => setTimeout(r, 16));
  }
  // Hold still before lifting, as a finger does, so the browser doesn't see a fling.
  await new Promise((r) => setTimeout(r, 150));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function key(cdp, name, code, keyCode, modifiers = 0) {
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code, windowsVirtualKeyCode: keyCode, modifiers });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code, windowsVirtualKeyCode: keyCode, modifiers });
}

// Center of an element, or of one of its sides / corners ('e', 'nw', …),
// once it has stopped moving (a cropped preview can load after a re-render).
async function point(cdp, selector, where = '') {
  const read = () => evaluate(cdp, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const w = ${JSON.stringify(where)};
    const x = w.includes('w') ? r.left : w.includes('e') ? r.right : r.left + r.width / 2;
    const y = w.includes('n') ? r.top : w.includes('s') ? r.bottom : r.top + r.height / 2;
    return JSON.stringify({ x: Math.round(x), y: Math.round(y) });
  })()`);
  const start = Date.now();
  let last = await read();
  while (Date.now() - start < 10000) {
    await new Promise((r) => setTimeout(r, 100));
    const next = await read();
    if (next && next === last) return JSON.parse(next);
    last = next;
  }
  throw new Error(`${selector} never settled`);
}

const PHOTO = () => "state.report.photos[state.report.observations[0].photoIds[0]]";
const toolbarActions = (cdp) => evaluate(cdp,
  "document.getElementById('float-bar').hidden ? [] : [...document.querySelectorAll('#float-bar button')].map((b) => b.dataset.action)");

function withPage(fn) {
  return withChromePage(async (cdp) => {
    await unlock(cdp);
    // One observation holding one 200 × 100 photo.
    await evaluate(cdp, `(async () => {
      const c = document.createElement('canvas');
      c.width = 200; c.height = 100;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#3a7'; ctx.fillRect(0, 0, 200, 100);
      ctx.fillStyle = '#c33'; ctx.fillRect(0, 0, 50, 50);
      const photo = createPhoto(c.toDataURL('image/jpeg', 0.9), 'test.jpg');
      state.report.photos[photo.id] = photo;
      addObservation();
      state.report.observations[0].photoIds.push(photo.id);
      renderAll();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    })()`, { awaitPromise: true });
    await waitUntilTrue(cdp, "document.querySelector('.photo img').complete && document.querySelector('.photo').offsetHeight > 40");
    await fn(cdp);
  }, { profilePrefix: 'fr-quick-edit-', windowSize: '1280,900' });
}

test('selecting a photo shows the floating toolbar; unselected photos show no controls', () => withPage(async (cdp) => {
  assert.equal(await evaluate(cdp, "document.querySelectorAll('.photo button').length"), 0);
  assert.deepEqual(await toolbarActions(cdp), []);
  await click(cdp, ...Object.values(await point(cdp, '.photo')));
  await waitUntilTrue(cdp, "!document.getElementById('float-bar').hidden");
  assert.deepEqual(await toolbarActions(cdp), ['crop', 'rotate', 'edit', 'remove']);
  const above = await evaluate(cdp, `document.getElementById('float-bar').getBoundingClientRect().bottom
    <= document.querySelector('.photo').getBoundingClientRect().top`);
  assert.equal(above, true, 'the toolbar sits above the photo');
  // Clicking elsewhere clears the selection and hides the toolbar.
  await click(cdp, 5, 880);
  assert.deepEqual(await toolbarActions(cdp), []);
}));

test('crop with the mouse: drag an edge, apply with ✓, undo restores the previous crop', () => withPage(async (cdp) => {
  await click(cdp, ...Object.values(await point(cdp, '.photo')));
  await click(cdp, ...Object.values(await point(cdp, '#float-bar [data-action=crop]')));
  await waitUntilTrue(cdp, "!!document.querySelector('.photo.cropping .crop-box')");
  assert.deepEqual(await toolbarActions(cdp), ['apply', 'cancel']);
  assert.equal(await evaluate(cdp, "document.querySelectorAll('.photo-handle').length"), 0, 'resize handles are off');

  const fig = JSON.parse(await evaluate(cdp, "JSON.stringify(document.querySelector('.photo').getBoundingClientRect())"));
  const e = await point(cdp, '.crop-handle[data-edge=e]');
  await drag(cdp, e, { x: e.x - fig.width / 2, y: e.y });
  const s = await point(cdp, '.crop-handle[data-edge=s]');
  await drag(cdp, s, { x: s.x, y: s.y - fig.height / 2 });
  await click(cdp, ...Object.values(await point(cdp, '#float-bar [data-action=apply]')));
  const crop = JSON.parse(await evaluate(cdp, `JSON.stringify(${PHOTO()}.crop)`));
  assert.ok(crop, 'a crop was applied');
  assert.equal(crop.x, 0);
  assert.equal(crop.y, 0);
  assert.ok(Math.abs(crop.w - 100) <= 3, 'width ' + crop.w);
  assert.ok(Math.abs(crop.h - 50) <= 3, 'height ' + crop.h);
  assert.equal(await evaluate(cdp, "!!document.querySelector('.photo.cropping')"), false);
  assert.deepEqual(await toolbarActions(cdp), ['crop', 'rotate', 'edit', 'remove']);

  // Re-entering crop mode shows the saved crop, and it can grow back out.
  await click(cdp, ...Object.values(await point(cdp, '#float-bar [data-action=crop]')));
  await waitUntilTrue(cdp, "!!document.querySelector('.photo.cropping .crop-box')");
  const boxWidth = await evaluate(cdp, "document.querySelector('.crop-box').style.width");
  assert.equal(boxWidth, '50%');
  await key(cdp, 'Escape', 'Escape', 27);
  assert.equal(await evaluate(cdp, "!!document.querySelector('.photo.cropping')"), false);
  assert.equal(JSON.parse(await evaluate(cdp, `JSON.stringify(${PHOTO()}.crop)`)).w, crop.w, 'Escape discards');

  await key(cdp, 'z', 'KeyZ', 90, 2);
  assert.equal(await evaluate(cdp, `${PHOTO()}.crop`), null, 'undo restores no crop');
}));

test('crop with touch: move the box, discard with ✕, apply by tapping outside', () => withPage(async (cdp) => {
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await evaluate(cdp, `${PHOTO()}.crop = { x: 0, y: 0, w: 100, h: 50 }; renderAll();`);
  await waitUntilTrue(cdp, "document.querySelector('.photo img').complete");
  const tap = async (p) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await tap(await point(cdp, '.photo'));
  await waitUntilTrue(cdp, "!document.getElementById('float-bar').hidden");
  await tap(await point(cdp, '#float-bar [data-action=crop]'));
  await waitUntilTrue(cdp, "!!document.querySelector('.photo.cropping .crop-box')");

  const fig = JSON.parse(await evaluate(cdp, "JSON.stringify(document.querySelector('.photo').getBoundingClientRect())"));
  const center = await point(cdp, '.crop-box');
  await touchDrag(cdp, center, { x: center.x + fig.width, y: center.y + fig.height });
  const moved = await evaluate(cdp, "[document.querySelector('.crop-box').style.left, document.querySelector('.crop-box').style.top].join()");
  assert.equal(moved, '50%,50%', 'the box moves and stays inside the photo');
  await tap(await point(cdp, '#float-bar [data-action=cancel]'));
  assert.deepEqual(JSON.parse(await evaluate(cdp, `JSON.stringify(${PHOTO()}.crop)`)), { x: 0, y: 0, w: 100, h: 50 });

  await tap(await point(cdp, '.photo'));
  await tap(await point(cdp, '#float-bar [data-action=crop]'));
  await waitUntilTrue(cdp, "!!document.querySelector('.photo.cropping .crop-box')");
  const se = await point(cdp, '.crop-handle[data-edge=se]');
  await touchDrag(cdp, se, { x: se.x + fig.width, y: se.y + fig.height });
  await tap({ x: 5, y: 880 });
  assert.equal(await evaluate(cdp, `${PHOTO()}.crop`), null, 'a crop covering the whole photo is stored as null');
  assert.deepEqual(await toolbarActions(cdp), []);
}));

test('quick rotate turns the photo and its crop; undo restores them', () => withPage(async (cdp) => {
  await evaluate(cdp, `${PHOTO()}.crop = { x: 0, y: 0, w: 50, h: 50 }; renderAll();`);
  const before = await evaluate(cdp, `${PHOTO()}.original`);
  await click(cdp, ...Object.values(await point(cdp, '.photo')));
  await click(cdp, ...Object.values(await point(cdp, '#float-bar [data-action=rotate]')));
  await waitUntilTrue(cdp, `${PHOTO()}.original !== ${JSON.stringify(before)}`);
  const size = await evaluate(cdp, `(async () => { const i = await loadImage(${PHOTO()}.original); return i.naturalWidth + 'x' + i.naturalHeight; })()`, { awaitPromise: true });
  assert.equal(size, '100x200');
  assert.deepEqual(JSON.parse(await evaluate(cdp, `JSON.stringify(${PHOTO()}.crop)`)), { x: 50, y: 0, w: 50, h: 50 });
  await key(cdp, 'z', 'KeyZ', 90, 2);
  assert.equal(await evaluate(cdp, `${PHOTO()}.original === ${JSON.stringify(before)}`), true);
  assert.deepEqual(JSON.parse(await evaluate(cdp, `JSON.stringify(${PHOTO()}.crop)`)), { x: 0, y: 0, w: 50, h: 50 });
}));

test('saving the full photo editor is one undo step, so undo never reverts it by accident', () => withPage(async (cdp) => {
  const before = await evaluate(cdp, `${PHOTO()}.original`);
  await evaluate(cdp, `(async () => {
    await openPhotoEditor(${PHOTO()}.id);
    await editorCommand('rotate');
    closePhotoEditor(true);
  })()`, { awaitPromise: true });
  assert.equal(await evaluate(cdp, `${PHOTO()}.original !== ${JSON.stringify(before)}`), true);
  await key(cdp, 'z', 'KeyZ', 90, 2);
  assert.equal(await evaluate(cdp, `${PHOTO()}.original === ${JSON.stringify(before)}`), true);
}));

// Photo move controls (issue #9): an opt-in setting adds Move earlier / Move
// later to the toolbar and Alt+arrow keys on a focused photo.
async function addTwoPhotos(cdp) {
  await evaluate(cdp, `(async () => {
    for (const color of ['#33c', '#cc3']) {
      const c = document.createElement('canvas');
      c.width = 200; c.height = 100;
      const ctx = c.getContext('2d');
      ctx.fillStyle = color; ctx.fillRect(0, 0, 200, 100);
      const photo = createPhoto(c.toDataURL('image/jpeg', 0.9), 'more.jpg');
      state.report.photos[photo.id] = photo;
      state.report.observations[0].photoIds.push(photo.id);
      photo.display.width = 25;
    }
    ${PHOTO()}.display.width = 25;
    renderAll();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  })()`, { awaitPromise: true });
  await waitUntilTrue(cdp, "[...document.querySelectorAll('.photo img')].every((i) => i.complete)");
  return evaluate(cdp, 'state.report.observations[0].photoIds.slice()');
}
const photoOrder = (cdp) => evaluate(cdp, 'state.report.observations[0].photoIds.slice()');
const moveButtons = (cdp) => evaluate(cdp, `JSON.stringify([...document.querySelectorAll('#float-bar [data-action^=move]')]
  .map((b) => ({ action: b.dataset.action, label: b.getAttribute('aria-label'), disabled: b.disabled,
    w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height })))`).then(JSON.parse);

test('photo move controls are off by default, so the toolbar and Alt+arrow keys are unchanged', () => withPage(async (cdp) => {
  const ids = await addTwoPhotos(cdp);
  await click(cdp, ...Object.values(await point(cdp, '.photo')));
  assert.deepEqual(await toolbarActions(cdp), ['crop', 'rotate', 'edit', 'remove']);
  await evaluate(cdp, "document.querySelector('.photo').focus()");
  await key(cdp, 'ArrowRight', 'ArrowRight', 39, 1);
  assert.deepEqual(await photoOrder(cdp), ids);
}));

test('Settings → Accessibility turns on move buttons that reorder within the cell, one undo step each', () => withPage(async (cdp) => {
  const ids = await addTwoPhotos(cdp);
  await evaluate(cdp, 'openConfig()');
  const toggled = await evaluate(cdp, `(() => {
    const section = [...document.querySelectorAll('#config-panel .config-section')]
      .find((s) => s.querySelector('h3').textContent === 'Accessibility');
    const box = section && section.querySelector('input[type=checkbox]');
    if (!box || box.checked) return false;
    box.click();
    return true;
  })()`);
  assert.equal(toggled, true, 'an unchecked toggle in an Accessibility section');
  assert.equal(await evaluate(cdp, 'state.report.config.photoMoveControls'), true);
  await evaluate(cdp, 'closeConfig()');

  await click(cdp, ...Object.values(await point(cdp, `.photo[data-photo-id="${ids[0]}"]`)));
  assert.deepEqual(await toolbarActions(cdp), ['crop', 'rotate', 'moveEarlier', 'moveLater', 'edit', 'remove']);
  const first = await moveButtons(cdp);
  assert.deepEqual(first.map((b) => [b.action, b.label, b.disabled]),
    [['moveEarlier', 'Move photo earlier', true], ['moveLater', 'Move photo later', false]]);
  assert.ok(first.every((b) => b.w >= 36 && b.h >= 36), 'touch targets are at least 36 px');

  await click(cdp, ...Object.values(await point(cdp, '#float-bar [data-action=moveLater]')));
  assert.deepEqual(await photoOrder(cdp), [ids[1], ids[0], ids[2]]);
  await waitUntilTrue(cdp, "document.activeElement && document.activeElement.dataset.action === 'moveLater'");
  await click(cdp, ...Object.values(await point(cdp, '#float-bar [data-action=moveLater]')));
  assert.deepEqual(await photoOrder(cdp), [ids[1], ids[2], ids[0]]);
  const last = await moveButtons(cdp);
  assert.deepEqual(last.map((b) => b.disabled), [false, true], 'the last photo cannot move later');
  await waitUntilTrue(cdp, "document.activeElement && document.activeElement.dataset.action === 'moveEarlier'");

  await key(cdp, 'z', 'KeyZ', 90, 2);
  assert.deepEqual(await photoOrder(cdp), [ids[1], ids[0], ids[2]]);
  await key(cdp, 'z', 'KeyZ', 90, 2);
  assert.deepEqual(await photoOrder(cdp), ids);
}));

test('with move controls on, Alt+arrow keys move a focused photo and focus follows it', () => withPage(async (cdp) => {
  const ids = await addTwoPhotos(cdp);
  await evaluate(cdp, "setConfig('photoMoveControls', true)");
  await evaluate(cdp, `document.querySelector('.photo[data-photo-id="${ids[0]}"]').focus()`);
  const focusedId = () => evaluate(cdp, 'document.activeElement.dataset.photoId || null');

  await key(cdp, 'ArrowDown', 'ArrowDown', 40, 1);
  assert.deepEqual(await photoOrder(cdp), [ids[1], ids[0], ids[2]]);
  assert.equal(await focusedId(), ids[0]);
  await key(cdp, 'ArrowRight', 'ArrowRight', 39, 1);
  assert.deepEqual(await photoOrder(cdp), [ids[1], ids[2], ids[0]]);
  assert.equal(await focusedId(), ids[0]);
  await key(cdp, 'ArrowRight', 'ArrowRight', 39, 1);
  assert.deepEqual(await photoOrder(cdp), [ids[1], ids[2], ids[0]], 'the last photo stays put');
  await key(cdp, 'ArrowUp', 'ArrowUp', 38, 1);
  await key(cdp, 'ArrowLeft', 'ArrowLeft', 37, 1);
  assert.deepEqual(await photoOrder(cdp), ids);
  assert.equal(await focusedId(), ids[0]);
  assert.equal(await evaluate(cdp, 'location.protocol'), 'file:', 'Alt+Left did not navigate away');

  await key(cdp, 'z', 'KeyZ', 90, 2);
  assert.deepEqual(await photoOrder(cdp), [ids[1], ids[0], ids[2]], 'each move is one undo step');
}));
