'use strict';
const { randomUUID } = require('crypto');
const templates = require('./templates.cjs');
const knowledge = require('./knowledge.json');
const { validate } = require('./workflow.cjs');
const catalog = require('./operations.json');
function createFeatures({ request, dispatch }) {
  const snapshots = new Map();
  const scene = (method, args = []) => request('scene', 'execute-scene-script', { name: 'cocos-codex-bridge', method, args });
  const hierarchy = () => request('scene', 'query-node-tree');
  const snapshotScene = async () => scene('snapshot', [await hierarchy()]);
  async function set(uuid, property, value) {
    const node = await request('scene', 'query-node', uuid);
    const dump = node?.[property];
    if (!dump) throw new Error(`Node property not found: ${property}`);
    await dispatch('property.set', { uuid, path: property, dump: { ...dump, value } });
  }
  async function component(uuid, spec) {
    let node = await request('scene', 'query-node', uuid);
    if (!node.__comps__?.some(c => c.type === spec.type)) node = await dispatch('component.add', { uuid, component: spec.type });
    const dump = node.__comps__.find(c => c.type === spec.type);
    if (!dump) throw new Error(`Component not found after adding ${spec.type}`);
    const id = dump.value.uuid.value;
    if (Object.keys(spec.properties || {}).length) await dispatch('component.patch', { node: uuid, component: id, properties: spec.properties });
    return id;
  }
  async function build(p) {
    validate(catalog.find(op => op.action === 'ui.build').inputSchema, p);
    if (!!p.tree === !!p.template) throw new Error('Supply exactly one of tree or template.');
    const tree = p.tree || templates[p.template]?.tree;
    if (!tree) throw new Error('Unknown template.');
    let count = 0;
    const classes = new Set(['cc.UITransform']);
    function visit(node, depth = 0) {
      if (++count > 200 || depth > 20) throw new Error('UI tree exceeds 200 nodes or 20 levels.');
      const seen = new Set();
      for (const spec of node.components || []) {
        if (seen.has(spec.type)) throw new Error(`Duplicate component in ${node.name}: ${spec.type}`);
        seen.add(spec.type); classes.add(spec.type);
      }
      for (const child of node.children || []) visit(child, depth + 1);
    }
    visit(tree);
    const projectTree = await hierarchy();
    let checked = await scene('uiContext', [[...classes], projectTree, p.parent]);
    if (checked.missing.length) throw new Error(`Unregistered components: ${checked.missing.join(', ')}`);
    const activeCanvases = checked.canvases.filter(c => c.active);
    if (!p.parent && activeCanvases.length > 1) throw new Error('Multiple active project Canvases found. Supply the intended parent UUID.');
    if (!p.parent && checked.canvases.length && !checked.canvas) throw new Error('Project Canvas is inactive. Enable it or supply an active Canvas parent.');
    const createCanvas = !p.parent && !checked.canvas;
    if (createCanvas && p.createCanvas === false) throw new Error('No project Canvas exists. Enable createCanvas or create a Canvas with a UI camera first.');
    let canvasAsset;
    if (createCanvas) {
      canvasAsset = await request('asset-db', 'query-uuid', 'db://internal/default_prefab/2d/ui/Canvas.prefab');
      if (!canvasAsset) throw new Error('Creator built-in Canvas asset is unavailable; create a Canvas with a UI camera first.');
    }
    function cameraCheck(context) {
      const info = context.parentCanvas || context.canvases.find(c => c.uuid === context.canvas);
      if (!info?.active || !info.camera?.active || !(info.camera.visibility & (1 << 25))) throw new Error('Project Canvas needs an active UI camera whose visibility includes UI_2D. Fix its camera settings before generating UI.');
    }
    if (!createCanvas) cameraCheck(checked);
    let parent = p.parent || checked.canvas;
    if (p.dryRun) return { ok: true, dryRun: true, nodes: count, parent: parent || projectTree.uuid, createCanvas, classes: [...classes], note: createCanvas ? 'No project Canvas: generation will create a Canvas and UI camera. No edits made.' : 'Project parent and UI camera checked. Property compatibility is verified while building; no edits made.' };
    let root;
    let createdCanvas;
    const created = [];
    async function create(spec, parentId, route) {
      const id = await dispatch('node.create', { name: spec.name, parent: parentId, nameIncrease: false });
      if (!root) root = id;
      created.push({ path: route, uuid: id });
      await set(id, 'layer', 1 << 25);
      if (spec.active !== undefined) await set(id, 'active', spec.active);
      if (spec.position) await set(id, 'position', spec.position);
      await component(id, { type: 'cc.UITransform', properties: { contentSize: spec.size || { width: 100, height: 100 } } });
      for (const comp of spec.components || []) await component(id, comp);
      for (const [i, child] of (spec.children || []).entries()) await create(child, id, `${route}/${i}`);
    }
    try {
      if (createCanvas) {
        createdCanvas = await dispatch('node.create', { name: 'Canvas', parent: projectTree.uuid, assetUuid: canvasAsset, nameIncrease: true });
        parent = createdCanvas;
        checked = await scene('uiContext', [[...classes], await hierarchy(), parent]);
        cameraCheck(checked);
      }
      await create(tree, parent, '');
      const after = await hierarchy();
      const ids = new Set();
      function index(node) { ids.add(node.uuid); for (const child of node.children || []) index(child); }
      index(after);
      if (created.some(node => !ids.has(node.uuid))) throw new Error('Generated UI is missing from the editable project hierarchy.');
      return { ok: true, root, parent, createdCanvas: createdCanvas || null, nodes: created, saved: false, verified: 'project hierarchy membership and UI camera; inspect/screenshot before saving' };
    }
    catch (error) {
      let cleanup = 'no nodes created';
      const cleanupRoot = createdCanvas || root;
      if (cleanupRoot) {
        try { await dispatch('node.remove', { uuids: [cleanupRoot] }); cleanup = 'created subtree removed'; }
        catch (failure) { cleanup = `FAILED: ${failure.message}; inspect root ${cleanupRoot}`; }
      }
      throw new Error(`UI build failed: ${error.message}. Cleanup: ${cleanup}. Scene is not automatically saved.`);
    }
  }
  return {
    async dispatch(action, p) {
      if (action === 'ui.templates') return Object.entries(templates).map(([id, t]) => ({ id, title: t.title, description: t.description, tree: t.tree }));
      if (action === 'ui.build') return build(p);
      if (action === 'knowledge.query') {
        const terms = p.query.toLowerCase().split(/\s+/).filter(Boolean);
        const ranked = knowledge.map(item => ({ item, score: terms.reduce((n, term) => n + `${item.id} ${item.title} ${item.tags.join(' ')} ${item.body}`.toLowerCase().includes(term), 0) })).filter(r => r.score > 0).sort((a, b) => b.score - a.score);
        return { total: ranked.length, results: ranked.slice(0, p.limit || 3).map(r => r.item) };
      }
      if (action === 'scene.snapshot') {
        const snapshot = await snapshotScene();
        if (snapshots.size >= 8) snapshots.delete(snapshots.keys().next().value);
        const snapshotId = randomUUID(); snapshots.set(snapshotId, snapshot);
        return { snapshotId, scene: snapshot.scene, nodes: snapshot.nodes.length, scope: 'structure, transforms, UITransform size, Label text, component identities; in-memory, not a scene backup' };
      }
      if (action === 'scene.diff') {
        const before = snapshots.get(p.snapshotId);
        if (!before) throw new Error('Snapshot expired or unknown. Capture another snapshot.');
        const after = await snapshotScene();
        if (before.scene !== after.scene) throw new Error('Current scene differs from the snapshot scene.');
        const old = new Map(before.nodes.map(n => [n.uuid, n]));
        const next = new Map(after.nodes.map(n => [n.uuid, n]));
        const changes = [];
        for (const [id, node] of next) {
          if (!old.has(id)) changes.push({ kind: 'added', node });
          else if (JSON.stringify(old.get(id)) !== JSON.stringify(node)) changes.push({ kind: 'changed', uuid: id, before: old.get(id), after: node });
        }
        for (const [id, node] of old) if (!next.has(id)) changes.push({ kind: 'removed', node });
        const limit = p.limit || 100;
        return { snapshotId: p.snapshotId, total: changes.length, changes: changes.slice(0, limit), truncated: changes.length > limit };
      }
      if (action === 'scene.validate') {
        const snapshot = await snapshotScene();
        const issues = [];
        const names = new Map();
        for (const node of snapshot.nodes) {
          const key = JSON.stringify([node.parent, node.name]);
          if (names.has(key)) issues.push({ rule: 'duplicate-sibling-name', severity: 'warning', uuid: node.uuid, other: names.get(key), name: node.name });
          else names.set(key, node.uuid);
          if (node.size && (node.size.width <= 0 || node.size.height <= 0)) issues.push({ rule: 'zero-ui-size', severity: 'warning', uuid: node.uuid, size: node.size });
        }
        const limit = p.limit || 100;
        return { checkedNodes: snapshot.nodes.length, rules: ['duplicate-sibling-name', 'zero-ui-size'], total: issues.length, issues: issues.slice(0, limit), truncated: issues.length > limit };
      }
      throw new Error(`Unknown feature: ${action}`);
    },
  };
}
module.exports = { createFeatures };
