import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const client = new Client({ name: 'cocos-v2-live', version: '0.2.0' });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'src/server.mjs'), '--project', path.join(root, 'test-project')], stderr: 'pipe' });
const checks = [];
const cleanup = new Set();
let passed = false;
async function call(name, args = {}) {
  const output = await client.callTool({ name, arguments: args }, undefined, { timeout: 90_000 });
  if (output.isError) throw new Error(JSON.stringify(output));
  return JSON.parse(output.content[0].text);
}
const observe = async (op, params = {}, detail = 'full') => (await call('cocos_observe', { op, params, detail })).result;
const run = async steps => (await call('cocos_execute', { steps })).result;
function pass(name) { checks.push(name); console.log(`PASS ${name}`); }
try {
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 4);
  assert.equal((await call('cocos_status')).result.editorVersion, '3.8.8');
  pass('compact SDK connection and four-tool catalog');
  await run([{ id: 'open', op: 'scene.open', params: { asset: 'db://assets/scene/main.scene' } }]);
  const baseline = await observe('scene.snapshot');
  const dry = await run([{ id: 'plan', op: 'ui.build', params: { template: 'menu', dryRun: true } }]);
  assert.equal(dry.steps[0].result.dryRun, true);
  assert.equal((await observe('scene.diff', { snapshotId: baseline.snapshotId })).total, 0);
  pass('UI dry-run checks Canvas/classes without editing');
  for (const template of ['menu', 'dialog', 'hud']) {
    const built = await run([{ id: 'build', op: 'ui.build', params: { template } }, { id: 'inspect', op: 'node.inspect', params: { uuid: { $ref: 'build#/root' } }, fields: ['/name/value'] }]);
    const tree = built.steps[0].result;
    cleanup.add(tree.root);
    assert.equal(tree.ok, true);
    assert.ok(tree.nodes.length >= 4);
    const diff = await observe('scene.diff', { snapshotId: baseline.snapshotId });
    assert.ok(diff.changes.some(item => item.kind === 'added' && item.node.uuid === tree.root));
    await run([{ id: 'remove', op: 'node.remove', params: { uuids: [tree.root] } }]);
    cleanup.delete(tree.root);
    pass(`native UI template ${template}, result refs, inspector readback and snapshot diff`);
  }
  const beforeFailure = await observe('scene.snapshot');
  const failedUI = await client.callTool({ name: 'cocos_execute', arguments: { steps: [{ id: 'badui', op: 'ui.build', params: { tree: { name: 'MCP_BadUI', components: [{ type: 'cc.Label', properties: { nonexistentProperty: true } }] } } }] } });
  assert.equal(failedUI.isError, true);
  assert.match(failedUI.content[0].text, /created subtree removed/);
  assert.equal((await observe('scene.diff', { snapshotId: beforeFailure.snapshotId })).total, 0);
  pass('UI failure reports error and removes only its newly created subtree');
  const failed = await client.callTool({ name: 'cocos_execute', arguments: { steps: [
    { id: 'new', op: 'node.create', params: { name: 'MCP_StopTest' } },
    { id: 'bad', op: 'node.inspect', params: { uuid: 'MCP-missing-node' } },
    { id: 'skipped', op: 'node.create', params: { name: 'MCP_SHOULD_NOT_EXIST' } },
  ] } });
  assert.equal(failed.isError, true);
  const partial = JSON.parse(failed.content[0].text).result;
  const id = partial.steps[0].result; cleanup.add(id);
  assert.equal(partial.failed.id, 'bad'); assert.deepEqual(partial.skipped, ['skipped']);
  await run([{ id: 'remove', op: 'node.remove', params: { uuids: [id] } }]); cleanup.delete(id);
  pass('partial failure keeps completed results and skips later edits');
  const validation = await observe('scene.validate'); assert.equal(validation.rules.length, 2);
  assert.ok((await observe('knowledge.query', { query: 'UI' })).results.length);
  pass('bounded structural validation and searchable knowledge');
  await run([{ id: 'panel', op: 'editor.panel', params: { name: 'cocos-codex-bridge' } }]);
  pass('Creator control panel opens through native panel API');
  passed = true;
} finally {
  for (const id of cleanup) {
    try { await run([{ id: 'cleanup', op: 'node.remove', params: { uuids: [id] } }]); }
    catch (error) { passed = false; console.error(error.message); }
  }
  try { await run([{ id: 'save', op: 'scene.save' }]); } catch (error) { passed = false; console.error(error.message); }
  await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
  await fs.writeFile(path.join(root, 'artifacts/live-v2-check.json'), JSON.stringify({ passed, version: '0.2.0', editorVersion: '3.8.8', time: new Date().toISOString(), checks }, null, 2));
  await client.close();
  if (!passed) process.exitCode = 1;
}
