// Small ZIP utility for our own release artifacts. No ZIP64, encryption or
// filesystem extraction. Consumers verify names and compare bytes in memory.
import { deflateRawSync, inflateRawSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
const crc32 = buffer => {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};
function safeName(name) {
  if (!name || name.startsWith('/') || name.includes('\\') || name.includes('\0') || name.includes(':') || name.split('/').some(p => p === '..' || p === '.' || !p)) throw new Error(`Unsafe ZIP entry: ${name}`);
}
export function zip(entries) {
  if (entries.length >= 65535) throw new Error('ZIP64 is not supported.');
  const local = [], directory = [], seen = new Set();
  let offset = 0;
  for (const { name, data } of entries) {
    safeName(name);
    if (seen.has(name)) throw new Error(`Duplicate ZIP entry: ${name}`);
    seen.add(name);
    if (data.length > 32 * 1024 * 1024) throw new Error(`Release source file too large: ${name}`);
    const encoded = Buffer.from(name), compressed = deflateRawSync(data), crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(8, 8); header.writeUInt16LE(33, 12); // 1980-01-01, deterministic
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(encoded.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8); central.writeUInt16LE(8, 10); central.writeUInt16LE(33, 14);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(encoded.length, 28); central.writeUInt32LE(offset, 42);
    local.push(header, encoded, compressed); directory.push(central, encoded);
    offset += header.length + encoded.length + compressed.length;
  }
  const centralBytes = Buffer.concat(directory), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBytes, end]);
}

export function readZip(buffer) {
  if (buffer.length < 22) throw new Error('Truncated ZIP.');
  const end = buffer.length - 22;
  if (buffer.readUInt32LE(end) !== 0x06054b50 || buffer.readUInt16LE(end + 20) !== 0) throw new Error('Expected ZIP without comment.');
  const count = buffer.readUInt16LE(end + 10), directorySize = buffer.readUInt32LE(end + 12);
  let cursor = buffer.readUInt32LE(end + 16);
  if (cursor + directorySize !== end) throw new Error('Invalid ZIP directory size.');
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid ZIP directory.');
    const compressedSize = buffer.readUInt32LE(cursor + 20), size = buffer.readUInt32LE(cursor + 24), nameSize = buffer.readUInt16LE(cursor + 28);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameSize).toString('utf8');
    safeName(name);
    if (files.has(name)) throw new Error('Duplicate ZIP entry.');
    const offset = buffer.readUInt32LE(cursor + 42);
    if (buffer.readUInt32LE(offset) !== 0x04034b50 || buffer.readUInt16LE(offset + 8) !== 8 || size > 32 * 1024 * 1024) throw new Error('Unsupported ZIP entry.');
    const start = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28);
    const data = inflateRawSync(buffer.subarray(start, start + compressedSize), { maxOutputLength: 32 * 1024 * 1024 });
    if (data.length !== size || crc32(data) !== buffer.readUInt32LE(cursor + 16)) throw new Error(`ZIP integrity failure: ${name}`);
    files.set(name, data);
    cursor += 46 + nameSize + buffer.readUInt16LE(cursor + 30) + buffer.readUInt16LE(cursor + 32);
  }
  if (cursor !== end) throw new Error('ZIP directory entry count mismatch.');
  return files;
}
