import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { projectNodes } = createRequire(import.meta.url)('../extension/scene-model.cjs');
test('project traversal excludes editor reference Canvas, cameras and descendants even if child flags are zero', () => {
  const fakeCanvas = { uuid: 'helper-canvas', name: 'Reference-Image-Canvas', children: [{ uuid: 'old-ui', children: [] }] };
  const realCanvas = { uuid: 'game-canvas', name: 'Canvas', children: [{ uuid: 'title', children: [] }] };
  const root = { uuid: 'scene', children: [{ uuid: 'editor-foreground', children: [] }, { uuid: 'editor-background', children: [fakeCanvas] }, realCanvas] };
  const hierarchy = { uuid: 'scene', children: [{ uuid: 'game-canvas', children: [{ uuid: 'title' }] }] };
  assert.deepEqual(projectNodes(root, hierarchy).map(n => n.uuid), ['scene', 'game-canvas', 'title']);
  assert.deepEqual(projectNodes(root, { uuid: 'scene', children: [] }).map(n => n.uuid), ['scene']);
});
test('a scene switch or hierarchy race refuses a misleading snapshot', () => {
  assert.throws(() => projectNodes({ uuid: 'other', children: [] }, { uuid: 'scene', children: [] }), /Scene changed/);
  assert.throws(() => projectNodes({ uuid: 'scene', children: [] }, { uuid: 'scene', children: [{ uuid: 'not-loaded' }] }), /disagree/);
});
