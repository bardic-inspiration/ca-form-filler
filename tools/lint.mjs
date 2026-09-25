#!/usr/bin/env node
// Zero-dependency checks for field-report.html:
//   1. every inline <script> parses;
//   2. nothing reaches the network (the tool must run offline from file://);
//   3. DEVELOPER.md lists every section (with its current line range),
//      every function and every custom event in the file;
//   4. errors go through notify: no empty catch without a comment, and no
//      console.* or alertDialog() calls outside the notify section.
// Usage: node tools/lint.mjs            run all checks
//        node tools/lint.mjs --file-map print the DEVELOPER.md file map table
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = (p) => fileURLToPath(new URL('../' + p, import.meta.url));
const html = readFileSync(root('field-report.html'), 'utf8');
const lines = html.split('\n');
const errors = [];

// Section markers, e.g. "/* ==== SECTION: app — state ==== */".
const sections = [];
lines.forEach((line, i) => {
  const m = line.match(/==== SECTION: (.+?) ====/);
  if (m) sections.push({ name: m[1], start: i + 1 });
});
sections.forEach((s, i) => { s.end = i + 1 < sections.length ? sections[i + 1].start - 1 : lines.length; });

if (process.argv.includes('--file-map')) {
  console.log('| Section | Lines |\n| --- | --- |');
  for (const s of sections) console.log(`| ${s.name} | ${s.start}–${s.end} |`);
  process.exit(0);
}

// 1. Scripts parse, and none load external code.
const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
for (const [, attrs, body] of scripts) {
  if (/\bsrc=/.test(attrs)) errors.push(`external script not allowed: <script${attrs}>`);
  try {
    new vm.Script(body, { filename: `field-report.html <script${attrs}>` });
  } catch (err) {
    errors.push(`syntax error in <script${attrs}>: ${err.message}`);
  }
}

// 2. Offline: no URLs to fetch, no network APIs.
const offline = [
  [/\b(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i, 'external src/href'],
  [/<link\b[^>]*rel=["']?stylesheet/i, 'external stylesheet'],
  [/@import\b/, 'CSS @import'],
  [/url\(\s*["']?(?:https?:)?\/\//i, 'external CSS url()'],
  [/\bfetch\s*\(/, 'fetch()'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\bsendBeacon\b/, 'sendBeacon'],
  [/\bimport\s*\(/, 'dynamic import()'],
];
lines.forEach((line, i) => {
  for (const [re, what] of offline) {
    if (re.test(line)) errors.push(`field-report.html:${i + 1}: network access not allowed (${what})`);
  }
});

// 4. Error handling goes through notify.
const lineOf = (index) => html.slice(0, index).split('\n').length;
const emptyCatch = [
  /\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/g, // try {} catch (err) {}
  /\.catch\(\s*(?:\(\s*\w*\s*\)|\w+)\s*=>\s*(?:\{\s*\}|undefined|null)\s*\)/g, // .catch(() => {})
];
for (const re of emptyCatch) {
  for (const m of html.matchAll(re)) {
    errors.push(`field-report.html:${lineOf(m.index)}: empty catch; report it through notify or add a comment saying why it is silent`);
  }
}
const notifySection = sections.find((s) => s.name.startsWith('app — notify'));
lines.forEach((line, i) => {
  const n = i + 1;
  const inNotify = notifySection && n >= notifySection.start && n <= notifySection.end;
  if (inNotify || /^async function alertDialog\(/.test(line)) return;
  if (/\bconsole\.\w+/.test(line)) errors.push(`field-report.html:${n}: use notify instead of console`);
  if (/\balertDialog\(/.test(line)) errors.push(`field-report.html:${n}: use notify.error() instead of alertDialog()`);
});

// 3. DEVELOPER.md stays in sync with the code.
let dev = '';
try {
  dev = readFileSync(root('DEVELOPER.md'), 'utf8');
} catch {
  errors.push('DEVELOPER.md is missing');
}
if (dev) {
  for (const s of sections) {
    if (!dev.includes(`| ${s.name} | ${s.start}–${s.end} |`)) {
      errors.push(`DEVELOPER.md file map: expected row "| ${s.name} | ${s.start}–${s.end} |" (run: node tools/lint.mjs --file-map)`);
    }
  }
  const code = scripts.map(([, , body]) => body).join('\n');
  const functions = new Set([...code.matchAll(/^(?:async )?function (\w+)\(/gm)].map((m) => m[1]));
  const classes = new Set([...code.matchAll(/^class (\w+)/gm)].map((m) => m[1]));
  for (const name of [...functions, ...classes]) {
    if (!new RegExp('`' + name + '\\(').test(dev) && !dev.includes('`' + name + '`')) {
      errors.push(`DEVELOPER.md does not document ${name}()`);
    }
  }
  const documented = new Set([...dev.matchAll(/`(\w+)\(/g)].map((m) => m[1]));
  for (const name of documented) {
    if (!new RegExp(`\\b${name}\\b`).test(code)) {
      errors.push(`DEVELOPER.md documents ${name}(), which no longer exists`);
    }
  }
  for (const [, name] of code.matchAll(/emit\('([\w:]+)'/g)) {
    if (!dev.includes('`' + name + '`')) errors.push(`DEVELOPER.md does not list event ${name}`);
  }
}

if (errors.length) {
  console.error(errors.map((e) => '✗ ' + e).join('\n'));
  console.error(`\n${errors.length} problem(s).`);
  process.exit(1);
}
console.log(`✓ field-report.html: ${scripts.length} scripts parse, offline-only, errors via notify, DEVELOPER.md in sync (${sections.length} sections).`);
