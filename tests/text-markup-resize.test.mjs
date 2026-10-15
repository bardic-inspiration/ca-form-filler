// Issue #63: select, edit and resize text markup in the photo editor.
// Core logic only: handle placement, handle hit test and the resize math.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load-core.mjs';

const Core = loadCore();
const plain = (v) => JSON.parse(JSON.stringify(v));

// A text box 100 × 24 at (50, 40) drawn with font size 20.
const BOX = { x: 50, y: 40, w: 100, h: 24 };
const SHAPE = { id: 't', type: 'text', x: 50, y: 40, text: 'Hi', size: 20, color: '#F26A21', width: 0 };

test('textHandles puts one handle on each corner of the padded box', () => {
  assert.deepEqual(plain(Core.textHandles(BOX, 5)), [
    { handle: 'nw', x: 45, y: 35 },
    { handle: 'ne', x: 155, y: 35 },
    { handle: 'sw', x: 45, y: 69 },
    { handle: 'se', x: 155, y: 69 },
  ]);
});

test('hitTextHandle finds the handle within tolerance, else null', () => {
  assert.equal(Core.hitTextHandle(BOX, 5, 156, 70, 4), 'se');
  assert.equal(Core.hitTextHandle(BOX, 5, 44, 34, 4), 'nw');
  assert.equal(Core.hitTextHandle(BOX, 5, 155, 35, 0), 'ne');
  assert.equal(Core.hitTextHandle(BOX, 5, 100, 50, 4), null, 'the middle of the box is not a handle');
  assert.equal(Core.hitTextHandle(BOX, 5, 162, 70, 4), null, 'outside the tolerance');
});

test('resizeText: dragging the se handle out doubles the size, anchored at the top-left', () => {
  const start = { x: 155, y: 69 };
  const r = Core.resizeText(SHAPE, BOX, 'se', start, { x: 260, y: 98 }, 4);
  // Dragged from 105,29 to 210,58 away from the anchor (50,40): factor 2.
  assert.deepEqual(plain(r), { x: 50, y: 40, size: 40 });
});

test('resizeText: dragging the nw handle keeps the bottom-right corner fixed', () => {
  const start = { x: 45, y: 35 };
  const r = Core.resizeText(SHAPE, BOX, 'nw', start, { x: 97.5, y: 49.5 }, 4);
  // Anchor (150,64); start offset (-105,-29); new offset (-52.5,-14.5): factor 0.5.
  assert.equal(r.size, 10);
  assert.equal(r.x, 150 - BOX.w * 0.5);
  assert.equal(r.y, 64 - BOX.h * 0.5);
});

test('resizeText: ne and sw handles anchor the opposite corner', () => {
  const ne = Core.resizeText(SHAPE, BOX, 'ne', { x: 155, y: 35 }, { x: 260, y: 6 }, 4);
  assert.equal(ne.size, 40);
  assert.equal(ne.x, 50);
  assert.equal(ne.y, 64 - 48);
  const sw = Core.resizeText(SHAPE, BOX, 'sw', { x: 45, y: 69 }, { x: -60, y: 98 }, 4);
  assert.equal(sw.size, 40);
  assert.equal(sw.x, 150 - 200);
  assert.equal(sw.y, 40);
});

test('resizeText: not dragging leaves the shape where it was', () => {
  const r = Core.resizeText(SHAPE, BOX, 'se', { x: 155, y: 69 }, { x: 155, y: 69 }, 4);
  assert.deepEqual(plain(r), { x: 50, y: 40, size: 20 });
});

test('resizeText: never smaller than minSize, even when dragged past the anchor', () => {
  const r = Core.resizeText(SHAPE, BOX, 'se', { x: 155, y: 69 }, { x: 0, y: 0 }, 4);
  assert.equal(r.size, 4);
  assert.equal(r.x, 50);
  assert.equal(r.y, 40);
  const nw = Core.resizeText(SHAPE, BOX, 'nw', { x: 45, y: 35 }, { x: 400, y: 400 }, 4);
  assert.equal(nw.size, 4);
  assert.equal(nw.x, 150 - BOX.w * 0.2);
  assert.equal(nw.y, 64 - BOX.h * 0.2);
});

test('resizeText does not change the shape it is given', () => {
  const s = { ...SHAPE };
  Core.resizeText(s, BOX, 'se', { x: 155, y: 69 }, { x: 260, y: 98 }, 4);
  assert.deepEqual(s, SHAPE);
});

test('a resized text shape survives a report snapshot round trip', () => {
  const r = Core.createReport({ today: '2026-10-15' });
  const photo = Core.createPhoto('data:image/png;base64,AAAA', 'a.png');
  photo.markup.push({ ...SHAPE, ...Core.resizeText(SHAPE, BOX, 'se', { x: 155, y: 69 }, { x: 260, y: 98 }, 4), text: 'Edited' });
  r.photos[photo.id] = photo;
  const snap = Core.snapshotReport(r);
  const back = Core.createReport({ today: '2026-10-15' });
  back.photos[photo.id] = Core.createPhoto('', '');
  back.photos[photo.id].id = photo.id;
  Core.restoreSnapshot(back, snap);
  const t = back.photos[photo.id].markup[0];
  assert.equal(t.text, 'Edited');
  assert.equal(t.size, 40);
});

test('a resized, edited text shape survives saving and reopening the report file', () => {
  const r = Core.createReport({ today: '2026-10-15' });
  const photo = Core.createPhoto('data:image/png;base64,AAAA', 'a.png');
  photo.markup.push({ ...SHAPE, ...Core.resizeText(SHAPE, BOX, 'se', { x: 155, y: 69 }, { x: 260, y: 98 }, 4), text: 'Edited' });
  r.photos[photo.id] = photo;
  r.generalObservations.push({ ...Core.createGeneralObservation(), images: [photo.id] });
  const back = Core.parseReport(Core.serializeReport(r));
  assert.deepEqual(plain(back.photos[photo.id].markup), plain(photo.markup));
});
