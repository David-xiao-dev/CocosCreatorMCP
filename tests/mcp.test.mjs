import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const { startBridge } = createRequire(import.meta.url)('../extension/bridge.cjs');
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('real stdio MCP handshake, schemas, tool dispatch, errors and image content', async t => {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'cocos-mcp-stdio-'));
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'src/server.mjs'), '--project', project, '--tools', 'legacy'], stderr: 'pipe' });
  const client = new Client({ name: 'integration-test', version: '1.0.0' });
  let bridge;
  t.after(async () => { await client.close(); await bridge?.close(); await fs.rm(project, { recursive: true, force: true }); });
  await client.connect(transport);
  const catalog = await client.listTools();
  assert.ok(catalog.tools.length >= 20);
  assert.equal(catalog.tools.find(t => t.name === 'scene_tree').annotations.readOnlyHint, true);
  assert.equal(catalog.tools.find(t => t.name === 'editor_script').annotations.readOnlyHint, false);
  // MCP starts even if Creator has not been opened yet.
  assert.equal((await client.callTool({ name: 'editor_status', arguments: {} })).isError, true);
  const calls = [];
  bridge = await startBridge({ project, version: '3.8.8', dispatch: async (action, params) => {
    calls.push({ action, params });
    if (action === 'editor.screenshot') return { mimeType: 'image/png', data: 'aGVsbG8=', originalSize: { width: 800, height: 600 } };
    if (action === 'node.create') throw new Error('no scene');
    return { applied: true };
  } });
  const status = await client.callTool({ name: 'editor_status', arguments: {} });
  assert.equal(JSON.parse(status.content[0].text).result.editorVersion, '3.8.8');
  await client.callTool({ name: 'property_set', arguments: { uuid: 'node-id', path: 'name', dump: { type: 'String', value: 'Player' } } });
  assert.deepEqual(calls.at(-1), { action: 'property.set', params: { uuid: 'node-id', path: 'name', dump: { type: 'String', value: 'Player' } } });
  const image = await client.callTool({ name: 'editor_screenshot', arguments: { windowId: 1 } });
  assert.equal(image.content[1].type, 'image');
  assert.equal(image.content[1].mimeType, 'image/png');
  const failure = await client.callTool({ name: 'node_create', arguments: { name: 'Player' } });
  assert.equal(failure.isError, true);
  assert.match(failure.content[0].text, /no scene/);
  assert.equal((await client.callTool({ name: 'editor_screenshot', arguments: { windowId: -1 } })).isError, true);
});
