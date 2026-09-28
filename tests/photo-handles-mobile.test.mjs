// Issue #17: on a phone-width viewport an observation row is a card with
// `overflow: hidden` (`.obs-table tr` in *css — responsive*), and a full-width
// photo's resize and crop handles sit 18px outside the photo's edge. With only
// 5px of `.photo-cell` padding between the photo and the card edge, 13px of
// each 36px handle is clipped and can't be reached by touch.
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

// A rect is fully inside another once every edge is within it — otherwise
// `.obs-table tr`'s `overflow: hidden` would clip it, visually and to touch.
function fullyInside(inner, outer) {
  return inner.left >= outer.left - 0.5 && inner.top >= outer.top - 0.5
    && inner.right <= outer.right + 0.5 && inner.bottom <= outer.bottom + 0.5;
}

async function withPage(fn) {
  const chrome = findChrome();
  const profile = mkdtempSync(join(tmpdir(), 'fr-handles-mobile-'));
  const proc = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run',
    '--host-resolver-rules=MAP * ~NOTFOUND', `--user-data-dir=${profile}`,
    '--remote-debugging-port=0', '--window-size=390,844',
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
    // One observation holding one full-width (default 100%) photo.
    await evaluate(cdp, `(async () => {
      const c = document.createElement('canvas');
      c.width = 200; c.height = 100;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#3a7'; ctx.fillRect(0, 0, 200, 100);
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

async function cardAndRects(cdp, selector) {
  return evaluate(cdp, `JSON.stringify({
    card: document.querySelector('#obs-body tr').getBoundingClientRect().toJSON(),
    rects: [...document.querySelectorAll(${JSON.stringify(selector)})].map((el) => el.getBoundingClientRect().toJSON()),
  })`).then(JSON.parse);
}

test('every resize handle of a full-width photo is fully visible inside its card on a phone-width viewport', () => withPage(async (cdp) => {
  await evaluate(cdp, "selectPhoto(document.querySelector('.photo').dataset.photoId);");
  await waitUntilTrue(cdp, "document.querySelectorAll('.photo-handle').length === 4");
  const { card, rects } = await cardAndRects(cdp, '.photo-handle');
  assert.equal(rects.length, 4);
  for (const rect of rects) {
    assert.ok(fullyInside(rect, card), `handle ${JSON.stringify(rect)} clipped by card ${JSON.stringify(card)}`);
  }
}));

test('every crop handle of a full-width photo is fully visible inside its card on a phone-width viewport', () => withPage(async (cdp) => {
  await evaluate(cdp, "startPhotoCrop(document.querySelector('.photo'));", { awaitPromise: true });
  await waitUntilTrue(cdp, "document.querySelectorAll('.crop-handle').length === 8");
  const { card, rects } = await cardAndRects(cdp, '.crop-handle');
  assert.equal(rects.length, 8);
  for (const rect of rects) {
    assert.ok(fullyInside(rect, card), `handle ${JSON.stringify(rect)} clipped by card ${JSON.stringify(card)}`);
  }
}));
