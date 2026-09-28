// Loads the pure `core` module out of field-report.html into a Node vm
// context, so its logic can be tested without a browser.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const HTML_PATH = fileURLToPath(new URL('../field-report.html', import.meta.url));

export function extractScript(html, id) {
  const match = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`));
  if (!match) throw new Error(`<script id="${id}"> not found in field-report.html`);
  return match[1];
}

export function loadCore() {
  const html = readFileSync(HTML_PATH, 'utf8');
  const context = vm.createContext({ crypto: globalThis.crypto, TextEncoder });
  vm.runInContext(extractScript(html, 'core'), context, { filename: 'field-report.html#core' });
  return vm.runInContext('Core', context);
}
