import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { BridgeClient } from '../src/client.mjs';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const project = path.join(root, 'test-project');
const client = new BridgeClient(project);
const call = async (op, p = {}) => (await client.call(op, p)).result;
const request = (message, args = []) => call('editor.request', { package: 'scene', message, args });
const editor = (message, args = []) => call('editor.request', { package: 'cocos-codex-bridge', message, args });
const checks = [];
const pass = name => { checks.push(name); console.log(`PASS ${name}`); };
const url = `db://assets/MCP_UI_Regression_${randomUUID()}.scene`;
let original, assetCreated = false, passed = false;
function ids(tree) { return [tree.uuid, ...(tree.children || []).flatMap(ids)]; }
// Preserve only objects reachable from an empty scene; avoid loading copies of
// the user's game nodes or reusing the source scene's identity in the test.
function emptyScene(source) {
  const data = JSON.parse(source);
  const sceneIndex = data[0].scene.__id__;
  data[sceneIndex]._children = []; data[sceneIndex]._components = []; data[sceneIndex]._id = randomUUID();
  data[0]._name = 'MCP_UI_Regression'; data[sceneIndex]._name = 'MCP_UI_Regression';
  const mapping = new Map(); const output = [];
  function object(index) {
    if (mapping.has(index)) return mapping.get(index);
    const target = output.length; mapping.set(index, target); output.push(null);
    output[target] = value(data[index]); return target;
  }
  function value(v) {
    if (Array.isArray(v)) return v.map(value);
    if (v && typeof v === 'object') {
      if (Object.hasOwn(v, '__id__')) return { __id__: object(v.__id__) };
      return Object.fromEntries(Object.entries(v).map(([k, v]) => [k, value(v)]));
    }
    return v;
  }
  object(0); return JSON.stringify(output, null, 2);
}
try {
  const status = await call('status'); assert.equal(status.editorVersion, '3.8.8');
  if (await request('query-dirty')) throw new Error('Save the current test-project scene before this check; it will not save unrelated edits.');
  original = (await call('scene.tree')).uuid;
  const info = await call('editor.request', { package: 'asset-db', message: 'query-asset-info', args: [original] });
  const source = await fs.readFile(info.file, 'utf8');
  await call('asset.write', { url, content: emptyScene(source), mode: 'create' }); assetCreated = true;
  await call('scene.open', { asset: url });
  assert.equal(ids(await call('scene.tree')).length, 1);
  assert.equal((await call('scene.snapshot')).nodes, 1, 'editor helper nodes must not be included');
  const dry = await call('ui.build', { template: 'menu', dryRun: true });
  assert.equal(dry.createCanvas, true);
  assert.equal(ids(await call('scene.tree')).length, 1);
  await assert.rejects(call('ui.build', { template: 'menu', createCanvas: false }), /No project Canvas/);
  pass('empty project ignores editor helper Canvas; dry-run reports Canvas creation without edits');
  const helperId = await call('editor.script', { context: 'scene', code: 'let id; function visit(n){if(n.name==="Reference-Image-Canvas") id=n.uuid;for(const ch of n.children)visit(ch);}visit(cc.director.getScene());return id || null;' });
  if (helperId) {
    await assert.rejects(call('ui.build', { parent: helperId, template: 'menu' }), /not in the editable project hierarchy/);
    assert.equal(ids(await call('scene.tree')).length, 1);
    pass('explicit editor helper Canvas is rejected before edits');
  }
  // The panel's own entry point is exercised, including native selection/focus.
  const output = await editor('run-template', ['menu', false]);
  assert.equal(output.result.ok, true); assert.equal(output.located, true);
  const built = output.result.steps[0].result;
  assert.ok(built.createdCanvas);
  const nativeIds = new Set(ids(await call('scene.tree')));
  for (const node of built.nodes) assert.ok(nativeIds.has(node.uuid));
  const selection = await call('selection', {});
  assert.deepEqual(selection.uuids, [built.root]);
  assert.equal(await request('query-is2D'), true);
  pass('panel generation creates project Canvas and UI camera, selects only generated root and focuses 2D');
  await call('scene.save');
  const tempInfo = await call('editor.request', { package: 'asset-db', message: 'query-asset-info', args: [url] });
  const saved = JSON.parse(await fs.readFile(tempInfo.file, 'utf8'));
  for (const name of ['Canvas', 'Camera', 'MainMenu', 'Title', 'StartButton', 'Hint']) assert.ok(saved.some(n => n._name === name), `missing serialized ${name}`);
  await call('scene.open', { asset: original });
  await call('scene.open', { asset: url });
  const reopened = new Set(ids(await call('scene.tree')));
  for (const node of built.nodes) assert.ok(reopened.has(node.uuid), 'node must survive scene reopen');
  await editor('locate-ui', [built.root]);
  pass('generated UI and camera serialize to disk and survive closing/reopening the scene');
  const window = (await call('editor.windows')).find(w => w.url.includes('/windows/main.html'));
  const shot = await call('editor.screenshot', { windowId: window.id, maxWidth: 1600 });
  await fs.writeFile(path.join(root, 'artifacts/ui-regression-menu.png'), Buffer.from(shot.data, 'base64'));
  await call('node.remove', { uuids: [built.root] });
  for (const template of ['dialog', 'hud']) {
    const result = await editor('run-template', [template, false]);
    assert.equal(result.result.ok, true);
    const ui = result.result.steps[0].result;
    assert.equal(ui.createdCanvas, null, 'existing project Canvas must be reused');
    for (const node of ui.nodes) assert.ok(ids(await call('scene.tree')).includes(node.uuid));
    await call('scene.save');
    const disk = JSON.parse(await fs.readFile(tempInfo.file, 'utf8'));
    assert.ok(disk.some(n => n._id === ui.root));
    await call('node.remove', { uuids: [ui.root] });
    pass(`${template} uses the existing project Canvas and is persisted on save`);
  }
  passed = true;
} finally {
  try {
    if (assetCreated) {
      if (await request('query-dirty')) await call('scene.save');
      await call('scene.open', { asset: original });
      await call('editor.request', { package: 'asset-db', message: 'delete-asset', args: [url] });
    }
  } catch (error) { passed = false; console.error('Cleanup:', error.message); }
  await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
  await fs.writeFile(path.join(root, 'artifacts/live-ui-check.json'), JSON.stringify({ passed, editorVersion: '3.8.8', time: new Date().toISOString(), checks }, null, 2));
  if (!passed) process.exitCode = 1;
}
