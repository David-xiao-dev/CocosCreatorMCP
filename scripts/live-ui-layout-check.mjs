import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BridgeClient } from '../src/client.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const client = new BridgeClient(path.join(root, 'test-project'));
const call = async (action, params = {}) => (await client.call(action, params)).result;
const checks = [];
const pass = value => { checks.push(value); console.log(`PASS ${value}`); };
let rootNode;
let passed = false;
try {
  const status = await call('status');
  assert.equal(status.editorVersion, '3.8.8');
  assert.equal(await call('editor.request', { package: 'scene', message: 'query-dirty', args: [] }), false);
  const parent = await call('node.resolve', { target: 'Canvas/TypographyDemo' });
  rootNode = await call('node.create', { name: 'MCP_LayoutLive', parent: parent.uuid });
  await call('component.add', { uuid: rootNode, component: 'cc.UITransform' });
  const content = await call('node.create', { name: 'Content', parent: rootNode });
  await call('component.add', { uuid: content, component: 'cc.UITransform' });
  const target = (await call('node.resolve', { target: rootNode })).path;
  const contentPath = `${target}/Content`;

  const widget = await call('ui.layout', { action: 'ensure', node: rootNode, component: 'widget', properties: { alignTop: true, top: 12, alignMode: 'ALWAYS' } });
  assert.equal(widget.properties.isAlignTop, true);
  assert.equal(widget.properties.top, 12);
  assert.equal(widget.properties.alignMode, 1);
  const layout = await call('ui.layout', { action: 'ensure', node: rootNode, component: 'layout', properties: { type: 'VERTICAL', resizeMode: 'CHILDREN', spacingY: 10, paddingLeft: 8 } });
  assert.equal(layout.properties.type, 2);
  assert.equal(layout.properties.resizeMode, 2);
  const scroll = await call('ui.layout', { action: 'ensure', node: rootNode, component: 'scrollView', properties: { content: contentPath, horizontal: false, vertical: true } });
  assert.equal(scroll.properties.content.uuid, content);
  assert.equal(scroll.properties.horizontal, false);
  await call('ui.layout', { action: 'ensure', node: rootNode, component: 'mask', properties: { type: 'GRAPHICS_RECT' } });
  await call('ui.layout', { action: 'ensure', node: rootNode, component: 'safeArea', properties: { symmetric: true } });
  await call('ui.layout', { action: 'ensure', node: rootNode, component: 'blockInputEvents' });
  const inspected = await call('ui.layout', { action: 'inspect', node: rootNode, component: 'scrollView' });
  assert.equal(inspected.present, true);
  assert.equal(inspected.properties.content.uuid, content);
  pass('Widget/Layout/ScrollView semantic configuration converts enums and resolves content references');

  const dry = await call('ui.layout', { action: 'configure', node: rootNode, component: 'layout', properties: { type: 'GRID', constraint: 'FIXED_COL', constraintNum: 3 }, dryRun: true });
  assert.equal(dry.dryRun, true);
  assert.equal((await call('ui.layout', { action: 'inspect', node: rootNode, component: 'layout' })).properties.type, 2);
  pass('dryRun validates layout changes without modifying the native component');

  await call('node.remove', { uuids: [rootNode] });
  await call('scene.save');
  passed = true;
} finally {
  if (rootNode) {
    try {
      const tree = await call('scene.tree');
      const exists = JSON.stringify(tree).includes(rootNode);
      if (exists) { await call('node.remove', { uuids: [rootNode] }); await call('scene.save'); }
    } catch { passed = false; }
  }
  if (!passed) process.exitCode = 1;
}
