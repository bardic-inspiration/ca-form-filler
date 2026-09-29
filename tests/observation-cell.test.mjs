// The Observation and Contract Requirement textareas must fill their table
// cell's full height, not just the height of their own text (issue #7), and
// the status/tag pills anchored to the bottom of the Contract Requirement
// cell must never overlap the requirement text above them (issue #33). Uses
// the Chrome DevTools Protocol for real layout. Needs a Chrome, Chromium or
// Edge binary: set CHROME_PATH, or have one on PATH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, waitUntilTrue, withPage as withChromePage } from './browser.mjs';

function withPage(fn) {
  return withChromePage(fn, { profilePrefix: 'fr-obs-cell-', windowSize: '1280,900' });
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
