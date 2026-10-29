import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { zip } from './zip.mjs';
import { extensionRuntime } from './extension-package.mjs';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const directory = path.join(root, 'artifacts', 'releases');
await fs.mkdir(directory, { recursive: true });
const staging = await fs.mkdtemp(path.join(directory, 'stage-'));
const source = path.join(staging, 'package');
const files = [];
const forbidden = /(^|\/)(node_modules|test-project|artifacts|\.codex|\.git)(\/|$)|^extension\/mcp(\/|$)|(^|\/)(installation|connection|settings)\.json$/;
async function copy(relative) {
  if (forbidden.test(relative)) return;
  const absolute = path.join(root, relative), stat = await fs.lstat(absolute);
  if (stat.isSymbolicLink()) throw new Error(`Refusing symlink in release: ${relative}`);
  if (stat.isDirectory()) for (const name of (await fs.readdir(absolute)).sort()) await copy(`${relative}/${name}`);
  else { await fs.mkdir(path.dirname(path.join(source, relative)), { recursive: true }); await fs.copyFile(absolute, path.join(source, relative)); files.push(relative); }
}
const filename = path.join(directory, `cocos-creator-mcp-${pkg.version}-source.tar.gz`);
const archives = [];
const extensionPkg = JSON.parse(await fs.readFile(path.join(root, 'extension/package.json'), 'utf8'));
const lock = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json'), 'utf8'));
if (extensionPkg.version !== pkg.version || lock.version !== pkg.version || lock.packages[''].version !== pkg.version) throw new Error('Package, lockfile and extension versions must agree.');
if (pkg.license !== 'SEE LICENSE IN LICENSE' || extensionPkg.license !== pkg.license || lock.packages[''].license !== pkg.license) throw new Error('Root, lockfile and extension license metadata must refer to LICENSE.');
async function record(filename, kind, files, prefix) {
  const contents = await fs.readFile(filename);
  const entry = { filename: path.basename(filename), kind, sha256: createHash('sha256').update(contents).digest('hex'), bytes: contents.length, files, prefix };
  archives.push(entry);
  await fs.writeFile(`${filename}.sha256`, `${entry.sha256}  ${entry.filename}\n`);
}
try {
  for (const entry of ['src', 'extension', 'scripts', 'docs', 'examples', 'tests', '.github', 'README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'LICENSE', 'SECURITY.md', 'package.json', 'package-lock.json', '.gitignore', '.gitattributes']) await copy(entry);
  for (const required of ['docs/INSTALLATION.md', 'docs/GITHUB-RELEASE.md', 'docs/LICENSING.md', 'scripts/zip.mjs', 'scripts/check-version.mjs', 'scripts/release-notes.mjs', 'tests/install.test.mjs', '.github/workflows/release.yml', 'SECURITY.md']) if (!files.includes(required)) throw new Error(`Missing publishing release file ${required}`);
  for (const required of ['extension/connection.cjs', 'scripts/extension-package.mjs', 'scripts/check-extension.mjs', 'scripts/live-extension-check.mjs', 'tests/connection.test.mjs']) if (!files.includes(required)) throw new Error(`Missing complete-extension release file ${required}`);
  for (const required of ['extension/typography.cjs', 'extension/ui-model.cjs', 'extension/ui-engine.cjs', 'extension/editor-view.cjs', 'extension/ui-layout.cjs', 'docs/TYPOGRAPHY-UI.md', 'docs/SCENE-VIEW-REFERENCE.md', 'docs/UI-LAYOUT.md', 'tests/typography.test.mjs', 'tests/editor-view.test.mjs', 'tests/ui-layout.test.mjs', 'examples/typography/fixture.mjs', 'scripts/create-typography-demo.mjs', 'scripts/live-typography-check.mjs', 'scripts/live-typography-panel-check.mjs', 'scripts/live-scene-view-check.mjs', 'scripts/live-ui-layout-check.mjs', 'scripts/live-ui-layout-panel-check.mjs']) if (!files.includes(required)) throw new Error(`Missing UI release file ${required}`);
  for (const required of ['package-lock.json', 'extension/development.cjs', 'extension/prefab.cjs', 'extension/prefab-model.cjs', 'extension/operations.json', 'docs/PREFAB-WORKFLOWS.md', 'tests/prefab.test.mjs', 'examples/interactive-demo/McpInteractiveDemo.ts', 'scripts/live-runtime-check.mjs', 'scripts/live-prefab-check.mjs', 'extension/resources.cjs', 'extension/resource-store.cjs', 'extension/animation.cjs', 'extension/animation-model.cjs', 'extension/engine-tools.cjs', 'extension/runtime-browser.cjs', 'extension/build.cjs', 'docs/RESOURCE-ANIMATION-BUILD.md', 'examples/animation-spine/fixture.mjs', 'tests/resources-animation-build.test.mjs', 'scripts/benchmark-workflow.mjs', 'scripts/live-resource-check.mjs', 'scripts/live-animation-check.mjs', 'scripts/live-workflow-check.mjs', 'scripts/verify-release.mjs', 'LICENSE']) if (!files.includes(required)) throw new Error(`Missing release file ${required}`);
  execFileSync('tar', ['-czf', filename, '-C', staging, 'package'], { encoding: 'utf8' });
  await record(filename, 'source-tar', [...files], 'package/');
  const entries = await Promise.all(files.map(async file => ({ name: file, data: await fs.readFile(path.join(source, file)) })));
  const sourceZip = path.join(directory, `cocos-creator-mcp-${pkg.version}-source.zip`);
  await fs.writeFile(sourceZip, zip(entries.map(entry => ({ ...entry, name: `package/${entry.name}` }))));
  await record(sourceZip, 'source-zip', [...files], 'package/');
  const extensionZip = path.join(directory, `cocos-creator-mcp-${pkg.version}-extension.zip`);
  const extensionFiles = files.filter(file => file.startsWith('extension/'));
  const bridgeEntries = entries.filter(entry => entry.name.startsWith('extension/')).map(entry => ({ ...entry, name: `cocos-codex-bridge/${entry.name.slice(10)}` }));
  const extensionDocs = ['LICENSE', 'README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', ...files.filter(file => file.startsWith('docs/'))];
  for (const file of extensionDocs) bridgeEntries.push({ name: `cocos-codex-bridge/${file}`, data: await fs.readFile(path.join(source, file)) });
  const runtime = await extensionRuntime(source, path.join(staging, 'runtime'));
  for (const entry of runtime) bridgeEntries.push({ name: `cocos-codex-bridge/mcp/${entry.name}`, data: entry.data });
  await fs.writeFile(extensionZip, zip(bridgeEntries));
  await record(extensionZip, 'extension-zip', [...extensionFiles, ...extensionDocs, ...runtime.map(entry => `mcp/${entry.name}`)], 'cocos-codex-bridge/');
} finally {
  const resolved = await fs.realpath(staging), relative = path.relative(await fs.realpath(directory), resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unsafe release staging cleanup path.');
  await fs.rm(resolved, { recursive: true, force: true });
}
const hash = createHash('sha256').update(await fs.readFile(filename)).digest('hex');
const manifest = { version: pkg.version, channel: 'development-preview', time: new Date().toISOString(), filename: path.basename(filename), sha256: hash, bytes: (await fs.stat(filename)).size, files, archives, note: 'Recommended extension ZIP includes the MCP service and locked JS dependencies. Extract into project extensions, enable in Creator 3.8.8 and copy client configuration. Uses the installed Creator Electron runtime; no separate Node/npm/server installation for users. Source packages still require npm ci and Node.js 22+. Not a Creator Store package. GitHub and npm are not modified.' };
await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
await fs.writeFile(`${filename}.sha256`, `${hash}  ${path.basename(filename)}\n`);
await fs.writeFile(path.join(directory, 'SHA256SUMS.txt'), archives.map(a => `${a.sha256}  ${a.filename}`).join('\n') + '\n');
console.log(JSON.stringify({ version: pkg.version, archives: archives.map(({ files, ...entry }) => ({ ...entry, fileCount: files.length })) }, null, 2));
