// The .page container must track the toolbar's content width on desktop:
// aligned edge to edge below the shared max-width (issue #13: the container
// looked "awkwardly narrow" against the full-bleed toolbar bar), but capped
// and centered together with it above that width, so a wide monitor doesn't
// stretch the form's fields edge to edge across the whole screen.
// Uses the Chrome DevTools Protocol for real layout. Needs a Chrome,
// Chromium or Edge binary: set CHROME_PATH, or have one on PATH.
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

async function waitUntilTrue(cdp, expression, timeout = 5000) {
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

async function withPage(fn, { windowSize = '1600,900' } = {}) {
  const chrome = findChrome();
  const profile = mkdtempSync(join(tmpdir(), 'fr-page-width-'));
  const proc = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run',
    '--host-resolver-rules=MAP * ~NOTFOUND', `--user-data-dir=${profile}`,
    '--remote-debugging-port=0', `--window-size=${windowSize}`,
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
    await fn(cdp);
    cdp.close();
  } finally {
    proc.kill();
  }
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
