import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BridgeClient } from '../src/client.mjs';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = process.argv.indexOf('--project'), project = path.resolve(arg < 0 ? path.join(root, 'test-project') : process.argv[arg + 1]);
const client = new BridgeClient(project);
const call = async (op, params = {}) => (await client.call(op, params)).result;
const base = 'Canvas/InteractiveDemo', node = `${base}/Status`, button = `${base}/PlayButton`;
const checks = []; let baseline, passed = false;
const pass = message => { checks.push(message); console.log(`PASS ${message}`); };
const label = () => call('component.properties', { node, component: 'cc.Label', names: ['string', 'fontSize'] });
const events = () => call('component.properties', { node: button, component: 'cc.Button', names: ['clickEvents'] });
const undo = () => call('editor.request', { package: 'scene', message: 'undo' });
try {
  assert.equal((await call('status')).editorVersion, '3.8.8');
  assert.equal((await call('scene.tree')).name, 'MCP_InteractiveDemo');
  assert.equal(await call('editor.request', { package: 'scene', message: 'query-dirty' }), false, 'Save scene before checking undo.');
  baseline = await label();
  const patch = { string: 'MCP undo regression', fontSize: baseline.properties.fontSize.value + 1 };
  await call('component.patch', { node, component: 'cc.Label', properties: patch, dryRun: true });
  assert.deepEqual(await label(), baseline);
  await assert.rejects(call('component.patch', { node, component: 'cc.Label', properties: { string: 'Must not apply', fontSize: 'bad' } }), /finite number/);
  assert.deepEqual(await label(), baseline);
  pass('dry-run and invalid later field leave all original properties unchanged');
  await call('component.patch', { node, component: 'cc.Label', properties: patch });
  await undo(); assert.deepEqual(await label(), baseline);
  await call('editor.request', { package: 'scene', message: 'redo' });
  assert.equal((await label()).properties.string.value, patch.string);
  assert.equal((await label()).properties.fontSize.value, patch.fontSize);
  await undo(); assert.deepEqual(await label(), baseline);
  pass('two-property native edit undoes/redoes as one group');
  const before = await events();
  await assert.rejects(call('button.events', { node: button, mode: 'replace', events: [{ target: base, component: 'McpInteractiveDemo', handler: 'methodDoesNotExist' }] }), /Expected one/);
  assert.deepEqual(await events(), before);
  await assert.rejects(call('component.patch', { node: button, component: 'cc.Button', properties: { clickEvents: [] } }), /Use button.events/);
  pass('invalid handler and generic event patch are rejected before modifying bindings');
  await call('button.events', { node: button, mode: 'remove', index: 0 });
  assert.equal((await events()).properties.clickEvents.value.length, 0);
  await undo(); assert.deepEqual(await events(), before);
  await call('button.events', { node: button, mode: 'clear' });
  assert.equal((await events()).properties.clickEvents.value.length, 0);
  await undo(); assert.deepEqual(await events(), before);
  pass('event removal/clear and native undo preserve original serialized handlers');
  await assert.rejects(call('script.attach', { node: base, className: 'McpDefinitelyMissingClass', asset: 'db://assets/McpInteractiveDemo.ts', timeoutMs: 0 }), /did not register/);
  await assert.rejects(call('script.attach', { node: base, className: 'cc.Button', asset: 'db://assets/McpInteractiveDemo.ts', timeoutMs: 0 }), /another script/);
  pass('missing or wrong-source script never attaches a component');
  await call('scene.save'); passed = true;
} finally {
  // Do not silently save a partial failure. Recover only this test's two fields.
  if (!passed && baseline) {
    try { await call('component.patch', { node, component: 'cc.Label', properties: { string: baseline.properties.string.value, fontSize: baseline.properties.fontSize.value } }); }
    catch (error) { console.error('Recovery failed:', error.message); }
  }
  await fs.writeFile(path.join(root, 'artifacts', 'live-development-check.json'), JSON.stringify({ passed, time: new Date().toISOString(), project, checks }, null, 2));
  if (!passed) process.exitCode = 1;
}
