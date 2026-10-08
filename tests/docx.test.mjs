// Issue #52: Export Word (.docx). toDocx() builds a Word document that lays
// out like the PDF: same masthead, header fields, disclaimer, general
// observations, observation table, photos and reminders.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './load-core.mjs';
import { unzip as unzipWith } from './unzip.mjs';

const Core = loadCore();
const unzip = (bytes) => unzipWith(bytes, Core.crc32);

const text = (bytes) => new TextDecoder().decode(bytes);

// Just enough of a PNG / JPEG for imageSize(): the header with the pixel size.
function fakePng(w, h) {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
}
function fakeJpeg(w, h) {
  const b = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 0, 0, 0, 3, 0, 0, 0, 0xff, 0xd9]);
  new DataView(b.buffer).setUint16(13, h);
  new DataView(b.buffer).setUint16(15, w);
  return b;
}
const dataUrl = (type, bytes) => `data:${type};base64,` + Buffer.from(bytes).toString('base64');

// EMU per inch.
const EMU = 914400;

function sampleReport() {
  const r = Core.createReport({ today: '2026-10-08' });
  Object.assign(r.header, {
    author: 'A. Author', purpose: 'Site visit', project: 'Park & <Plaza>', projectNumber: '2401',
    time: '9:00 AM', weather: 'Sunny', distribution: ['Owner', 'GC'],
    attendees: [{ name: 'Pat', organization: 'City' }],
  });
  const photo = Core.createPhoto(dataUrl('image/jpeg', fakeJpeg(300, 200)), 'a.jpg');
  r.photos[photo.id] = photo;
  const g = Core.createGeneralObservation();
  g.text = 'General note\nsecond line';
  r.generalObservations.push(g);
  const o = Core.createObservation(r);
  o.description = 'Cracked paver';
  o.requirement = 'Replace per spec';
  o.photoIds.push(photo.id);
  r.observations.push(o);
  Core.renumber(r);
  return { r, photo, o };
}

function build(r, photoIds) {
  const photos = {};
  for (const id of photoIds) photos[id] = r.photos[id].original;
  return unzip(Core.toDocx(r, { logo: dataUrl('image/png', fakePng(400, 100)), photos }));
}

test('crc32 matches the standard check value', () => {
  assert.equal(Core.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('zipStore round-trips names and contents', () => {
  const zip = Core.zipStore([
    { name: 'a.txt', data: 'héllo' },
    { name: 'dir/b.bin', data: new Uint8Array([1, 2, 3]) },
  ]);
  const files = unzip(zip);
  assert.deepEqual(Object.keys(files), ['a.txt', 'dir/b.bin']);
  assert.equal(text(files['a.txt']), 'héllo');
  assert.deepEqual([...files['dir/b.bin']], [1, 2, 3]);
});

test('imageSize reads PNG and JPEG pixel sizes', () => {
  assert.deepEqual({ ...Core.imageSize(fakePng(400, 100)) }, { width: 400, height: 100 });
  assert.deepEqual({ ...Core.imageSize(fakeJpeg(300, 200)) }, { width: 300, height: 200 });
  assert.equal(Core.imageSize(new Uint8Array([1, 2, 3])), null);
});

test('dataUrlBytes decodes base64 data URLs', () => {
  const { type, bytes } = Core.dataUrlBytes(dataUrl('image/png', [0, 255, 7, 128]));
  assert.equal(type, 'image/png');
  assert.deepEqual([...bytes], [0, 255, 7, 128]);
});

test('toDocx has the parts Word needs', () => {
  const { r, photo } = sampleReport();
  const files = build(r, [photo.id]);
  for (const name of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels',
    'word/styles.xml', 'word/settings.xml', 'word/numbering.xml']) {
    assert.ok(files[name], 'missing ' + name);
  }
  const types = text(files['[Content_Types].xml']);
  assert.match(types, /Extension="jpeg"/);
  assert.match(types, /Extension="png"/);
  // Every relationship target exists in the package.
  for (const [rels, base] of [['word/_rels/document.xml.rels', 'word/'], ...Object.keys(files)
    .filter((n) => /^word\/_rels\/(header|footer)\d+\.xml\.rels$/.test(n)).map((n) => [n, 'word/'])]) {
    for (const [, target, mode] of text(files[rels]).matchAll(/Target="([^"]+)"( TargetMode="External")?/g)) {
      if (!mode) assert.ok(files[base + target], `${rels} points at missing ${target}`);
    }
  }
});

test('document text matches the PDF content, escaped', () => {
  const { r, o } = sampleReport();
  const doc = text(build(r, r.observations[0].photoIds)['word/document.xml']);
  assert.match(doc, /FIELD OBSERVATION REPORT 01/);
  assert.match(doc, /Park &amp; &lt;Plaza&gt;/);
  assert.match(doc, /10\/8\/2026/);
  assert.match(doc, /Owner, GC/);
  assert.match(doc, /Pat \(City\)/);
  assert.match(doc, /General Observations\/Comments/);
  assert.match(doc, /General note<\/w:t><w:br\/><w:t xml:space="preserve">second line/);
  assert.ok(doc.includes('>' + o.number + '<'), 'item number');
  assert.match(doc, /Cracked paver/);
  assert.match(doc, /Replace per spec/);
  for (const label of ['Item', 'Observation', 'Supporting Photo', 'Contract Requirement']) {
    assert.ok(doc.includes('>' + label + '<'), label);
  }
  assert.match(doc, /<w:tblHeader\/>/, 'table header repeats on each page');
  assert.match(doc, /<w:cantSplit\/>/, 'rows do not split across pages');
  assert.match(doc, /<w:titlePg\/>/, 'first page has its own header and footer');
});

test('letter page with the PDF margins', () => {
  const { r } = sampleReport();
  const doc = text(build(r, [])['word/document.xml']);
  assert.match(doc, /<w:pgSz w:w="12240" w:h="15840"\/>/);
  assert.match(doc, /<w:pgMar w:top="2232" w:right="1440" w:bottom="1152" w:left="1440" w:header="864" w:footer="547" w:gutter="0"\/>/);
});

test('observation table uses the PDF column widths', () => {
  const { r } = sampleReport();
  r.config.pdfUseScreenWidths = true;
  r.ui.columnWidths = [10, 30, 40, 20];
  const doc = text(build(r, [])['word/document.xml']);
  const table = 9240; // 6.5in less 6pt, in twips
  const grid = [10, 30, 40, 20].map((w) => Math.round(table * w / 100));
  assert.ok(doc.includes(grid.map((w) => `<w:gridCol w:w="${w}"/>`).join('')), 'grid ' + grid);
});

test('photos are sized like the PDF', () => {
  const { r, photo, o } = sampleReport();
  r.config.photoMaxHeightTable = 1;
  const doc = text(build(r, [photo.id])['word/document.xml']);
  // One Full photo, 3:2, in the photo column: the 1in height cap wins over the cell width.
  const cellW = Core.printPhotoCellWidthIn(r, 'obs');
  const w = Math.min(cellW, 1 * 1.5);
  assert.ok(doc.includes(`<wp:extent cx="${Math.round(w * EMU)}" cy="${Math.round(w / 1.5 * EMU)}"/>`), 'extent');
  assert.equal([...doc.matchAll(/<pic:pic\b/g)].length, 1);
  assert.equal(o.photoIds.length, 1);
});

test('photos share rows like the PDF flow', () => {
  const { r, o } = sampleReport();
  for (let i = 0; i < 2; i++) {
    const p = Core.createPhoto(dataUrl('image/jpeg', fakeJpeg(300, 200)), 'b.jpg');
    r.photos[p.id] = p;
    o.photoIds.push(p.id);
  }
  // Default arrangement for 3 photos: two halves, then one full.
  const doc = text(build(r, o.photoIds)['word/document.xml']);
  const cell = doc.slice(doc.indexOf('Cracked paver'));
  const paras = cell.slice(0, cell.indexOf('Replace per spec')).split('</w:p>')
    .map((p) => [...p.matchAll(/<pic:pic\b/g)].length).filter(Boolean);
  assert.deepEqual(paras, [2, 1]);
});

test('a row of photos with mixed heights is top-aligned in a borderless table', () => {
  const { r, o } = sampleReport();
  const tall = Core.createPhoto(dataUrl('image/jpeg', fakeJpeg(200, 300)), 'c.jpg');
  r.photos[tall.id] = tall;
  o.photoIds.push(tall.id); // two halves: 3:2 and 2:3
  const doc = text(build(r, o.photoIds)['word/document.xml']);
  const cell = doc.slice(doc.indexOf('Cracked paver'), doc.indexOf('Replace per spec'));
  const nested = cell.match(/<w:tbl>[\s\S]*?<\/w:tbl>/);
  assert.ok(nested, 'row table');
  assert.equal([...nested[0].matchAll(/<pic:pic\b/g)].length, 2);
  assert.equal([...nested[0].matchAll(/<w:tc>/g)].length, 2);
  assert.match(nested[0], /<w:insideV w:val="nil"\/>/);
});

test('header and footer carry the running title, page numbers and office footer', () => {
  const { r } = sampleReport();
  const files = build(r, []);
  const parts = Object.keys(files).filter((n) => /^word\/(header|footer)\d+\.xml$/.test(n)).map((n) => text(files[n]));
  const all = parts.join('\n');
  assert.match(all, /LANDSCAPE ARCHITECTURE {3}URBAN DESIGN {3}PLANNING/);
  assert.match(all, /<pic:pic\b/, 'logo in the first page header');
  assert.match(all, /Field Observation Report 01/);
  assert.match(all, /PAGE/);
  assert.match(all, /NUMPAGES/);
  assert.match(all, /419 SW 11TH AVENUE, SUITE 200 {5}\| {5}PORTLAND/);
});

test('reminders follow the PDF setting', () => {
  const { r } = sampleReport();
  const prev = Core.createObservation(r);
  prev.description = 'Old open item';
  r.inherited.push({ ...prev, sourceReport: 0, originalNumber: '0.01' });
  assert.match(text(build(r, [])['word/document.xml']), /Open Items from Previous Reports[\s\S]*Old open item/);
  r.config.pdfShowReminders = false;
  assert.doesNotMatch(text(build(r, [])['word/document.xml']), /Open Items from Previous Reports/);
});

test('status and tag pills follow the PDF settings', () => {
  const { r, o } = sampleReport();
  r.tags.push({ id: 't1', name: 'Paving', color: 'blue' });
  o.tagIds.push('t1');
  assert.doesNotMatch(text(build(r, [])['word/document.xml']), /Incomplete|Paving/);
  r.config.pdfShowStatus = true;
  r.config.pdfShowTags = true;
  const doc = text(build(r, [])['word/document.xml']);
  assert.match(doc, /Incomplete/);
  assert.match(doc, /w:fill="CFE3FA"[\s\S]*Paving/);
});

test('control characters are dropped so the XML stays valid', () => {
  const { r, o } = sampleReport();
  o.description = 'bad\u0001char';
  assert.match(text(build(r, [])['word/document.xml']), /badchar/);
});
