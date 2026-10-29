import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Build on the maintainer/CI machine. Users never run npm for a complete ZIP.
export async function extensionRuntime(root, destination) {
  await fs.mkdir(destination, { recursive: true });
  for (const file of ['package.json', 'package-lock.json', 'LICENSE', 'src/server.mjs', 'src/client.mjs', 'src/operations.mjs', 'scripts/generate-catalog.mjs', 'extension/workflow.cjs']) {
    await fs.mkdir(path.dirname(path.join(destination, file)), { recursive: true });
    await fs.copyFile(path.join(root, file), path.join(destination, file));
  }
  const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  execFileSync(process.execPath, [npm, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--bin-links=false'], { cwd: destination, encoding: 'utf8', timeout: 120000 });
  const entries = [];
  async function collect(relative) {
    const filename = path.join(destination, relative), stat = await fs.lstat(filename);
    if (stat.isSymbolicLink()) throw new Error(`Runtime must not contain symlinks: ${relative}`);
    if (stat.isDirectory()) {
      for (const name of (await fs.readdir(filename)).sort()) await collect(relative ? `${relative}/${name}` : name);
    } else if (relative !== 'node_modules/.package-lock.json') {
      if (/\.(node|exe|dll|dylib|so)$/i.test(relative)) throw new Error(`Runtime must contain portable JS dependencies only: ${relative}`);
      entries.push({ name: relative, data: await fs.readFile(filename) });
    }
  }
  await collect('');
  return entries;
}
