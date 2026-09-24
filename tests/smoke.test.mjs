// Boots field-report.html in headless Chrome/Chromium from file:// with DNS
// disabled, and checks the app starts without errors and can print.
// Needs a Chrome, Chromium or Edge binary: set CHROME_PATH, or have one on PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
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
  throw new Error('No Chrome/Chromium/Edge found. Set CHROME_PATH to run the smoke test.');
}

function runChrome(args, profile = mkdtempSync(join(tmpdir(), 'fr-smoke-'))) {
  const chrome = findChrome();
  const result = spawnSync(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run',
    '--host-resolver-rules=MAP * ~NOTFOUND', `--user-data-dir=${profile}`,
    '--virtual-time-budget=5000', ...args, pathToFileURL(HTML_PATH).href,
  ], { encoding: 'latin1', maxBuffer: 64 * 1024 * 1024, timeout: 60000 });
  return { ...result, profile };
}

test('boots offline from file:// without script errors', () => {
  const { stdout, stderr, status } = runChrome(['--dump-dom']);
  assert.equal(status, 0, stderr);
  const htmlTag = stdout.match(/<html[^>]*>/)[0];
  assert.doesNotMatch(htmlTag, /data-error=/, 'app reported an error: ' + htmlTag);
  assert.match(htmlTag, /data-ready="true"/, 'app did not finish starting');
  assert.match(stdout, /id="sec-observations"/);
});

test('prints to PDF', () => {
  const profile = mkdtempSync(join(tmpdir(), 'fr-smoke-'));
  const pdf = join(profile, 'out.pdf');
  const { status, stderr } = runChrome([`--print-to-pdf=${pdf}`, '--no-pdf-header-footer'], profile);
  assert.equal(status, 0, stderr);
  assert.equal(readFileSync(pdf).subarray(0, 5).toString(), '%PDF-');
});
