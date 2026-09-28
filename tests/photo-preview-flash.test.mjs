// Issue #18: a cropped or marked-up photo shows its final look as soon as its
// cell renders. `setPhotoImage()` used to show `photo.original` first and swap
// in the flattened preview once `flattenPhoto()` resolved, so every re-render
// flashed the uncropped photo at a different height.
// Needs a Chrome, Chromium or Edge binary: set CHROME_PATH, or have one on PATH.
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

async function withPage(fn) {
  const chrome = findChrome();
  const profile = mkdtempSync(join(tmpdir(), 'fr-preview-flash-'));
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
    await evaluate(cdp, "document.getElementById('gate-input').value = 'carex'; document.getElementById('gate').requestSubmit()");
    await waitUntilTrue(cdp, "!document.body.classList.contains('locked')");
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
    cdp.close();
  } finally {
    proc.kill();
  }
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
