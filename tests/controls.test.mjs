import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { BridgeClient } from '../src/client.mjs';
const require = createRequire(import.meta.url);
test('panel settings enforce pause and advanced access on direct and batched RPC, while read operations remain usable', async t => {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'cocos-controls-'));
  const previous = globalThis.Editor;
  const calls = [];
  let selected = ['old-node'];
  globalThis.Editor = {
    Project: { path: project }, App: { version: '3.8.8' },
    Message: { request: async (...args) => {
      calls.push(args);
      if (args[0] === 'scene' && args[1] === 'query-node-tree') return { uuid: 'scene', children: [{ uuid: 'canvas' }] };
      if (args[0] === 'scene' && args[1] === 'execute-scene-script') return { canvas: 'canvas', missing: [], canvases: [{ uuid: 'canvas', active: true, camera: { active: true, visibility: 1 << 25 } }] };
      return { uuid: 'stub' };
    } },
    Logger: { query: () => [] },
    Selection: { clear: () => { selected = []; }, select: (type, uuids) => { selected.push(...uuids); }, getSelected: () => [...selected] },
  };
  const filename = require.resolve('../extension/main.js'); delete require.cache[filename];
  const extension = require(filename);
  await extension.load();
  t.after(async () => { await extension.unload(); globalThis.Editor = previous; delete require.cache[filename]; await fs.rm(project, { recursive: true, force: true }); });
  const client = new BridgeClient(project);
  extension.methods.setSettings({ paused: true });
  await assert.rejects(client.call('node.create', { name: 'NO_EDIT' }), /paused/);
  await assert.rejects(client.call('workflow.execute', { steps: [{ id: 'no', op: 'node.create', params: { name: 'NO_EDIT' } }] }), /paused/);
  assert.equal((await client.call('status')).result.controls.paused, true);
  assert.equal((await client.call('editor.logs')).result.total, 0);
  assert.equal(calls.length, 0);
  await assert.rejects(extension.methods.prefabAction('prefab.create', { node: 'node', url: 'db://assets/Test.prefab' }), /paused/);
  await assert.rejects(extension.methods.prefabAction('editor.script', {}), /Unsupported/);
  await assert.rejects(extension.methods.workflowAction('build.start', { scenes:['db://assets/Main.scene'] }), /paused/);
  await assert.rejects(extension.methods.workflowAction('text.configure', { node:'node',fontSize:30 }), /paused/);
  await assert.rejects(extension.methods.workflowAction('editor.script', {}), /Unsupported/);
  assert.equal(calls.length, 0, 'panel prefab writes use the same queue/controls');
  extension.methods.setSettings({ paused: false, allowScripts: false });
  for (const op of ['editor.script', 'editor.request']) await assert.rejects(client.call(op, {}), /disabled/);
  await assert.rejects(client.call('workflow.execute', { steps: [
    { id: 'first', op: 'node.create', params: { name: 'NO_EDIT' } },
    { id: 'blocked', op: 'editor.script', params: { context: 'main', code: 'return 1;' } },
  ] }), /disabled/);
  assert.equal(calls.length, 0, 'permission precheck must reject before the first edit');
  await assert.rejects(client.call('component.patch', { node: 'node', component: 'cc.Label', properties: {}, dryRun: 'invalid' }), /expected boolean/);
  assert.equal(calls.length, 0, 'direct bridge requests validate schemas before reaching editor APIs');
  const saved = JSON.parse(await fs.readFile(path.join(project, 'local/cocos-mcp/settings.json'), 'utf8'));
  assert.equal(saved.allowScripts, false);
  assert.deepEqual((await extension.methods.workflowAction('selection', { uuids:['new-node'] })).uuids, ['new-node'], 'setting selection must replace rather than append');
  assert.deepEqual((await extension.methods.workflowAction('selection', { uuids:[] })).uuids, [], 'empty selection clears the native selection');
  extension.methods.setSettings({ allowScripts: true });
  const plan = await client.call('editor.request', { package: 'cocos-codex-bridge', message: 'run-template', args: ['menu', true] }, { timeout: 1000 });
  assert.equal(plan.result.result.steps[0].result.dryRun, true, 'MCP invoking the panel method must not queue a request behind itself');
  await assert.rejects(client.call('editor.request', { package: 'cocos-codex-bridge', message: 'prefab-action', args: ['editor.script', {}] }), /Unsupported/);
  await assert.rejects(client.call('editor.request', { package: 'cocos-codex-bridge', message: 'workflow-action', args: ['editor.script', {}] }), /Unsupported/);
});
