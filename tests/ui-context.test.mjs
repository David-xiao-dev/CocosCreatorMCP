import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../extension/scene.js', import.meta.url));
function context(real = true, second = false) {
  const cc = { Canvas: 'canvas', UITransform: 'ui', Label: 'label', Component: 'component', js: { getClassByName: () => ({}), getClassName: c => c.type } };
  const node = (uuid, comps = {}) => ({ uuid, name: uuid, active: true, activeInHierarchy: true, layer: 0, position: { x: 0, y: 0, z: 0 }, eulerAngles: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, children: [], getComponent: key => comps[key] || null, getComponents: () => [] });
  const root = node('scene');
  const helper = node('editor');
  const helperCanvas = node('helper', { canvas: { enabled: true } });
  const canvas = node('project', { canvas: { enabled: true } });
  const child = node('project-child'); child.parent = canvas; canvas.children.push(child);
  helperCanvas.parent = helper; helper.children.push(helperCanvas); helper.parent = root;
  root.children.push(helper);
  const hierarchy = { uuid: root.uuid, children: [] };
  if (real) { canvas.parent = root; root.children.push(canvas); hierarchy.children.push({ uuid: canvas.uuid, children: [{ uuid: child.uuid }] }); }
  if (second) { const another = node('second', { canvas: { enabled: true } }); another.parent = root; root.children.push(another); hierarchy.children.push({ uuid: another.uuid }); }
  cc.director = { getScene: () => root };
  const sandbox = { exports: {}, module: { paths: [] }, Editor: { App: { path: '/creator' } }, require: name => name === 'cc' ? cc : require(name) };
  vm.runInNewContext(fs.readFileSync(new URL('../extension/scene.js', import.meta.url), 'utf8'), sandbox);
  return { methods: sandbox.exports.methods, hierarchy };
}
test('Canvas lookup and snapshots use project hierarchy, never editor helper nodes', () => {
  const { methods, hierarchy } = context();
  assert.equal(methods.uiContext([], hierarchy).canvas, 'project');
  assert.deepEqual(Array.from(methods.snapshot(hierarchy).nodes, n => n.uuid), ['scene', 'project', 'project-child']);
  assert.throws(() => methods.uiContext([], hierarchy, 'helper'), /not in the editable project hierarchy/);
  assert.equal(methods.uiContext([], hierarchy, 'project-child').parentCanvas.uuid, 'project');
});
test('empty scene cannot reuse editor Canvas, multiple active project Canvases need an explicit parent', () => {
  const empty = context(false);
  assert.equal(empty.methods.uiContext([], empty.hierarchy).canvas, undefined);
  assert.equal(empty.methods.uiContext([], empty.hierarchy).canvases.length, 0);
  const multiple = context(true, true);
  assert.equal(multiple.methods.uiContext([], multiple.hierarchy).canvas, undefined);
  assert.equal(multiple.methods.uiContext([], multiple.hierarchy, 'project-child').canvas, 'project');
});
