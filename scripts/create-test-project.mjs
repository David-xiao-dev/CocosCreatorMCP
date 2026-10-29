import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const i = process.argv.indexOf('--creator');
const creator = i >= 0 ? process.argv[i + 1] : 'C:/ProgramData/cocos/editors/Creator/3.8.8';
const target = path.join(root, 'test-project');
try { await fs.access(target); throw new Error(`Already exists: ${target}`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await fs.cp(path.join(creator, 'resources', 'templates', 'hello-3d-world'), target, { recursive: true });
await fs.writeFile(path.join(target, 'package.json'), JSON.stringify({
  name: 'cocos-mcp-sandbox', uuid: randomUUID(), creator: { version: '3.8.8' },
}, null, 2));
console.log(`Created independent test project from the installed Creator Hello World template: ${target}`);
