// Shared plumbing for the browser tests: finds a Chrome, Chromium or Edge
// binary, launches it headless on field-report.html, and drives the page over
// the Chrome DevTools Protocol (CDP) with Node's built-in WebSocket client (no
// added dependency). Set CHROME_PATH, or have a browser on PATH.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HTML_PATH } from './load-core.mjs';

export const PAGE_URL = pathToFileURL(HTML_PATH).href;

const CANDIDATES = [
  process.env.CHROME_PATH,
  'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge',
  '/opt/pw-browsers/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

export function findChrome() {
  for (const bin of CANDIDATES) {
    if (spawnSync(bin, ['--version'], { encoding: 'utf8' }).status === 0) return bin;
  }
  throw new Error('No Chrome/Chromium/Edge found. Set CHROME_PATH to run the browser tests.');
}

// Headless and offline (DNS disabled), using the profile directory `profile`.
export function chromeArgs(profile) {
  return [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run',
    '--host-resolver-rules=MAP * ~NOTFOUND', `--user-data-dir=${profile}`,
  ];
}

export function tempProfile(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
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

export async function evaluate(cdp, expression, { awaitPromise = false } = {}) {
  const res = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (res.exceptionDetails) {
    throw new Error(`${res.exceptionDetails.text}: ${JSON.stringify(res.exceptionDetails.exception)}`);
  }
  return res.result.value;
}

// Polls until the expression is truthy. While the page is still loading
// (a slow CI runner) `document` can be empty, so errors mean "not yet".
export async function waitUntilTrue(cdp, expression, timeout = 10000) {
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

// A real, trusted mouse click at viewport coordinates.
export async function click(cdp, x, y, clickCount = 1) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount });
}

// Enters the password on the startup gate and waits for the app to unlock.
export async function unlock(cdp) {
  await evaluate(cdp, "document.getElementById('gate-input').value = 'carex'; document.getElementById('gate').requestSubmit()");
  await waitUntilTrue(cdp, "!document.body.classList.contains('locked')");
}

// Launches Chrome on field-report.html at `windowSize`, waits for the app to
// report ready, runs `fn(cdp)`, then closes the browser.
export async function withPage(fn, { profilePrefix = 'fr-browser-', windowSize = '1280,900' } = {}) {
  const proc = spawn(findChrome(), [
    ...chromeArgs(tempProfile(profilePrefix)),
    '--remote-debugging-port=0', `--window-size=${windowSize}`,
    PAGE_URL,
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
