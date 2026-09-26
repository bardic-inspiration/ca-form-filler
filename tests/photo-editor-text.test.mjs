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

// A minimal 1x1 transparent PNG; only needs to decode, its content is irrelevant.
const TINY_PNG = 'data:image/png;base64,'
  + 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('text tool: clicking the canvas keeps the text box focused so text can be typed', async () => {
  const chrome = findChrome();
  const profile = mkdtempSync(join(tmpdir(), 'fr-editor-'));
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

    cdp.close();
  } finally {
    proc.kill();
  }
});
