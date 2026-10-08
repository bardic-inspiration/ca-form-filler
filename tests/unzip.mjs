// Test helper: reads the stored (uncompressed) zips that zipStore() writes,
// e.g. an exported .docx. Pass crc32 to check each entry's checksum.
import assert from 'node:assert/strict';

export function unzip(bytes, crc32) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = bytes.length - 22;
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd--;
  assert.ok(eocd >= 0, 'no end of central directory record');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const files = {};
  for (let i = 0; i < count; i++) {
    assert.equal(view.getUint32(p, true), 0x02014b50, 'central directory entry signature');
    assert.equal(view.getUint16(p + 10, true), 0, 'stored, not compressed');
    const crc = view.getUint32(p + 16, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    assert.equal(view.getUint32(offset, true), 0x04034b50, 'local header signature for ' + name);
    const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    const data = bytes.subarray(start, start + size);
    if (crc32) assert.equal(crc32(data), crc, 'crc of ' + name);
    files[name] = data;
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}
