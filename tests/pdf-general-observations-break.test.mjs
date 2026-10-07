// Issue #50: the PDF renderer used to force a page break between the general
// observations box and the numbered observation table (`break-before: page`
// on `.pr-table`), leaving a block of white space on page 1 whenever the
// general observations didn't fill it. The table should instead start a
// consistent gap below the general observations and only move to a later
// page when the content actually overflows.
// Uses the Chrome DevTools Protocol for real layout and printing. Needs a
// Chrome, Chromium or Edge binary: set CHROME_PATH, or have one on PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, unlock, withPage as withChromePage } from './browser.mjs';

function withPage(fn) {
  return withChromePage(async (cdp) => {
    await unlock(cdp);
    await fn(cdp);
  }, { profilePrefix: 'fr-pdf-break-', windowSize: '1280,900' });
}

// Printed PDF page objects (`/Type /Page`, not `/Type /Pages`) are plain
// text in Chrome's PDF output even though content streams are compressed,
// so counting them is a reliable, dependency-free way to get the page count.
function countPdfPages(buf) {
  const matches = buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : 0;
}

async function printToPdf(cdp) {
  await evaluate(cdp, 'preparePrint()', { awaitPromise: true });
  const res = await cdp.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
  return Buffer.from(res.data, 'base64');
}

async function seedReport(cdp, { generalObservationCount = 1, observationCount = 1 } = {}) {
  await evaluate(cdp, `(() => {
    for (let i = 0; i < ${generalObservationCount}; i++) {
      const g = createGeneralObservation();
      g.text = 'General observation ' + i + '.';
      state.report.generalObservations.push(g);
    }
    for (let i = 0; i < ${observationCount}; i++) {
      const o = createObservation(state.report);
      o.description = 'Observation ' + i;
      o.requirement = 'Requirement ' + i;
      state.report.observations.push(o);
    }
    renumber(state.report);
  })();`);
}

test('the numbered table CSS no longer forces a page break, and keeps a consistent gap', () => withPage(async (cdp) => {
  await seedReport(cdp, { generalObservationCount: 1, observationCount: 1 });
  await evaluate(cdp, 'preparePrint()', { awaitPromise: true });
  const style = JSON.parse(await evaluate(cdp, `JSON.stringify((() => {
    const cs = getComputedStyle(document.querySelector('.pr-table'));
    return { breakBefore: cs.breakBefore, marginTop: cs.marginTop };
  })())`));

  assert.equal(style.breakBefore, 'auto', 'the numbered table should not force a page break before it');
  assert.ok(parseFloat(style.marginTop) > 0, 'the numbered table should keep a gap below the general observations');
}));

test('a row, an image and the table header still refuse to split across a page break', () => withPage(async (cdp) => {
  await seedReport(cdp, { generalObservationCount: 0, observationCount: 1 });
  await evaluate(cdp, 'preparePrint()', { awaitPromise: true });
  const style = JSON.parse(await evaluate(cdp, `JSON.stringify((() => {
    return {
      row: getComputedStyle(document.querySelector('.pr-table tr')).breakInside,
      fig: getComputedStyle(document.querySelector('.pr-fig') || document.body).breakInside,
      thead: getComputedStyle(document.querySelector('.pr-table thead')).display,
    };
  })())`));

  assert.equal(style.row, 'avoid', 'a table row should still avoid splitting where it can');
  assert.equal(style.thead, 'table-header-group', 'the header row should repeat on every page the table spans');
}));

test('a short report keeps the numbered table on page 1 instead of forcing it to page 2', () => withPage(async (cdp) => {
  await seedReport(cdp, { generalObservationCount: 1, observationCount: 2 });
  const pdf = await printToPdf(cdp);
  assert.equal(countPdfPages(pdf), 1, 'short content should not be pushed onto a forced second page');
}));

test('general observations long enough to fill page 1 still push the table to page 2 on their own', () => withPage(async (cdp) => {
  await seedReport(cdp, { generalObservationCount: 30, observationCount: 1 });
  const pdf = await printToPdf(cdp);
  assert.ok(countPdfPages(pdf) >= 2, 'content that genuinely overflows page 1 should still continue onto page 2');
}));

test('a single row taller than one page still prints every page without erroring', () => withPage(async (cdp) => {
  await seedReport(cdp, { generalObservationCount: 0, observationCount: 0 });
  await evaluate(cdp, `(() => {
    const o = createObservation(state.report);
    o.description = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore. '.repeat(80);
    o.requirement = 'Requirement for the long row';
    state.report.observations.push(o);
    const after = createObservation(state.report);
    after.description = 'Row after the long one';
    after.requirement = 'Requirement after';
    state.report.observations.push(after);
    renumber(state.report);
  })();`);
  const pdf = await printToPdf(cdp);
  assert.ok(countPdfPages(pdf) > 1, 'a row taller than one page should flow onto later pages, not disappear or error');
}));
