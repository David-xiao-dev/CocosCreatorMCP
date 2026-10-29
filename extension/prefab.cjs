'use strict';
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { resolveNode, indexTree } = require('./development-model.cjs');
const { revision, assetUrl, serialized } = require('./prefab-model.cjs');
function createPrefabs({ request, project }) {
  const scene = (method, args) => request('scene', 'execute-scene-script', { name: 'cocos-codex-bridge', method, args });
  const tree = () => request('scene', 'query-node-tree');
  const resolve = async node => resolveNode(await tree(), node);
  async function info(asset) {
    const result = await request('asset-db', 'query-asset-info', asset);
    if (!result || result.importer !== 'prefab' || result.invalid || !result.imported) throw new Error(`Expected an imported prefab asset: ${asset}`);
    assetUrl(result.url);
    const relative = path.relative(fs.realpathSync(path.join(project(), 'assets')), fs.realpathSync(result.file));
    if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) throw new Error('Prefab file is outside project assets.');
    return result;
  }
  async function read(asset) {
    // Native save/import can resolve while its source is being normalized.
    // Retry observations only; require two complete identical reads.
    let previous, error;
    for (let i = 0; i < 30; i++) {
      try {
        if (fs.statSync(asset.file).size > 8 * 1024 * 1024) throw new Error('Prefab exceeds the 8 MiB inspection limit.');
        const text = fs.readFileSync(asset.file, 'utf8'), summary = serialized(text);
        if (text === previous) return { text, revision: revision(text), summary };
        previous = text;
      } catch (failure) { error = failure; previous = undefined; }
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    throw new Error(`Prefab source did not stabilize: ${error?.message || asset.url}. Inspect import status; no automatic write retry.`);
  }
  async function validate(asset) {
    const data = await read(asset), missingAssets = [];
    for (const uuid of data.summary.assets) if (uuid !== asset.uuid && !await request('asset-db', 'query-asset-info', uuid)) missingAssets.push(uuid);
    const types = await scene('prefabTypes', [data.summary.types]);
    return { asset: asset.url, assetUuid: asset.uuid, revision: data.revision, ...data.summary, ...types, missingAssets,
      valid: !missingAssets.length && !types.missingTypes.length,
      scope: 'Serialized object links, AssetDB dependencies and registered classes; not visual/runtime or whole-project validation.' };
  }
  function assertValid(result) {
    if (!result.valid) throw new Error(`Prefab validation failed: ${JSON.stringify({ missingAssets: result.missingAssets, missingTypes: result.missingTypes })}`);
  }
  async function audit(node) {
    return scene('prefabAudit', [await tree(), node.uuid]);
  }
  function noExternal(result) {
    if (result.external.length) throw new Error(`Prefab has external Node/Component references which Creator could clear. Move targets inside the subtree or explicitly clear/rebind them first: ${JSON.stringify(result.external.slice(0, 20))}`);
  }
  async function instance(node) {
    const n = await resolve(node), a = await audit(n);
    if (!a.assetUuid || a.instanceRoot !== n.uuid || !n.prefab?.isUnwrappable) throw new Error('Target must be the root of a linked prefab instance in a scene (or a nested instance), not a child or the prefab editing root.');
    return { node: n, audit: a, asset: await info(a.assetUuid) };
  }
  function writable(asset) { if (asset.readonly) throw new Error('Prefab asset is read-only.'); }
  async function expect(asset, expected) {
    writable(asset);
    const current = await read(asset);
    if (current.revision !== expected) throw new Error('Prefab revision changed. Inspect/validate again before modifying the shared asset.');
    return current;
  }
  function backup(asset, current) {
    const id = randomUUID(), directory = path.join(project(), 'local', 'cocos-mcp', 'prefab-backups');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, `${id}.prefab`), current.text, { flag: 'wx' });
    fs.writeFileSync(path.join(directory, `${id}.json`), JSON.stringify({ asset: asset.url, assetUuid: asset.uuid, revision: current.revision, time: new Date().toISOString() }, null, 2), { flag: 'wx' });
    return { backupId: id, backupPath: path.join(directory, `${id}.prefab`), previousRevision: current.revision };
  }
  async function clean() { if (await request('scene', 'query-dirty')) throw new Error('Current scene/prefab has unsaved edits. Save explicitly before switching context or restoring an asset.'); }
  async function opened(asset) {
    await request('scene', 'open-scene', asset.uuid);
    if (await request('scene', 'query-current-scene') !== asset.uuid) throw new Error('Creator did not switch to the requested asset. Inspect editor state.');
  }
  return { async dispatch(action, p) {
    if (action === 'prefab.validate') return validate(await info(p.asset));
    if (action === 'prefab.inspect') {
      const node = await resolve(p.node), a = await audit(node);
      return { node: node.uuid, path: node.path, state: node.prefab, ...a, ...(a.assetUuid ? { asset: (await info(a.assetUuid)).url, revision: (await read(await info(a.assetUuid))).revision } : {}), saved: !await request('scene', 'query-dirty') };
    }
    if (action === 'prefab.create') {
      assetUrl(p.url);
      if (await request('asset-db', 'query-asset-info', p.url)) throw new Error('Prefab destination already exists; create never overwrites an asset.');
      const node = await resolve(p.node), a = await audit(node);
      if (a.assetUuid) throw new Error('Source already belongs to a prefab. Unlink explicitly or use a new parent node.');
      noExternal(a);
      if (a.incoming.length) throw new Error(`Other scene components reference this subtree. Native creation replaces its UUIDs; clear/rebind these references explicitly first: ${JSON.stringify(a.incoming.slice(0, 20))}`);
      const source = await request('scene', 'getdata-prefab', node.uuid);
      serialized(source);
      if (p.dryRun) return { dryRun: true, source: node.uuid, destination: p.url, ...a, note: 'Native creation links the source instance and may rename it to the asset filename.' };
      const uuid = await request('scene', 'create-prefab', node.uuid, p.url);
      const asset = await info(p.url), result = await validate(asset);
      assertValid(result);
      // Native create replaces the source subtree with a fresh instance in 3.8.8.
      // Never return the now-stale source UUID or retry the creation.
      const matches = indexTree(await tree()).filter(n => n.prefab?.assetUuid === asset.uuid && n.prefab?.isUnwrappable && n.parent === node.parent);
      if (uuid !== asset.uuid || matches.length !== 1) throw new Error(`Creator prefab linkage could not be verified. Inspect ${p.url}; creation is not automatically retried.`);
      const linked = matches[0], after = await audit(linked);
      if (after.nodes !== a.nodes || after.components !== a.components || a.scripts.some(id => !after.scripts.includes(id)) || a.assets.some(id => !after.assets.includes(id))) throw new Error(`Prefab source fidelity check failed after native creation. Inspect ${p.url}; scene not saved.`);
      return { ...result, node: linked.uuid, path: linked.path, previousNode: node.uuid, saved: false, note: 'Asset created; Creator replaced source with a linked instance and renamed it to the filename. Use returned node UUID; descendants may also have new UUIDs. Save the scene explicitly.' };
    }
    if (action === 'prefab.instantiate') {
      const asset = await info(p.asset); assertValid(await validate(asset));
      const hierarchy = await tree();
      if (!p.parent && await request('scene', 'query-scene-mode') !== 'general') throw new Error('Specify a content parent when instantiating inside prefab mode.');
      const parent = p.parent ? await resolve(p.parent) : hierarchy;
      if (parent.readonly || parent.name === 'should_hide_in_hierarchy') throw new Error('Parent is an editor wrapper or read-only.');
      const uuid = await request('scene', 'create-node', { parent: parent.uuid, assetUuid: asset.uuid, name: p.name || asset.name.replace(/\.prefab$/, ''), position: p.position, snapshot: true, nameIncrease: false });
      if (!uuid) throw new Error('Creator did not instantiate the prefab.');
      try {
        // The 3.8.8 create-node facade intentionally returns unlinked content.
        // Use its native linker to establish instance/file IDs before readback.
        if (!(await audit(await resolve(uuid))).assetUuid) await request('scene', 'link-prefab', uuid, asset.uuid);
        const node = await resolve(uuid), a = await audit(node);
        if (a.assetUuid !== asset.uuid || a.instanceRoot !== uuid) throw new Error('Prefab instance linkage readback failed.');
        return { node: uuid, path: node.path, asset: asset.url, assetUuid: asset.uuid, ...a, saved: false };
      } catch (error) {
        await request('scene', 'remove-node', { uuid: [uuid] });
        throw new Error(`${error.message} Removed only the newly instantiated node; scene not saved.`);
      }
    }
    if (['prefab.apply', 'prefab.revert', 'prefab.unlink'].includes(action)) {
      const t = await instance(p.node);
      if (action === 'prefab.apply') {
        noExternal(t.audit);
        const current = await expect(t.asset, p.expectedRevision);
        if (p.dryRun) return { dryRun: true, node: t.node.uuid, asset: t.asset.url, revision: current.revision, affectsSharedAsset: true };
        const recovery = backup(t.asset, current); await expect(t.asset, p.expectedRevision);
        try {
        const result = await request('scene', 'apply-prefab', t.node.uuid);
        const check = await validate(t.asset); assertValid(check);
        // 3.8.8 can return false even after successfully writing the asset.
        // Require persisted change instead of interpreting that boolean as success.
        if (result !== true && check.revision === current.revision) throw new Error(`Creator did not confirm a persisted change (possibly no overrides). Backup ${recovery.backupId}; inspect asset/state before retrying.`);
        return { ...check, ...recovery, node: t.node.uuid, nativeResult: result, verified: 'asset revision/readback and serialized references; inspect changed properties or a fresh instance', saved: false, note: 'Shared prefab asset updated; save the scene explicitly. Existing instance synchronization follows Creator behavior.' };
        } catch (error) { throw new Error(`${error.message} Asset may have changed. Recovery backupId=${recovery.backupId}; ${recovery.backupPath}. Inspect before retrying; scene not automatically saved.`); }
      }
      if (action === 'prefab.revert') {
        const result = await request('scene', 'restore-prefab', t.node.uuid, t.asset.uuid);
        if (result !== true) throw new Error('Creator did not confirm prefab revert. Inspect state before retrying.');
        const a = await audit(await resolve(t.node.uuid));
        if (a.assetUuid !== t.asset.uuid) throw new Error('Reverted instance linkage readback failed.');
        return { node: t.node.uuid, asset: t.asset.url, reverted: true, saved: false };
      }
      await request('scene', 'unlink-prefab', t.node.uuid, p.recursive);
      if ((await audit(await resolve(t.node.uuid))).assetUuid) throw new Error('Unlink readback failed.');
      return { node: t.node.uuid, unlinked: true, recursive: p.recursive, saved: false };
    }
    if (action === 'prefab.open') {
      await clean();
      const asset = await info(p.asset); assertValid(await validate(asset));
      const returnAsset = await request('scene', 'query-current-scene');
      await clean();
      await opened(asset);
      const hierarchy = await tree();
      const root = (function find(n) { if (n.prefab?.assetUuid === asset.uuid) return n; for (const child of n.children || []) { const match = find(child); if (match) return match; } })(hierarchy);
      if (!root || await request('scene', 'query-scene-mode') !== 'prefab') throw new Error('Prefab edit context/root could not be verified. Inspect editor state.');
      return { asset: asset.url, assetUuid: asset.uuid, root: root.uuid, path: root.path, returnAsset, revision: (await read(asset)).revision, note: 'Edit root/children with normal node/component tools; prefab.save saves, prefab.close returns to returnAsset.' };
    }
    if (action === 'prefab.save') {
      if (await request('scene', 'query-scene-mode') !== 'prefab') throw new Error('Not in prefab editing mode.');
      const asset = await info(await request('scene', 'query-current-scene'));
      const hierarchy = await tree();
      const find = n => n.prefab?.assetUuid === asset.uuid ? n : (n.children || []).map(find).find(Boolean);
      const root = find(hierarchy); if (!root) throw new Error('Prefab editing root not found.');
      noExternal(await audit(root));
      const current = await expect(asset, p.expectedRevision);
      if (!await request('scene', 'query-dirty')) return { asset: asset.url, revision: current.revision, unchanged: true, saved: true };
      const recovery = backup(asset, current); await expect(asset, p.expectedRevision);
      if (await request('scene', 'query-current-scene') !== asset.uuid || await request('scene', 'query-scene-mode') !== 'prefab') throw new Error('Editing context changed before save. No save was requested.');
      try {
      const saved = await request('scene', 'save-scene');
      if (!saved || await request('scene', 'query-dirty')) throw new Error(`Prefab not saved cleanly. Backup ${recovery.backupId}.`);
      const result = await validate(asset); assertValid(result);
      return { ...result, ...recovery, saved: true };
      } catch (error) { throw new Error(`${error.message} Asset may have changed. Recovery backupId=${recovery.backupId}; ${recovery.backupPath}. Inspect editor state before retrying.`); }
    }
    if (action === 'prefab.close') {
      if (await request('scene', 'query-scene-mode') !== 'prefab') throw new Error('Not in prefab editing mode.');
      await clean();
      const asset = await request('asset-db', 'query-asset-info', p.returnAsset);
      if (!asset || !['scene', 'prefab'].includes(asset.importer)) throw new Error('returnAsset must be an existing scene or prefab.');
      await clean();
      await opened(asset); return { opened: asset.uuid, mode: await request('scene', 'query-scene-mode') };
    }
    if (action === 'prefab.restore') {
      await clean();
      const asset = await info(p.asset), current = await expect(asset, p.expectedRevision);
      if (!/^[0-9a-f-]{36}$/.test(p.backupId)) throw new Error('Invalid backup id.');
      const base = path.join(project(), 'local', 'cocos-mcp', 'prefab-backups', p.backupId);
      const manifest = JSON.parse(fs.readFileSync(`${base}.json`, 'utf8')), text = fs.readFileSync(`${base}.prefab`, 'utf8');
      if (manifest.assetUuid !== asset.uuid || manifest.asset !== asset.url || manifest.revision !== revision(text)) throw new Error('Backup identity/content verification failed.');
      serialized(text);
      if (p.dryRun) return { dryRun: true, asset: asset.url, fromRevision: current.revision, toRevision: manifest.revision };
      const recovery = backup(asset, current); await expect(asset, p.expectedRevision);
      await clean();
      await request('asset-db', 'save-asset', asset.uuid, text);
      if ((await read(asset)).revision !== manifest.revision) throw new Error(`Restore content readback failed. Pre-restore backup ${recovery.backupId}.`);
      return { ...await validate(asset), ...recovery, restoredFrom: p.backupId, note: 'Asset restored through AssetDB with .meta preserved. Reopen scenes/instances to verify synchronization.' };
    }
    throw new Error(`Unknown prefab operation: ${action}`);
  } };
}
module.exports = { createPrefabs };
