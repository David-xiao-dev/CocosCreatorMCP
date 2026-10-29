import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const { connection } = createRequire(import.meta.url)('../extension/connection.cjs');

test('complete extension resolves relocated paths and Electron environment without source installer or PATH', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cocos portable 中文 '));
  try {
    const directory = path.join(root, 'original', 'cocos-codex-bridge');
    for (const file of ['src/server.mjs', 'package.json', 'extension/workflow.cjs', 'scripts/generate-catalog.mjs', 'node_modules/@modelcontextprotocol/sdk/package.json', 'node_modules/zod/package.json']) {
      const target = path.join(directory, 'mcp', file);
      await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, '{}');
    }
    const relocated = path.join(root, 'moved extension');
    await fs.rename(directory, relocated);
    const executable = path.join(root, 'Creator path', 'CocosCreator.exe');
    const setup = connection({ directory: relocated, project: root, executable, electron: true });
    assert.equal(setup.ready, true);
    assert.equal(setup.mode, 'complete-extension');
    assert.deepEqual(setup.config.mcpServers.cocos_creator, { command: executable, args: [path.join(relocated, 'mcp/src/server.mjs'), '--project', root], env: { ELECTRON_RUN_AS_NODE: '1' } });
    assert.match(setup.toml, /\[mcp_servers\.cocos_creator\.env\]\nELECTRON_RUN_AS_NODE = "1"/);
    assert.ok(!setup.toml.includes('original'));
    await fs.rm(path.join(relocated, 'mcp/node_modules/zod/package.json'));
    const broken = connection({ directory: relocated, project: root });
    assert.equal(broken.ready, false); assert.equal(broken.config, null);
    assert.match(broken.error, /重新解压/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('source installation validates existing absolute paths and never emits placeholder client configuration', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cocos source config '));
  try {
    const missing = connection({ directory: root, project: root });
    assert.equal(missing.ready, false); assert.equal(missing.toml, '');
    const server = path.join(root, 'server.mjs'); await fs.writeFile(server, '');
    await fs.writeFile(path.join(root, 'installation.json'), JSON.stringify({ node: process.execPath, server }));
    const installed = connection({ directory: root, project: root });
    assert.equal(installed.ready, true); assert.equal(installed.mode, 'source-install');
    assert.equal(installed.config.mcpServers.cocos_creator.env, undefined);
    await fs.rm(server);
    assert.equal(connection({ directory: root, project: root }).ready, false);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
