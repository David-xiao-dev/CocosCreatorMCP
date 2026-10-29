import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createEditorView, validateImage } = require('../extension/editor-view.cjs');

function fixture() {
  const state = { tool: 'position', pivot: 'pivot', coordinate: 'local', gizmoMode: 'select', is2D: true, grid: true, icon3D: false, iconSize: 2 };
  const images = { config: { images: [], sceneUUID: {}, scene: 'scene' }, current: { path: '', x: 0, y: 0, sx: 1, sy: 1, opacity: 50 } };
  const calls = [];
  const request = async (pkg, message, ...args) => {
    calls.push([pkg, message, args]);
    if (pkg === 'scene' && message === 'query-node-tree') return { uuid: 'scene', name: 'Scene', children: [{ uuid: 'node', name: 'Panel', children: [] }] };
    if (pkg === 'scene' && message.startsWith('query-')) return message === 'query-gizmo-tool-name' ? state.tool : message === 'query-gizmo-pivot' ? state.pivot : message === 'query-gizmo-coordinate' ? state.coordinate : message === 'query-gizmo-view-mode' ? state.gizmoMode : message === 'query-is2D' ? state.is2D : message === 'query-is-grid-visible' ? state.grid : message === 'query-is-icon-gizmo-3d' ? state.icon3D : state.iconSize;
    if (pkg === 'scene' && message === 'focus-camera') return { focused: args[0] };
    if (pkg === 'scene' && message === 'align-with-view') return true;
    if (pkg === 'scene' && message === 'align-view-with-node') return true;
    if (pkg === 'scene' && message.startsWith('change-')) { state[message === 'change-gizmo-tool' ? 'tool' : message === 'change-gizmo-pivot' ? 'pivot' : message === 'change-gizmo-coordinate' ? 'coordinate' : 'is2D'] = args[0]; return true; }
    if (pkg === 'scene' && message === 'set-grid-visible') { state.grid = args[0]; return true; }
    if (pkg === 'scene' && message === 'set-icon-gizmo-3d') { state.icon3D = args[0]; return true; }
    if (pkg === 'scene' && message === 'set-icon-gizmo-size') { state.iconSize = args[0]; return true; }
    if (pkg === 'reference-image' && message === 'query-config') return images.config;
    if (pkg === 'reference-image' && message === 'query-current') return images.current;
    if (pkg === 'reference-image' && message === 'add-image') { images.current.path = args[0][0]; images.config.images = args[0].map(path => ({ path })); return true; }
    if (pkg === 'reference-image' && message === 'set-image-data') { images.current[args[0]] = args[1]; return true; }
    if (pkg === 'reference-image') return true;
    throw new Error(`Unexpected ${pkg}:${message}`);
  };
  return { view: createEditorView({ request }), state, images, calls };
}

test('scene.view batches viewport state changes, resolves project nodes and reads native state', async () => {
  const { view, state, calls } = fixture();
  const before = await view.dispatch('scene.view', { action: 'inspect' });
  assert.equal(before.viewMode, '2D');
  const configured = await view.dispatch('scene.view', { action: 'configure', tool: 'rotation', pivot: 'center', coordinate: 'global', is2D: false, grid: false, icon3D: true, iconSize: 40 });
  assert.deepEqual(configured.changed, ['tool', 'pivot', 'coordinate', 'is2D', 'grid', 'icon3D', 'iconSize']);
  assert.equal(configured.state.viewMode, '3D');
  const focused = await view.dispatch('scene.view', { action: 'focus', nodes: ['Panel'] });
  assert.deepEqual(focused.focusedNodes, ['node']);
  assert.ok(calls.some(([, message]) => message === 'focus-camera'));
  assert.equal(state.iconSize, 40);
});

test('scene.view reset restores defaults and reference.image validates, configures and reads back external images', async () => {
  const { view, state, images } = fixture();
  await view.dispatch('scene.view', { action: 'configure', tool: 'rotation', is2D: false, iconSize: 40 });
  const reset = await view.dispatch('scene.view', { action: 'reset' });
  assert.equal(reset.state.tool, 'position'); assert.equal(reset.state.is2D, false); assert.equal(state.iconSize, 60);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cocos-reference-')), file = path.join(dir, 'design.png');
  await fs.writeFile(file, Buffer.from([137, 80, 78, 71]));
  assert.equal(validateImage(file), file);
  const added = await view.dispatch('reference.image', { action: 'add', paths: [file] });
  assert.equal(added.current.path, file);
  const changed = await view.dispatch('reference.image', { action: 'configure', x: 10, y: -20, sx: 2, sy: 2, opacity: 35 });
  assert.deepEqual(changed.changed, ['x', 'y', 'sx', 'sy', 'opacity']); assert.equal(changed.current.opacity, 35);
  const cleared = await view.dispatch('reference.image', { action: 'clear' });
  assert.equal(cleared.cleared, true);
  await fs.rm(dir, { recursive: true, force: true });
  assert.throws(() => validateImage(path.join(dir, 'missing.png')), /does not exist/);
  assert.equal(images.current.opacity, 35);
});
