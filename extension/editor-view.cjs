'use strict';

const fs = require('fs');
const path = require('path');
const { resolveNode } = require('./development-model.cjs');

const VIEW_QUERIES = {
  tool: ['scene', 'query-gizmo-tool-name'],
  pivot: ['scene', 'query-gizmo-pivot'],
  coordinate: ['scene', 'query-gizmo-coordinate'],
  gizmoMode: ['scene', 'query-gizmo-view-mode'],
  is2D: ['scene', 'query-is2D'],
  grid: ['scene', 'query-is-grid-visible'],
  icon3D: ['scene', 'query-is-icon-gizmo-3d'],
  iconSize: ['scene', 'query-icon-gizmo-size'],
};

const SETTERS = {
  tool: ['scene', 'change-gizmo-tool'],
  pivot: ['scene', 'change-gizmo-pivot'],
  coordinate: ['scene', 'change-gizmo-coordinate'],
  is2D: ['scene', 'change-is2D'],
  grid: ['scene', 'set-grid-visible'],
  icon3D: ['scene', 'set-icon-gizmo-3d'],
  iconSize: ['scene', 'set-icon-gizmo-size'],
};

function createEditorView({ request }) {
  const message = (pkg, name, ...args) => request(pkg, name, ...args);

  async function inspect() {
    const entries = Object.entries(VIEW_QUERIES);
    const values = await Promise.all(entries.map(async ([key, [pkg, name]]) => [key, await message(pkg, name)]));
    const state = Object.fromEntries(values);
    return {
      ...state,
      viewMode: state.is2D ? '2D' : '3D',
      scope: 'Creator scene editor view state; these settings affect the editor viewport, not serialized game content.',
    };
  }

  async function setState(p) {
    const before = await inspect();
    const changes = [];
    for (const key of Object.keys(SETTERS)) if (p[key] !== undefined && p[key] !== before[key]) changes.push([key, p[key]]);
    if (!changes.length) return { changed: [], state: before, verified: 'native query readback' };
    const applied = [];
    try {
      for (const [key, value] of changes) {
        const [pkg, name] = SETTERS[key];
        await message(pkg, name, value);
        applied.push(key);
      }
      const after = await inspect();
      const mismatches = changes.filter(([key, expected]) => after[key] !== expected).map(([key, expected]) => ({ key, expected, actual: after[key] }));
      if (mismatches.length) throw new Error(`Scene view readback mismatch: ${JSON.stringify(mismatches)}`);
      return { changed: changes.map(([key]) => key), state: after, verified: 'native query readback', saved: false };
    } catch (error) {
      const recovery = [];
      for (const key of applied.reverse()) {
        try { const [pkg, name] = SETTERS[key]; await message(pkg, name, before[key]); }
        catch (failure) { recovery.push(`${key}: ${failure.message}`); }
      }
      throw new Error(`${error.message}. View recovery: ${recovery.length ? `INCOMPLETE ${recovery.join('; ')}` : 'previous values restored'}.`);
    }
  }

  async function dispatch(action, p = {}) {
    if (action === 'scene.view') {
      if (p.action === 'inspect') return inspect();
      if (p.action === 'configure') return setState(p);
      if (p.action === 'focus') {
        const hierarchy = await message('scene', 'query-node-tree');
        const nodes = (p.nodes || []).map(target => resolveNode(hierarchy, target));
        const uuids = nodes.map(node => node.uuid);
        await message('scene', 'focus-camera', uuids);
        return { action: 'focus', focusedNodes: uuids, state: await inspect(), verified: 'native scene view query' };
      }
      if (p.action === 'align-camera') { await message('scene', 'align-with-view'); return { action: p.action, state: await inspect(), verified: 'native scene view query' }; }
      if (p.action === 'align-node') { await message('scene', 'align-view-with-node'); return { action: p.action, state: await inspect(), verified: 'native scene view query' }; }
      if (p.action === 'reset') return setState({ tool: 'position', pivot: 'pivot', coordinate: 'local', is2D: false, grid: true, icon3D: true, iconSize: 60 });
      throw new Error(`Unknown scene.view action: ${p.action}`);
    }
    if (action === 'reference.image') return referenceImage(message, p);
    throw new Error(`Unknown editor view operation: ${action}`);
  }

  return { dispatch };
}

function validateImage(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) throw new Error('Reference image paths must be absolute local paths.');
  const extension = path.extname(file).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(extension)) throw new Error('Reference image must be PNG, JPG, JPEG, GIF or WebP.');
  let stat;
  try { stat = fs.statSync(file); } catch { throw new Error(`Reference image does not exist: ${file}`); }
  if (!stat.isFile()) throw new Error(`Reference image is not a file: ${file}`);
  if (stat.size > 32 * 1024 * 1024) throw new Error('Reference image exceeds the 32 MiB safety limit.');
  return file;
}

async function referenceImage(message, p) {
  const current = async () => ({ config: await message('reference-image', 'query-config'), current: await message('reference-image', 'query-current') });
  if (p.action === 'inspect') return { ...await current(), scope: 'Creator reference-image editor state; source files remain external to the project.' };
  if (p.action === 'add') {
    const paths = p.paths.map(validateImage);
    await message('reference-image', 'add-image', paths);
    return { added: paths, ...(await current()), verified: 'native reference-image query' };
  }
  if (p.action === 'remove') {
    const paths = p.paths?.map(validateImage);
    await message('reference-image', 'remove-image', paths);
    return { removed: paths || 'current', ...(await current()), verified: 'native reference-image query' };
  }
  if (p.action === 'switch') {
    const image = validateImage(p.path);
    await message('reference-image', 'switch-image', ...(p.scene ? [image, p.scene] : [image]));
    return { switched: image, ...(await current()), verified: 'native reference-image query' };
  }
  if (p.action === 'configure') {
    const before = await current();
    const changes = Object.entries({ x: p.x, y: p.y, sx: p.sx, sy: p.sy, opacity: p.opacity }).filter(([, value]) => value !== undefined);
    if (!changes.length) return { changed: [], ...(await current()), verified: 'native reference-image query' };
    const applied = [];
    try {
      for (const [key, value] of changes) { await message('reference-image', 'set-image-data', key, value); applied.push([key, value]); }
      const after = await current();
      const actual = after.current || {};
      const mismatches = changes.filter(([key, expected]) => Number(actual[key]) !== Number(expected)).map(([key, expected]) => ({ key, expected, actual: actual[key] }));
      if (mismatches.length) throw new Error(`Reference image readback mismatch: ${JSON.stringify(mismatches)}`);
      return { changed: changes.map(([key]) => key), ...after, verified: 'native reference-image query' };
    } catch (error) {
      const recovery = [];
      for (const [key] of applied.reverse()) {
        try { await message('reference-image', 'set-image-data', key, before.current[key]); }
        catch (failure) { recovery.push(`${key}: ${failure.message}`); }
      }
      throw new Error(`${error.message}. Reference image recovery: ${recovery.length ? `INCOMPLETE ${recovery.join('; ')}` : 'previous values restored'}.`);
    }
  }
  if (p.action === 'refresh') { await message('reference-image', 'refresh'); return { refreshed: true, ...(await current()), verified: 'native reference-image query' }; }
  if (p.action === 'clear') { await message('reference-image', 'remove-image'); return { cleared: true, ...(await current()), verified: 'native reference-image query' }; }
  throw new Error(`Unknown reference.image action: ${p.action}`);
}

module.exports = { createEditorView, validateImage };
