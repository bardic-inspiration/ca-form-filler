import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load-core.mjs';

const Core = loadCore();
// Values from the vm realm carry foreign prototypes; compare as plain JSON.
const plain = (v) => JSON.parse(JSON.stringify(v));
const deepEq = (actual, expected) => assert.deepEqual(plain(actual), plain(expected));
const TODAY = '2026-06-26';

function sampleReport() {
  const r = Core.createReport({ today: TODAY });
  Object.assign(r.header, {
    reportNumber: 2, project: "Mariner's Hall", projectNumber: 'P3935',
    author: 'Reif Larsen', purpose: 'General site observation',
    time: '2:00 PM', weather: '60deg. Rainy',
    attendees: ['Reif (WM)', 'Jared (RCI)'], distribution: ['Owner'],
  });
  return r;
}

function addObservation(r, fields = {}) {
  const o = Object.assign(Core.createObservation(r), fields);
  r.observations.push(o);
  Core.renumber(r);
  return o;
}

test('numbering presets format report and item numbers', () => {
  const f = Core.formatItemNumber;
  assert.equal(f('{report}.{item:02}', 1, 4), '1.04');
  assert.equal(f('{report:02}.{item:02}', 1, 4), '01.04');
  assert.equal(f('{item}', 1, 4), '4');
  assert.equal(f('{report:A}.{item}', 1, 4), 'A.4');
  assert.equal(f('{report:A}.{item}', 27, 1), 'AA.1');
  assert.equal(f('Item {item:03}', 3, 7), 'Item 007');
  deepEq(plain(Core.NUMBERING_PRESETS.map((p) => p.label)), ['1.01', '01.01', '1', 'A.1']);
});

test('renumber honors pattern and start number', () => {
  const r = sampleReport();
  for (let i = 0; i < 3; i++) addObservation(r);
  deepEq(r.observations.map((o) => o.number), ['2.01', '2.02', '2.03']);
  r.config.numberingStart = 5;
  r.config.numberingPattern = '{item}';
  Core.renumber(r);
  deepEq(r.observations.map((o) => o.number), ['5', '6', '7']);
});

test('createReport fills defaults with today for both dates', () => {
  const r = Core.createReport({ today: TODAY });
  assert.equal(r.app, 'WM-FieldReport');
  assert.equal(r.schemaVersion, 1);
  assert.equal(r.header.reportDate, TODAY);
  assert.equal(r.header.visitDate, TODAY);
  assert.equal(r.header.reportTitle, 'Field Observation Report');
  assert.equal(r.disclaimer, Core.DEFAULT_CONFIG.disclaimer);
  deepEq(plain(r.ui.columnWidths), [8, 36, 32, 24]);
  deepEq(plain(r.config), plain(Core.DEFAULT_CONFIG));
});

test('reordering 20 rows renumbers, and undo restores the prior order', () => {
  const r = sampleReport();
  for (let i = 0; i < 20; i++) addObservation(r, { description: `obs ${i + 1}` });
  const history = new Core.History(100);
  const before = r.observations.map((o) => o.description);

  history.record(Core.snapshotReport(r));
  Core.moveById(r.observations, r.observations[19].id, r.observations[0].id);
  Core.renumber(r);
  assert.equal(r.observations[0].description, 'obs 20');
  assert.equal(r.observations[0].number, '2.01');
  assert.equal(r.observations[19].number, '2.20');

  Core.restoreSnapshot(r, history.undo(Core.snapshotReport(r)));
  deepEq(r.observations.map((o) => o.description), before);
  assert.equal(r.observations[0].number, '2.01');
});

test('moveById moves before a target or to the end', () => {
  const list = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  Core.moveById(list, 'a', 'd');
  deepEq(list.map((x) => x.id), ['b', 'c', 'a', 'd']);
  Core.moveById(list, 'b', null);
  deepEq(list.map((x) => x.id), ['c', 'a', 'd', 'b']);
});

test('history keeps at least 50 steps and clears redo on a new record', () => {
  const h = new Core.History(100);
  for (let i = 0; i < 60; i++) h.record(`s${i}`);
  let current = 'now';
  let steps = 0;
  while (h.canUndo()) { current = h.undo(current); steps++; }
  assert.equal(steps, 60);
  assert.equal(current, 's0');
  assert.equal(h.redo(current), 's1');
  h.record('x');
  assert.equal(h.canRedo(), false);
});

test('undo snapshots leave photos, config and ui untouched', () => {
  const r = sampleReport();
  const snap = Core.snapshotReport(r);
  r.photos.p1 = Core.createPhoto('data:image/jpeg;base64,AAA', 'a.jpg');
  r.config.pdfShowTags = true;
  r.header.project = 'Changed';
  Core.restoreSnapshot(r, snap);
  assert.equal(r.header.project, "Mariner's Hall");
  assert.ok(r.photos.p1);
  assert.equal(r.config.pdfShowTags, true);
});

test('next report carries only incomplete items with original numbers', () => {
  const prev = sampleReport();
  const photo = Core.createPhoto('data:image/jpeg;base64,AAA', 'a.jpg');
  prev.photos[photo.id] = photo;
  prev.photos.unused = Core.createPhoto('data:image/jpeg;base64,BBB', 'b.jpg');
  const open = addObservation(prev, { description: 'open', photoIds: [photo.id] });
  const done = addObservation(prev, { description: 'done' });
  Core.setStatus(done, 'complete', '2026-07-02');
  prev.inherited.push({ ...Core.createObservation(prev), description: 'old open', sourceReport: 1, originalNumber: '1.07' });
  prev.inherited.push({ ...Core.createObservation(prev), description: 'old done', sourceReport: 1, originalNumber: '1.08', status: 'complete', completedDate: '2026-06-01' });
  prev.generalObservations.push(Core.createGeneralObservation());
  prev.tags.push({ id: 't1', name: 'Landscape', color: 'yellow' });

  const next = Core.nextReportFrom(prev, { today: '2026-07-10' });
  assert.equal(next.header.reportNumber, 3);
  assert.equal(next.header.project, "Mariner's Hall");
  assert.equal(next.header.author, 'Reif Larsen');
  deepEq(plain(next.header.attendees), ['Reif (WM)', 'Jared (RCI)']);
  assert.equal(next.header.reportDate, '2026-07-10');
  assert.equal(next.header.visitDate, '2026-07-10');
  assert.equal(next.header.time, '');
  assert.equal(next.header.weather, '');
  assert.equal(next.observations.length, 0);
  assert.equal(next.generalObservations.length, 0);
  deepEq(plain(next.tags), plain(prev.tags));

  deepEq(next.inherited.map((o) => o.description), ['open', 'old open']);
  deepEq(next.inherited.map((o) => o.originalNumber), ['2.01', '1.07']);
  deepEq(next.inherited.map((o) => o.sourceReport), [2, 1]);
  assert.equal(next.inherited[0].id, open.id);
  deepEq(Object.keys(next.photos), [photo.id]);

  // A further report keeps rolling 2.01 forward unchanged.
  const after = Core.nextReportFrom(next, { today: '2026-07-20' });
  deepEq(after.inherited.map((o) => o.originalNumber), ['2.01', '1.07']);
});

test('next report inherits nothing when carry forward is off', () => {
  const prev = sampleReport();
  prev.config.carryForward = false;
  addObservation(prev, { description: 'open' });
  const next = Core.nextReportFrom(prev, { today: TODAY });
  assert.equal(next.inherited.length, 0);
  assert.equal(next.config.carryForward, false);
});

test('reminder groups are newest source report first', () => {
  const r = sampleReport();
  for (const [src, num] of [[1, '1.01'], [3, '3.02'], [1, '1.04'], [2, '2.01']]) {
    r.inherited.push({ ...Core.createObservation(r), sourceReport: src, originalNumber: num });
  }
  const groups = Core.reminderGroups(r, r.inherited);
  deepEq(groups.map((g) => g.sourceReport), [3, 2, 1]);
  deepEq(groups[2].items.map((o) => o.originalNumber), ['1.01', '1.04']);
});

test('CSV has BOM, fixed columns, RFC 4180 quoting, current then inherited', () => {
  const r = sampleReport();
  r.tags.push({ id: 't1', name: 'Landscape', color: 'yellow' }, { id: 't2', name: 'Planting', color: 'green' });
  const o = addObservation(r, { description: 'Shrub "planted" high,\nsee photo', requirement: 'Café root ball', tagIds: ['t1', 't2'] });
  Core.setStatus(o, 'complete', '2026-07-02');
  r.inherited.push({ ...Core.createObservation(r), description: 'old', sourceReport: 1, originalNumber: '1.07' });

  const csv = Core.toCSV(r);
  assert.ok(csv.startsWith('﻿'));
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines[0], 'Project,Project No,Report No,Report Date,Visit Date,Item,Observation,Contract Requirement,Status,Completed Date,Tags,Source Report,Item ID');
  assert.equal(lines[1], `Mariner's Hall,P3935,2,${TODAY},${TODAY},2.01,"Shrub ""planted"" high,\nsee photo",Café root ball,Complete,2026-07-02,Landscape; Planting,2,${o.id}`);
  assert.match(lines[2], /^Mariner's Hall,P3935,2,.*,1\.07,old,,Incomplete,,,1,/);
  assert.equal(lines[3], '');
});

test('file base name is YYMMDD_ProjectNo_FOR-NN', () => {
  const r = sampleReport();
  r.header.reportNumber = 1;
  assert.equal(Core.fileBaseName(r), '260626_P3935_FOR-01');
  r.header.projectNumber = '';
  assert.equal(Core.fileBaseName(r), '260626_FOR-01');
});

test('parseReport validates app and schema version', () => {
  assert.throws(() => Core.parseReport('{not json'), /could not be read/);
  assert.throws(() => Core.parseReport(JSON.stringify({ app: 'Other', schemaVersion: 1 })), /not a Field Observation Report/);
  assert.throws(() => Core.parseReport(JSON.stringify({ app: 'WM-FieldReport', schemaVersion: 99 })), /newer version/);
  const r = Core.parseReport(JSON.stringify({ app: 'WM-FieldReport', schemaVersion: 1, header: { project: 'X' } }));
  assert.equal(r.header.project, 'X');
  assert.equal(r.header.reportTitle, 'Field Observation Report');
  deepEq(plain(r.observations), []);
  assert.equal(r.config.photoExportMaxSide, 600);
});

test('save round trip keeps crops and markup, and purges unreferenced photos', () => {
  const r = sampleReport();
  const kept = Core.createPhoto('data:image/jpeg;base64,AAA', 'a.jpg');
  kept.crop = { x: 10, y: 20, w: 300, h: 200 };
  kept.markup = [{ id: 's1', type: 'ellipse', cx: 50, cy: 60, rx: 20, ry: 10, color: '#F26A21', width: 6 }];
  const genPhoto = Core.createPhoto('data:image/jpeg;base64,CCC', 'c.jpg');
  r.photos[kept.id] = kept;
  r.photos[genPhoto.id] = genPhoto;
  r.photos.orphan = Core.createPhoto('data:image/jpeg;base64,BBB', 'b.jpg');
  addObservation(r, { photoIds: [kept.id] });
  r.generalObservations.push({ ...Core.createGeneralObservation(), images: [genPhoto.id] });

  const back = Core.parseReport(Core.serializeReport(r));
  deepEq(Object.keys(back.photos).sort(), [kept.id, genPhoto.id].sort());
  deepEq(plain(back.photos[kept.id]), plain(kept));
  assert.ok(r.photos.orphan, 'live state is not purged');
});

test('setStatus sets and clears the completion date', () => {
  const o = Core.createObservation(sampleReport());
  assert.equal(o.status, 'incomplete');
  Core.setStatus(o, 'complete', '2026-07-02');
  assert.equal(o.completedDate, '2026-07-02');
  Core.setStatus(o, 'incomplete');
  assert.equal(o.completedDate, null);
});

test('deleteTag removes the tag from every item', () => {
  const r = sampleReport();
  r.tags.push({ id: 't1', name: 'A', color: 'blue' });
  const o = addObservation(r, { tagIds: ['t1'] });
  r.inherited.push({ ...Core.createObservation(r), tagIds: ['t1'], sourceReport: 1, originalNumber: '1.01' });
  assert.equal(Core.tagUsage(r, 't1'), 2);
  Core.deleteTag(r, 't1');
  assert.equal(r.tags.length, 0);
  deepEq(plain(o.tagIds), []);
  deepEq(plain(r.inherited[0].tagIds), []);
});

test('filters match by status and any selected tag', () => {
  const o = { status: 'complete', tagIds: ['a'] };
  assert.equal(Core.matchesFilter(o, { status: 'all', tagIds: [] }), true);
  assert.equal(Core.matchesFilter(o, { status: 'incomplete', tagIds: [] }), false);
  assert.equal(Core.matchesFilter(o, { status: 'complete', tagIds: ['b', 'a'] }), true);
  assert.equal(Core.matchesFilter(o, { status: 'all', tagIds: ['b'] }), false);
});

test('PDF column widths come from config without touching saved data', () => {
  const r = sampleReport();
  r.ui.columnWidths = [10, 30, 30, 30];
  deepEq(plain(Core.printColumnWidths(r)), [8, 38, 33, 21]);
  r.config.pdfUseScreenWidths = true;
  deepEq(plain(Core.printColumnWidths(r)), [10, 30, 30, 30]);
});

test('office defaults export and import config plus tags', () => {
  const r = sampleReport();
  r.config.photoExportMaxSide = 900;
  r.tags.push({ id: 't1', name: 'Landscape', color: 'yellow' });
  const json = Core.officeDefaultsJSON(r);
  assert.equal(JSON.parse(json).app, 'WM-FieldReport-Defaults');
  const other = Core.createReport({ today: TODAY });
  Core.applyOfficeDefaults(other, json);
  assert.equal(other.config.photoExportMaxSide, 900);
  deepEq(plain(other.tags), plain(r.tags));
  assert.throws(() => Core.applyOfficeDefaults(other, JSON.stringify({ app: 'WM-FieldReport' })), /office defaults/);
});

test('detects Android embedded WebViews but not Chrome itself', () => {
  const webview = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36';
  const chrome = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
  const desktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0';
  assert.equal(Core.isEmbeddedWebView(webview), true);
  assert.equal(Core.isEmbeddedWebView(chrome), false);
  assert.equal(Core.isEmbeddedWebView(desktop), false);
  assert.equal(Core.isEmbeddedWebView(''), false);
});

test('every notify code used in the app is in the catalog', async () => {
  const { readFileSync } = await import('node:fs');
  const { HTML_PATH } = await import('./load-core.mjs');
  const html = readFileSync(HTML_PATH, 'utf8');
  const shown = [...html.matchAll(/notify\.(?:info|warn|error)\(\s*'(\w+)'/g)].map((m) => m[1]);
  const logged = [...html.matchAll(/notify\.log\(\s*'\w+',\s*'(\w+)'/g)].map((m) => m[1]);
  assert.ok(shown.length > 0 && logged.length > 0, 'expected notify calls in field-report.html');
  for (const code of shown) assert.ok(Core.MESSAGES[code], `MESSAGES is missing ${code}`);
  for (const code of logged) assert.ok(Core.LOG_CODES[code] || Core.MESSAGES[code], `LOG_CODES is missing ${code}`);
  for (const [code, m] of Object.entries(Core.MESSAGES)) {
    assert.ok(m.title && m.message && m.action, `${code} needs a title, message and action`);
  }
});

test('debug log keeps the last 200 entries', () => {
  const log = new Core.DebugLog();
  for (let i = 0; i < 250; i++) log.add('info', 'CODE', `entry ${i}`, new Date(Date.UTC(2026, 0, 1, 0, 0, i)));
  assert.equal(log.entries.length, 200);
  deepEq(log.entries[0], { time: '2026-01-01T00:00:50.000Z', level: 'info', code: 'CODE', detail: 'entry 50' });
  assert.equal(log.entries[199].detail, 'entry 249');
});

test('error details drop data URLs and are capped in length', () => {
  const err = new TypeError('bad data:image/jpeg;base64,' + 'A'.repeat(5000));
  const detail = Core.describeError(err);
  assert.match(detail, /^TypeError: bad data:…/);
  assert.doesNotMatch(detail, /AAAA/);
  assert.ok(Core.describeError('x'.repeat(5000)).length <= 1000);
  assert.equal(Core.describeError(null), '');
});

test('debug report lists versions, capabilities and the log, and no report content', () => {
  const log = new Core.DebugLog();
  log.add('error', 'OPEN_INVALID_FILE', 'img data:image/png;base64,QUJD', new Date(Date.UTC(2026, 5, 26, 14, 0, 0)));
  const text = Core.formatDebugReport({
    userAgent: 'UA/1.0', capabilities: { indexedDB: true, originScheme: 'file:' },
    entries: log.entries, now: new Date(Date.UTC(2026, 5, 26, 15, 0, 0)),
  });
  assert.match(text, /^Field Report debug info\n/);
  assert.match(text, /Generated: 2026-06-26T15:00:00\.000Z/);
  assert.match(text, /App: WM-FieldReport, schema 1/);
  assert.match(text, /User agent: UA\/1\.0/);
  assert.match(text, /indexedDB: true/);
  assert.match(text, /originScheme: file:/);
  assert.match(text, /2026-06-26T14:00:00\.000Z error OPEN_INVALID_FILE img data:…/);
  assert.doesNotMatch(text, /QUJD/);
});

test('parse errors are marked as user-facing', () => {
  try {
    Core.parseReport('{not json');
    assert.fail('expected a throw');
  } catch (err) {
    assert.equal(err.userFacing, true);
  }
  assert.equal(Core.userError('x').userFacing, true);
});
