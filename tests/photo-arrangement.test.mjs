// Issue #42: photo cells pick sizes automatically from the photo count until
// the user sizes a photo, after which the cell is manual.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load-core.mjs';

const Core = loadCore();
const plain = (v) => JSON.parse(JSON.stringify(v));
const deepEq = (actual, expected) => assert.deepEqual(plain(actual), plain(expected));

const F = 100;
const H = 50;
const T = 100 / 3;

function reportWith(count, display = {}) {
  const r = Core.createReport({ today: '2026-10-03' });
  const o = Object.assign(Core.createObservation(r), { display });
  r.observations.push(o);
  for (let i = 0; i < count; i++) addPhoto(r, o);
  return { r, o };
}

function addPhoto(r, o) {
  const p = Core.createPhoto('data:image/jpeg;base64,AAA', 'p.jpg');
  r.photos[p.id] = p;
  o.photoIds.push(p.id);
  return p;
}

const widths = (r, o) => Core.photoLayout(r, 'obs', o.display, o.photoIds).photos.map((p) => p.width);

test('arrangements are built from full, half and third rows that each fill a row', () => {
  const list = (n) => plain(Core.autoArrangements(n)).map((a) => a.widths);
  deepEq(list(0), []);
  deepEq(list(1), [[F]]);
  deepEq(list(2), [[H, H], [F, F]]);
  deepEq(list(3), [[H, H, F], [F, F, F], [T, T, T]]);
  deepEq(list(4), [[H, H, H, H], [F, F, F, F], [T, T, T, F]]);
  deepEq(list(5), [[H, H, H, H, F], [F, F, F, F, F], [T, T, T, H, H]]);
  deepEq(list(6), [[H, H, H, H, H, H], [F, F, F, F, F, F], [T, T, T, T, T, T]]);
  for (let n = 1; n <= 6; n++) {
    for (const a of Core.autoArrangements(n)) {
      assert.equal(a.widths.length, n);
      assert.equal(a.key, a.rows.join('-'));
      assert.equal(a.rows.reduce((s, k) => s + k, 0), n);
      for (const k of a.rows) assert.ok(Core.PHOTO_SIZE_PRESETS.some((p) => p.width === 100 / k), `row of ${k}`);
    }
  }
});

test('the default is rows of two halves, with a lone last photo full width; thirds are never the default', () => {
  const first = (n) => plain(Core.autoArrangements(n)[0].widths);
  deepEq(first(1), [F]);
  deepEq(first(2), [H, H]);
  deepEq(first(3), [H, H, F]);
  deepEq(first(4), [H, H, H, H]);
  deepEq(first(5), [H, H, H, H, F]);
  deepEq(first(6), [H, H, H, H, H, H]);
});

test('a new cell is automatic and lays its photos out in the default arrangement', () => {
  const { r, o } = reportWith(3);
  assert.equal(Core.cellDisplay(o.display, 'obs').photoMode, 'auto');
  deepEq(widths(r, o), [H, H, F]);
  assert.equal(Core.photoLayout(r, 'obs', o.display, o.photoIds).arrangement, '2-1');
});

test('an automatic cell ignores width overrides and the cell default width', () => {
  const { r, o } = reportWith(2, { photoWidth: T });
  r.photos[o.photoIds[0]].display.width = 70;
  deepEq(widths(r, o), [H, H]);
});

test('picking an arrangement keeps the cell automatic and uses it', () => {
  const { r, o } = reportWith(3);
  Core.setPhotoArrangement(r, o.display, o.photoIds, '3');
  assert.equal(Core.cellDisplay(o.display, 'obs').photoMode, 'auto');
  deepEq(widths(r, o), [T, T, T]);
  Core.setPhotoArrangement(r, o.display, o.photoIds, '1-1-1');
  deepEq(widths(r, o), [F, F, F]);
});

test('picking an arrangement on a manual cell makes it automatic and clears overrides', () => {
  const { r, o } = reportWith(2);
  Core.makePhotoCellManual(r, 'obs', o.display, o.photoIds);
  r.photos[o.photoIds[0]].display.width = 70;
  Core.setPhotoArrangement(r, o.display, o.photoIds, '1-1');
  assert.equal(Core.cellDisplay(o.display, 'obs').photoMode, 'auto');
  deepEq(widths(r, o), [F, F]);
  deepEq(r.photos[o.photoIds[0]].display, {});
});

test('an automatic cell re-applies the default arrangement when photos are added or removed', () => {
  const { r, o } = reportWith(3);
  Core.setPhotoArrangement(r, o.display, o.photoIds, '3');
  addPhoto(r, o);
  Core.photoCountChanged(r, o.display, o.photoIds);
  deepEq(widths(r, o), [H, H, H, H]);
  o.photoIds.pop();
  Core.photoCountChanged(r, o.display, o.photoIds);
  deepEq(widths(r, o), [H, H, F], 'back to 3 photos: the default, not the earlier pick');
});

test('a photo moved into an automatic cell loses its width override', () => {
  const { r, o } = reportWith(1);
  const p = addPhoto(r, o);
  p.display.width = 70;
  Core.photoCountChanged(r, o.display, o.photoIds);
  deepEq(p.display, {});
  deepEq(widths(r, o), [H, H]);
});

test('sizing a photo makes the cell manual and keeps every photo at its current size', () => {
  const { r, o } = reportWith(3);
  Core.makePhotoCellManual(r, 'obs', o.display, o.photoIds);
  assert.equal(Core.cellDisplay(o.display, 'obs').photoMode, 'manual');
  assert.equal(Core.photoLayout(r, 'obs', o.display, o.photoIds).arrangement, null);
  deepEq(o.photoIds.map((id) => r.photos[id].display.width), [H, H, F]);
  r.photos[o.photoIds[2]].display.width = 40;
  deepEq(widths(r, o), [H, H, 40]);
});

test('a manual cell never changes existing sizes when photos are added or removed', () => {
  const { r, o } = reportWith(3);
  Core.makePhotoCellManual(r, 'obs', o.display, o.photoIds);
  r.photos[o.photoIds[0]].display.width = 70;
  addPhoto(r, o);
  Core.photoCountChanged(r, o.display, o.photoIds);
  deepEq(widths(r, o), [70, H, F, F], 'the new photo gets the cell default (a preset)');
  o.photoIds.splice(1, 1);
  Core.photoCountChanged(r, o.display, o.photoIds);
  deepEq(widths(r, o), [70, F, F]);
  assert.equal(Core.cellDisplay(o.display, 'obs').photoMode, 'manual');
});

test('making a manual cell manual again changes nothing', () => {
  const { r, o } = reportWith(2);
  Core.makePhotoCellManual(r, 'obs', o.display, o.photoIds);
  r.photos[o.photoIds[0]].display.width = 70;
  Core.makePhotoCellManual(r, 'obs', o.display, o.photoIds);
  deepEq(widths(r, o), [70, H]);
});

test('an arrangement that does not fit the photo count falls back to the default', () => {
  const { r, o } = reportWith(2, { photoArrangement: '3' });
  deepEq(widths(r, o), [H, H]);
  o.display.photoArrangement = 'nonsense';
  deepEq(widths(r, o), [H, H]);
});

test('automatic/manual state, arrangement and sizes round-trip through JSON', () => {
  const { r, o } = reportWith(3);
  Core.setPhotoArrangement(r, o.display, o.photoIds, '3');
  const g = Core.createGeneralObservation();
  r.generalObservations.push(g);
  for (let i = 0; i < 2; i++) {
    const p = Core.createPhoto('data:image/jpeg;base64,AAA', 'p.jpg');
    r.photos[p.id] = p;
    g.images.push(p.id);
  }
  Core.makePhotoCellManual(r, 'gen', g.display, g.images);
  r.photos[g.images[1]].display.width = 40;
  const back = Core.parseReport(Core.serializeReport(r));
  const bo = back.observations[0];
  const bg = back.generalObservations[0];
  assert.equal(Core.cellDisplay(bo.display, 'obs').photoMode, 'auto');
  deepEq(widths(back, bo), [T, T, T]);
  assert.equal(Core.cellDisplay(bg.display, 'gen').photoMode, 'manual');
  deepEq(Core.photoLayout(back, 'gen', bg.display, bg.images).photos.map((p) => p.width), [H, 40]);
});

test('choosing an arrangement is one undo step', () => {
  const { r, o } = reportWith(3);
  const history = new Core.History(100);
  history.record(Core.snapshotReport(r));
  Core.setPhotoArrangement(r, o.display, o.photoIds, '3');
  Core.restoreSnapshot(r, history.undo(Core.snapshotReport(r)));
  deepEq(widths(r, r.observations[0]), [H, H, F]);
  Core.restoreSnapshot(r, history.redo(Core.snapshotReport(r)));
  deepEq(widths(r, r.observations[0]), [T, T, T]);
});
