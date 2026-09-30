// Boots field-report.html in headless Chrome/Chromium from file:// with DNS
// disabled, and checks the app starts without errors and can print.
// Needs a Chrome, Chromium or Edge binary: set CHROME_PATH, or have one on PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PAGE_URL, chromeArgs, findChrome, tempProfile } from './browser.mjs';

function runChrome(args, profile = tempProfile('fr-smoke-')) {
  const result = spawnSync(findChrome(), [
    ...chromeArgs(profile),
    '--virtual-time-budget=5000', ...args, PAGE_URL,
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

test('starts locked behind the password prompt', () => {
  const { stdout, status, stderr } = runChrome(['--dump-dom']);
  assert.equal(status, 0, stderr);
  assert.match(stdout, /<body[^>]*class="[^"]*\blocked\b/, 'body is not locked');
  assert.match(stdout, /<form[^>]*id="gate"/, 'password prompt missing');
  assert.doesNotMatch(stdout, /<form[^>]*id="gate"[^>]*hidden/, 'password prompt hidden');
});

test('prints to PDF', () => {
  const profile = tempProfile('fr-smoke-');
  const pdf = join(profile, 'out.pdf');
  const { status, stderr } = runChrome([`--print-to-pdf=${pdf}`, '--no-pdf-header-footer'], profile);
  assert.equal(status, 0, stderr);
  assert.equal(readFileSync(pdf).subarray(0, 5).toString(), '%PDF-');
});
