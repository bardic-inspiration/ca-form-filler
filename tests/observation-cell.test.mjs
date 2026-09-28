// The Observation and Contract Requirement textareas must fill their table
// cell's full height, not just the height of their own text (issue #7), and
// the status/tag pills anchored to the bottom of the Contract Requirement
// cell must never overlap the requirement text above them (issue #33). Uses
// the Chrome DevTools Protocol for real layout. Needs a Chrome, Chromium or
// Edge binary: set CHROME_PATH, or have one on PATH.
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

async function withPage(fn) {
  const chrome = findChrome();
  const profile = mkdtempSync(join(tmpdir(), 'fr-obs-cell-'));
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
    await fn(cdp);
    cdp.close();
  } finally {
    proc.kill();
  }
}

test('Observation textarea and Contract Requirement cell fill the full height of a tall row', () => withPage(async (cdp) => {
  // A very tall (portrait) photo forces the row much taller than either
  // textarea's own text content, so a content-sized textarea would leave a
  // visible gap below it.
  await evaluate(cdp, `(async () => {
    const c = document.createElement('canvas');
    c.width = 100; c.height = 800;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#3a7'; ctx.fillRect(0, 0, 100, 800);
    const photo = createPhoto(c.toDataURL('image/jpeg', 0.9), 'tall.jpg');
    state.report.photos[photo.id] = photo;
    addObservation();
    state.report.observations[0].photoIds.push(photo.id);
    state.report.observations[0].description = 'short';
    state.report.observations[0].requirement = 'short';
    renderAll();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  })()`, { awaitPromise: true });
  await waitUntilTrue(cdp, "document.querySelector('.photo img').complete && document.querySelector('.photo').offsetHeight > 150");

  const rects = JSON.parse(await evaluate(cdp, `JSON.stringify({
    row: document.querySelector('#obs-body tr').getBoundingClientRect(),
    description: document.querySelector('textarea[data-field="description"]').getBoundingClientRect(),
    cellFill: document.querySelector('.cell-fill').getBoundingClientRect(),
  })`));

  assert.ok(rects.row.height > 150, `row should be tall because of the photo, was ${rects.row.height}`);
  assert.ok(
    rects.description.height >= rects.row.height - 2,
    `Observation textarea (${rects.description.height}px) should fill the row height (${rects.row.height}px)`,
  );
  assert.ok(
    rects.cellFill.height >= rects.row.height - 2,
    `Contract Requirement cell (${rects.cellFill.height}px) should fill the row height (${rects.row.height}px)`,
  );
}));

test('Status/tag pills sit bottom-anchored in the Contract Requirement cell without overlapping the text above (issue #33)', () => withPage(async (cdp) => {
  // A tall photo plus a long requirement and several tags: the requirement
  // text (top-anchored) and the pill strip (bottom-anchored) must split the
  // tall row without colliding, and none of it should land in the narrow
  // Item column anymore.
  await evaluate(cdp, `(async () => {
    const c = document.createElement('canvas');
    c.width = 100; c.height = 800;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#3a7'; ctx.fillRect(0, 0, 100, 800);
    const photo = createPhoto(c.toDataURL('image/jpeg', 0.9), 'tall.jpg');
    state.report.photos[photo.id] = photo;
    addObservation();
    const o = state.report.observations[0];
    o.photoIds.push(photo.id);
    o.description = 'short';
    o.requirement = 'A long contract requirement that wraps across several lines of text in its cell.';
    for (const name of ['Scope A', 'Scope B', 'A longer tag name', 'Fourth tag']) {
      const tag = { id: uuid(), name, color: 'yellow' };
      state.report.tags.push(tag);
      o.tagIds.push(tag.id);
    }
    renderAll();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  })()`, { awaitPromise: true });
  await waitUntilTrue(cdp, "document.querySelector('.photo img').complete && document.querySelector('.photo').offsetHeight > 150");

  const rects = JSON.parse(await evaluate(cdp, `JSON.stringify({
    row: document.querySelector('#obs-body tr').getBoundingClientRect(),
    reqTd: document.querySelectorAll('#obs-body tr td')[3].getBoundingClientRect(),
    requirementTextarea: document.querySelector('textarea[data-field="requirement"]').getBoundingClientRect(),
    pills: document.querySelector('.pills').getBoundingClientRect(),
    itemCellHasPill: !!document.querySelector('.item-cell .pill-tag'),
    pillCount: document.querySelectorAll('.pills .pill-tag').length,
  })`));

  assert.equal(rects.itemCellHasPill, false, 'tag pills should no longer render in the narrow Item column');
  assert.equal(rects.pillCount, 4, 'all four tags should render as pills');
  assert.ok(
    rects.pills.width <= rects.reqTd.width + 1,
    `pill strip (${rects.pills.width}px) should fit within the Contract Requirement column (${rects.reqTd.width}px)`,
  );
  assert.ok(
    rects.pills.bottom <= rects.reqTd.bottom + 2,
    `pill strip (bottom ${rects.pills.bottom}) should stay within the cell (bottom ${rects.reqTd.bottom})`,
  );
  assert.ok(
    rects.requirementTextarea.bottom <= rects.pills.top + 1,
    `requirement text (bottom ${rects.requirementTextarea.bottom}) should not overlap the pill strip (top ${rects.pills.top})`,
  );
}));
