import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const requested = process.argv[2] || process.env.GITHUB_REF_NAME || '';
const expected = `v${pkg.version}`;
if (requested && requested !== expected && requested !== pkg.version) {
  throw new Error(`Release tag ${requested} does not match package version ${pkg.version}; use ${expected}.`);
}
console.log(JSON.stringify({ version: pkg.version, tag: requested || expected, matched: !requested || requested === expected || requested === pkg.version }, null, 2));
