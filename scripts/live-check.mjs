import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const project = path.join(root, 'test-project');
const artifacts = path.join(root, 'artifacts');
await fs.mkdir(artifacts, { recursive: true });
const client = new Client({ name: 'cocos-live-check', version: '0.1.0' });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'src/server.mjs'), '--project', project, '--tools', 'legacy'], stderr: 'pipe' });
const checks = [];
async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 90_000 });
  if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
  if (name === 'editor_screenshot') return result;
  return JSON.parse(result.content[0].text).result;
}
function pass(name) { checks.push(name); console.log(`PASS ${name}`); }
let created;
let node;
let assetCreated = false;
let passed = false;
const assetURL = 'db://assets/McpSmokeCheck.txt';
const scene = 'db://assets/scene/main.scene';
try {
  await client.connect(transport);
  assert.equal((await call('editor_status')).editorVersion, '3.8.8');
  pass('MCP stdio → real Creator 3.8.8 bridge');
  const ready = await call('editor_request', { package: 'asset-db', message: 'query-ready' });
  assert.equal(ready, true, 'Wait for initial AssetDB import before running live checks.');
  await call('scene_open', { asset: scene });
  const tree = await call('scene_tree');
  assert.ok(tree?.uuid);
  pass('open scene and inspect hierarchy');
  const metadata = await call('editor_messages', { package: 'scene', filter: 'create-node' });
  assert.equal(metadata.messages[0].message, 'create-node');
  const api = await call('editor_api', { source: 'types', package: 'scene', search: 'CreateNodeOptions' });
  assert.ok(api.lines.length);
  pass('discover real messages and installed API declarations');
  const name = `MCP_Verified_${Date.now()}`;
  created = await call('node_create', { name });
  node = await call('node_inspect', { uuid: created });
  assert.equal(node.name.value, name);
  await call('property_set', { uuid: created, path: 'name', dump: { ...node.name, value: `${name}_Edited` } });
  assert.equal((await call('node_inspect', { uuid: created })).name.value, `${name}_Edited`);
  pass('create node, edit property and read back');
  await call('editor_request', { package: 'scene', message: 'undo' });
  assert.equal((await call('node_inspect', { uuid: created })).name.value, name);
  await call('editor_request', { package: 'scene', message: 'redo' });
  assert.equal((await call('node_inspect', { uuid: created })).name.value, `${name}_Edited`);
  pass('undo and redo property edit');
  const withComponent = await call('component_add', { uuid: created, component: 'cc.UITransform' });
  const component = withComponent.__comps__.find(c => c.type === 'cc.UITransform');
  assert.ok(component);
  const componentId = component.value.uuid.value;
  await call('property_set', { uuid: componentId, path: 'contentSize', dump: { ...component.value.contentSize, value: { width: 320, height: 180 } } });
  assert.equal((await call('node_inspect', { uuid: componentId, kind: 'component' })).value.contentSize.value.width, 320);
  await call('editor_request', { package: 'scene', message: 'undo' });
  assert.equal((await call('node_inspect', { uuid: componentId, kind: 'component' })).value.contentSize.value.width, 100);
  await call('editor_request', { package: 'scene', message: 'redo' });
  assert.equal((await call('node_inspect', { uuid: componentId, kind: 'component' })).value.contentSize.value.width, 320);
  pass('component property edit, undo and redo');
  await call('editor_selection', { uuids: [created] });
  assert.ok((await call('editor_selection')).uuids.includes(created));
  pass('add component and select node');
  const copies = await call('node_duplicate', { uuids: [created] });
  assert.ok(copies.length);
  await call('node_reparent', { uuids: copies, parent: created });
  assert.equal((await call('node_inspect', { uuid: copies[0] })).parent.value.uuid, created);
  await call('node_remove', { uuids: copies });
  pass('duplicate, reparent and delete nodes');
  const sceneResult = await call('editor_script', { context: 'scene', code: 'return {name:cc.director.getScene().name, children:cc.director.getScene().children.map(n=>n.name)};' });
  assert.ok(sceneResult.children.includes(`${name}_Edited`));
  pass('scene process engine access');
  await call('asset_write', { url: assetURL, content: 'MCP live check', mode: 'create' });
  assetCreated = true;
  assert.equal((await call('project_read', { path: 'assets/McpSmokeCheck.txt' })).content, 'MCP live check');
  assert.ok((await call('asset_query', { pattern: assetURL })).assets.length);
  await call('asset_write', { url: assetURL, content: 'MCP live check updated', mode: 'save' });
  assert.equal((await call('project_read', { path: 'assets/McpSmokeCheck.txt' })).content, 'MCP live check updated');
  pass('AssetDB create/query/save and project read');
  await call('scene_save');
  const saved = JSON.parse(await fs.readFile(path.join(project, 'assets/scene/main.scene'), 'utf8'));
  assert.ok(saved.some(object => object._name === `${name}_Edited`));
  pass('save scene persisted to disk');
  await call('editor_script', { context: 'main', code: 'console.warn("MCP_LOG_VERIFICATION"); return {project:Editor.Project.path};' });
  assert.ok((await call('editor_logs', { filter: 'MCP_LOG_VERIFICATION' })).logs.length);
  pass('read actual editor console logs');
  const windows = await call('editor_windows');
  const window = windows.find(w => w.url.includes('/windows/main.html'));
  assert.ok(window);
  await call('editor_window', { windowId: window.id, action: 'focus' });
  const screenshot = await call('editor_screenshot', { windowId: window.id, maxWidth: 1440 });
  const png = Buffer.from(screenshot.content.find(c => c.type === 'image').data, 'base64');
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  await fs.writeFile(path.join(artifacts, 'creator-editor.png'), png);
  pass('editor window enumeration and PNG screenshot');
  assert.ok(Array.isArray(await call('editor_menu')));
  const preview = await call('editor_request', { package: 'preview', message: 'query-preview-url' });
  assert.match(preview, /^http/);
  pass('application menu discovery and preview URL');
  await call('editor_panel', { name: 'console' });
  await call('component_remove', { uuid: componentId });
  assert.ok(!(await call('node_inspect', { uuid: created })).__comps__.some(c => c.value.uuid.value === componentId));
  pass('open panel and remove component');
  passed = true;
} finally {
  if (created) {
    try { await call('node_remove', { uuids: [created] }); await call('scene_save'); }
    catch (error) { passed = false; process.exitCode = 1; console.error('Node cleanup:', error.message); }
  }
  if (assetCreated) {
    try { await call('editor_request', { package: 'asset-db', message: 'delete-asset', args: [assetURL] }); }
    catch (error) { passed = false; process.exitCode = 1; console.error('Asset cleanup:', error.message); }
  }
  await fs.writeFile(path.join(artifacts, 'live-check.json'), JSON.stringify({ passed, time: new Date().toISOString(), editorVersion: '3.8.8', project, checks }, null, 2));
  await client.close();
}
