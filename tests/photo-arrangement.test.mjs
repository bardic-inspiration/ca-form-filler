// Issue #42: photo sizes follow the photo count (automatic) until the user
// sizes a photo (manual). Core logic only; see photo-presets for the layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load-core.mjs';

const Core = loadCore();
const plain = (v) => JSON.parse(JSON.stringify(v));
const deepEq = (actual, expected) => assert.deepEqual(plain(actual), plain(expected));
const T = 100 / 3;
const repeat = (n, w) => Array(n).fill(w);

// A report with one observation holding `count` photos.
function cellWith(count) {
  const r = Core.createReport({ today: '2026-10-03' });
  const o = Core.createObservation(r);
  r.observations.push(o);
  for (let i = 0; i < count; i++) addPhoto(r, o);
  return { r, o };
}

function addPhoto(r, o) {
  const p = Core.createPhoto('data:image/jpeg;base64,AAA', `p${o.photoIds.length}.jpg`);
  r.photos[p.id] = p;
  o.photoIds.push(p.id);
  return p;
}

const widths = (r, o) => Core.photoLayout(r, 'obs', o.display, o.photoIds).photos.map((p) => p.width);

test('arrangements fill whole rows from full, half and third photos', () => {
  deepEq(Core.autoArrangements(1), [[100]]);
  deepEq(Core.autoArrangements(2), [[50, 50], [100, 100]]);
  deepEq(Core.autoArrangements(3), [[50, 50, 100], [100, 100, 100], [T, T, T]]);
  deepEq(Core.autoArrangements(4), [repeat(4, 50), repeat(4, 100), [T, T, T, 100]]);
  deepEq(Core.autoArrangements(5), [[...repeat(4, 50), 100], repeat(5, 100), [T, T, T, 50, 50]]);
  deepEq(Core.autoArrangements(6), [repeat(6, 50), repeat(6, 100), repeat(6, T)]);
  for (let n = 1; n <= 6; n++) {
    for (const a of Core.autoArrangements(n)) {
      assert.equal(a.length, n);
      assert.ok(a.every((w) => Core.PHOTO_WIDTH_STEPS.includes(w)), `${n}: presets only`);
      // Every row sums to a full row.
      let row = 0;
      for (const w of a) { row += w; if (Math.abs(row - 100) < 1e-9) row = 0; }
      assert.equal(row, 0, `${n}: ${a} fills whole rows`);
    }
  }
});

test('the default is rows of two halves, a lone last photo full width, never thirds', () => {
  const expected = { 1: [100], 2: [50, 50], 3: [50, 50, 100], 4: repeat(4, 50), 5: [...repeat(4, 50), 100], 6: repeat(6, 50) };
  for (const [n, w] of Object.entries(expected)) {
    deepEq(Core.autoArrangements(Number(n))[0], w);
    const { r, o } = cellWith(Number(n));
    assert.equal(Core.photoSizing(r, o.display, o.photoIds), 'auto');
    deepEq(widths(r, o), w);
  }
});

test('an automatic cell re-applies the default when photos are added or removed', () => {
  const { r, o } = cellWith(2);
  deepEq(widths(r, o), [50, 50]);
  Core.photosChanging(r, o.display, o.photoIds);
  addPhoto(r, o);
  deepEq(widths(r, o), [50, 50, 100]);

  Core.setArrangement(r, o.display, o.photoIds, [T, T, T]);
  deepEq(widths(r, o), [T, T, T]);
  Core.photosChanging(r, o.display, o.photoIds);
  addPhoto(r, o);
  deepEq(widths(r, o), [50, 50, 50, 50]);
  Core.photosChanging(r, o.display, o.photoIds);
  o.photoIds.pop();
  deepEq(widths(r, o), [50, 50, 100], 'back to the default, not the earlier pick');
  assert.equal(o.display.sizing, 'auto');
});

test('picking an arrangement keeps the cell automatic and clears photo sizes', () => {
  const { r, o } = cellWith(3);
  Core.setManualSizing(r, 'obs', o.display, o.photoIds);
  r.photos[o.photoIds[0]].display.width = 70;
  Core.setArrangement(r, o.display, o.photoIds, [100, 100, 100]);
  assert.equal(Core.photoSizing(r, o.display, o.photoIds), 'auto');
  deepEq(widths(r, o), [100, 100, 100]);
  assert.ok(o.photoIds.every((id) => r.photos[id].display.width === undefined));
  // A stale or foreign arrangement falls back to the default.
  o.display.arrangement = [70, 30, 100];
  deepEq(widths(r, o), [50, 50, 100]);
});

test('sizing a photo makes the cell manual, keeping every photo at its size', () => {
  const { r, o } = cellWith(3);
  Core.setArrangement(r, o.display, o.photoIds, [T, T, T]);
  Core.setManualSizing(r, 'obs', o.display, o.photoIds);
  r.photos[o.photoIds[1]].display.width = 60;
  assert.equal(Core.photoSizing(r, o.display, o.photoIds), 'manual');
  assert.equal(o.display.arrangement, undefined);
  deepEq(widths(r, o), [T, 60, T]);
});

test('a manual cell keeps existing sizes when photos are added or removed', () => {
  const { r, o } = cellWith(2);
  Core.setManualSizing(r, 'obs', o.display, o.photoIds);
  deepEq(widths(r, o), [50, 50]);
  Core.photosChanging(r, o.display, o.photoIds);
  addPhoto(r, o);
  deepEq(widths(r, o), [50, 50, 100], 'the new photo gets the cell preset (Full)');
  Core.photosChanging(r, o.display, o.photoIds);
  o.photoIds.shift();
  deepEq(widths(r, o), [50, 100]);
  assert.equal(Core.photoSizing(r, o.display, o.photoIds), 'manual');
});

test('cells from older reports are manual when they carry a width, else automatic', () => {
  const { r, o } = cellWith(2);
  assert.equal(Core.photoSizing(r, {}, o.photoIds), 'auto');
  assert.equal(Core.photoSizing(r, { photoWidth: 50 }, o.photoIds), 'manual');
  r.photos[o.photoIds[0]].display.width = 40;
  assert.equal(Core.photoSizing(r, {}, o.photoIds), 'manual');
  deepEq(widths(r, o), [40, 100]);
  // Pinned before a change, so removing the sized photo keeps it manual.
  Core.photosChanging(r, o.display, o.photoIds);
  o.photoIds.shift();
  assert.equal(Core.photoSizing(r, o.display, o.photoIds), 'manual');
});

test('automatic/manual state, arrangement and sizes round-trip through JSON', () => {
  const { r, o } = cellWith(3);
  Core.setArrangement(r, o.display, o.photoIds, [T, T, T]);
  const g = { ...Core.createGeneralObservation(), images: [] };
  r.generalObservations.push(g);
  const p = Core.createPhoto('data:image/jpeg;base64,AAA', 'g.jpg');
  r.photos[p.id] = p;
  g.images.push(p.id);
  Core.setManualSizing(r, 'gen', g.display, g.images);
  r.photos[p.id].display.width = 60;

  const back = Core.parseReport(Core.serializeReport(r));
  deepEq(back.observations[0].display, { sizing: 'auto', arrangement: [T, T, T] });
  deepEq(widths(back, back.observations[0]), [T, T, T]);
  deepEq(back.generalObservations[0].display, { sizing: 'manual' });
  deepEq(back.photos[p.id].display, { width: 60 });
});

test('choosing an arrangement or sizing a photo is one undo step', () => {
  const { r, o } = cellWith(2);
  const history = new Core.History(100);
  history.record(Core.snapshotReport(r));
  Core.setArrangement(r, o.display, o.photoIds, [100, 100]);
  history.record(Core.snapshotReport(r));
  Core.setManualSizing(r, 'obs', o.display, o.photoIds);
  r.photos[o.photoIds[0]].display.width = 70;
  deepEq(widths(r, o), [70, 100]);

  // Undo replaces the observation objects, so read them afresh.
  Core.restoreSnapshot(r, history.undo(Core.snapshotReport(r)));
  deepEq(widths(r, r.observations[0]), [100, 100]);
  assert.equal(Core.photoSizing(r, r.observations[0].display, o.photoIds), 'auto');
  Core.restoreSnapshot(r, history.undo(Core.snapshotReport(r)));
  deepEq(widths(r, r.observations[0]), [50, 50]);
  deepEq(r.observations[0].display, {});
});
