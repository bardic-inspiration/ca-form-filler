// In-cell photo quick edits (issue #10): the floating toolbar, crop mode with
// real mouse and touch input over the Chrome DevTools Protocol, quick rotate,
// and undo. Needs a Chrome, Chromium or Edge binary: set CHROME_PATH, or have
// one on PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HTML_PATH } from './load-core.mjs';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge',
  '/opt/pw-browsers/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

function findChrome() {
  for (const bin of CANDIDATES) {
    if (spawnSync(bin, ['--version'], { encoding: 'utf8' }).status === 0) return bin;
  }
  throw new Error('No Chrome/Chromium/Edge found. Set CHROME_PATH to run this test.');
}

function waitForDevtoolsUrl(proc, timeout = 15000) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const t = setTimeout(() => reject(new Error('timed out waiting for the DevTools websocket URL: ' + buf)), timeout);
    proc.stderr.on('data', (chunk) => {
      buf += chunk.toString();
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(t); resolve(m[1]); }
    });
    proc.on('exit', (code) => { clearTimeout(t); reject(new Error(`chrome exited early (code ${code}): ${buf}`)); });
  });
}

function connectCDP(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();
    ws.addEventListener('open', () => resolve({ send, close: () => ws.close() }));
    ws.addEventListener('error', () => reject(new Error('CDP websocket error')));
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (!msg.id || !pending.has(msg.id)) return;
      const { resolve: res, reject: rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(msg.error.message));
      else res(msg.result);
    });
    function send(method, params = {}) {
      const id = nextId++;
      return new Promise((res, rej) => {
        pending.set(id, { resolve: res, reject: rej });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }
  });
}

async function evaluate(cdp, expression, { awaitPromise = false } = {}) {
  const res = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (res.exceptionDetails) {
    throw new Error(`${res.exceptionDetails.text}: ${JSON.stringify(res.exceptionDetails.exception)}`);
  }
  return res.result.value;
}

// Polls until the expression is truthy. While the page is still loading
// (a slow CI runner) `document` can be empty, so errors mean "not yet".
async function waitUntilTrue(cdp, expression, timeout = 10000) {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeout) {
    try {
      if (await evaluate(cdp, expression)) return;
      lastError = null;
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timed out waiting for: ${expression}` + (lastError ? ` (last error: ${lastError.message})` : ''));
}

async function click(cdp, x, y, clickCount = 1) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount });
}

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

async function withPage(fn) {
  const chrome = findChrome();
  const profile = mkdtempSync(join(tmpdir(), 'fr-quick-edit-'));
  const proc = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run',
    '--host-resolver-rules=MAP * ~NOTFOUND', `--user-data-dir=${profile}`,
    '--remote-debugging-port=0', '--window-size=1280,900',
    pathToFileURL(HTML_PATH).href,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  try {
    const browserWsUrl = await waitForDevtoolsUrl(proc);
    const port = browserWsUrl.match(/:(\d+)\//)[1];
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
    const page = targets.find((t) => t.type === 'page');
    assert.ok(page, 'no page target found');
    const cdp = await connectCDP(page.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await waitUntilTrue(cdp, "document.documentElement.dataset.ready === 'true'");
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
    cdp.close();
  } finally {
    proc.kill();
  }
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
