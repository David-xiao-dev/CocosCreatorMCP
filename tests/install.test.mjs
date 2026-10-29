import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
test('fresh install emits real TOML lines and usable absolute paths; repeated install preserves custom config', async () => {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'cocos install space-'));
  try {
    await fs.writeFile(path.join(project, 'package.json'), JSON.stringify({ creator: { version: '3.8.8' } }));
    const install = () => execFileSync(process.execPath, [path.join(root, 'scripts/install.mjs'), '--project', project], { encoding: 'utf8' });
    install();
    const configPath = path.join(project, '.codex/config.toml');
    const config = await fs.readFile(configPath, 'utf8');
    const lines = config.trim().split('\n');
    assert.equal(lines.length, 5);
    assert.equal(lines[0], '[mcp_servers.cocos_creator]');
    assert.equal(JSON.parse(lines[1].slice('command = '.length)), process.execPath);
    assert.deepEqual(JSON.parse(lines[2].slice('args = '.length)), [path.join(root, 'src/server.mjs'), '--project', project]);
    assert.match(install(), /already up to date/);
    const custom = '# user settings\nmodel = "user-model"\n' + config;
    await fs.writeFile(configPath, custom);
    assert.match(install(), /Existing config preserved/);
    assert.equal(await fs.readFile(configPath, 'utf8'), custom);
    assert.equal(await fs.readFile(path.join(project, '.codex/cocos-mcp.example.toml'), 'utf8'), config);
    const descriptor = JSON.parse(await fs.readFile(path.join(project, 'extensions/cocos-codex-bridge/installation.json'), 'utf8'));
    assert.equal(descriptor.node, process.execPath);
    assert.equal(descriptor.server, path.join(root, 'src/server.mjs'));
    const installed = path.join(project, 'extensions/cocos-codex-bridge');
    assert.equal(await fs.readFile(path.join(installed, 'LICENSE'), 'utf8'), await fs.readFile(path.join(root, 'LICENSE'), 'utf8'));
    assert.equal(await fs.readFile(path.join(installed, 'docs/LICENSING.md'), 'utf8'), await fs.readFile(path.join(root, 'docs/LICENSING.md'), 'utf8'));
  } finally {
    const resolved = await fs.realpath(project);
    if (path.dirname(resolved).toLowerCase() !== (await fs.realpath(os.tmpdir())).toLowerCase() || !path.basename(resolved).startsWith('cocos install space-')) throw new Error('Unsafe install fixture cleanup');
    await fs.rm(resolved, { recursive: true, force: true });
  }
});
