import fs from 'node:fs';

// Read only the requested entries; never unpack or change the installed editor.
export function readAsar(archive, filename) {
  const fd = fs.openSync(archive, 'r');
  try {
    const prefix = Buffer.alloc(16);
    fs.readSync(fd, prefix, 0, 16, 0);
    const header = Buffer.alloc(prefix.readUInt32LE(12));
    fs.readSync(fd, header, 0, header.length, 16);
    let entry = JSON.parse(header.toString());
    for (const part of filename.split('/').filter(Boolean)) entry = entry?.files?.[part];
    if (!entry || entry.files) throw new Error(`Not an archived file: ${filename}`);
    if (entry.unpacked) return fs.readFileSync(`${archive}.unpacked/${filename}`, 'utf8');
    const content = Buffer.alloc(entry.size);
    fs.readSync(fd, content, 0, content.length, 8 + prefix.readUInt32LE(4) + Number(entry.offset));
    return content.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

if (process.argv[1]?.endsWith('read-asar.mjs') && process.argv[2]) {
  for (const filename of process.argv.slice(3)) {
    console.log(`FILE: ${filename}\n${readAsar(process.argv[2], filename)}`);
  }
}
