import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { catalog } from '../scripts/generate-catalog.mjs';
const { startBridge } = createRequire(import.meta.url)('../extension/bridge.cjs');
const { execute } = createRequire(import.meta.url)('../extension/workflow.cjs');
test('compact MCP has four discoverable tools, validates readonly access, executes batch refs and returns images', async t => {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'cocos-compact-'));
  let calls = 0;
  const dispatch = async (op, params) => {
    if (op === 'workflow.execute') return execute(params.steps, { catalog, dispatch, dryRun: params.dryRun });
    calls++;
    if (op === 'node.create') return 'node-1';
    if (op === 'editor.screenshot') return { mimeType: 'image/png', data: 'aGVsbG8=' };
    return { uuid: params.uuid };
  };
  const bridge = await startBridge({ project, version: '3.8.8', dispatch });
  const client = new Client({ name: 'compact-check', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../src/server.mjs', import.meta.url)), '--project', project], stderr: 'pipe' });
  t.after(async () => { await client.close(); await bridge.close(); await fs.rm(project, { recursive: true, force: true }); });
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 4);
  const call = (name, args) => client.callTool({ name, arguments: args });
  const schema = JSON.parse((await call('cocos_catalog', { op: 'node.create' })).content[0].text);
  assert.equal(schema.inputSchema.properties.name.type, 'string');
  const schemas = JSON.parse((await call('cocos_catalog', { ops: ['animation.create','spine.configure','build.start'] })).content[0].text);
  assert.equal(schemas.operations.length,3);
  assert.equal((await call('cocos_catalog', { ops: ['build.start','invented.op'] })).isError,true);
  assert.equal((await call('cocos_catalog', { op:'build.start', ops:['build.start'] })).isError,true);
  assert.equal((await call('cocos_observe', { op: 'node.create', params: { name: 'A' } })).isError, true);
  assert.equal(calls, 0);
  const batch = await call('cocos_execute', { steps: [
    { id: 'new', op: 'node.create', params: { name: 'A' }, output: 'none' },
    { id: 'check', op: 'node.inspect', params: { uuid: { $ref: 'new#' } }, fields: ['/uuid'] },
  ] });
  const result = JSON.parse(batch.content[0].text).result;
  assert.equal(result.ok, true);
  assert.equal(result.steps[1].result['/uuid'], 'node-1');
  const screenshot = await call('cocos_observe', { op: 'editor.screenshot', params: { windowId: 1 } });
  assert.equal(screenshot.content[1].type, 'image');
});
