import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { BridgeClient } from '../src/client.mjs';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const client = new BridgeClient(path.join(root, 'test-project'));
const call = async (action, params = {}) => (await client.call(action, params)).result;
const checks = []; const pass = value => { checks.push(value); console.log('PASS ' + value); }; let passed = false;
try {
  const status = await call('status'); assert.equal(status.editorVersion, '3.8.8');
  assert.equal(await call('editor.request', { package: 'scene', message: 'query-dirty', args: [] }), false);
  const before = await call('scene.view', { action: 'inspect' });
  const configured = await call('scene.view', { action: 'configure', tool: 'rotation', pivot: 'center', coordinate: 'global', is2D: true, grid: false, icon3D: false, iconSize: 30 });
  assert.deepEqual(configured.changed.slice().sort(), ['tool', 'pivot', 'coordinate', 'is2D', 'grid', 'icon3D', 'iconSize'].filter(key => before[key] !== configured.state[key]).sort());
  assert.equal((await call('scene.view', { action: 'inspect' })).tool, 'rotation');
  const rootNode = await call('node.resolve', { target: 'Canvas/TypographyDemo' });
  const focused = await call('scene.view', { action: 'focus', nodes: [rootNode.uuid] });
  assert.deepEqual(focused.focusedNodes, [rootNode.uuid]);
  pass('scene viewport configure/readback/focus works on project node');
  const image = path.join(root, 'artifacts', 'typography-runtime.png');
  const added = await call('reference.image', { action: 'add', paths: [image] });
  assert.equal(added.current.path, image);
  const transformed = await call('reference.image', { action: 'configure', x: 15, y: -10, sx: 0.5, sy: 0.5, opacity: 35 });
  assert.equal(transformed.current.opacity, 35); assert.equal(transformed.current.sx, 0.5);
  const inspected = await call('reference.image', { action: 'inspect' });
  assert.equal(inspected.current.path, image); assert.equal(inspected.config.images[0].missing, false);
  await call('reference.image', { action: 'clear' });
  assert.equal((await call('reference.image', { action: 'inspect' })).config.images.length, 0);
  pass('external reference image add/transform/inspect/clear reads native state');
  await call('scene.view', { action: 'configure', tool: before.tool, pivot: before.pivot, coordinate: before.coordinate, is2D: before.is2D, grid: before.grid, icon3D: before.icon3D, iconSize: before.iconSize });
  await call('scene.save');
  passed = true;
} finally {
  await fs.writeFile(path.join(root, 'artifacts', 'live-scene-view-check.json'), JSON.stringify({ passed, time: new Date().toISOString(), checks }, null, 2));
  if (!passed) process.exitCode = 1;
}
