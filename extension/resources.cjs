'use strict';
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { createStore, assetUrl, sha } = require('./resource-store.cjs');
const brief = a => ({ uuid: a.uuid, url: a.url, type: a.type, importer: a.importer, ...(a.readonly ? { readonly: true } : {}) });
function replaceUuid(value, before, after, paths = [], route = '', depth = 0) {
  if (depth > 100) throw new Error('Serialized value nesting exceeds 100 levels.');
  if (!value || typeof value !== 'object') return paths;
  if (value.__uuid__ === before) { value.__uuid__ = after; paths.push(`${route}/__uuid__`); }
  for (const [key, child] of Object.entries(value)) replaceUuid(child, before, after, paths, `${route}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`, depth + 1);
  return paths;
}
function createResources(context) {
  const store = createStore(context), { db, info, source, expect, backup, clean } = store;
  let generation = 0; const cache = new Map(), plans = new Map();
  function invalidate() { generation++; cache.clear(); }
  async function links(uuid, direction, type) {
    const key = `${uuid}:${direction}:${type}`, saved = cache.get(key);
    if (saved && saved.generation === generation && Date.now() - saved.time < 1500) return { values: saved.values, cached: true };
    const epoch = generation;
    const values = await db(direction === 'users' ? 'query-asset-users' : 'query-asset-dependencies', uuid, type);
    if (!Array.isArray(values) || values.some(v => typeof v !== 'string')) throw new Error('Creator returned invalid dependency data.');
    const unique = [...new Set(values)].sort();
    cache.set(key, { values: unique, time: Date.now(), generation: epoch });
    if (cache.size > 1024) cache.delete(cache.keys().next().value);
    return { values: unique, cached: false };
  }
  async function graph(p) {
    const start = await info(p.asset), nodes = new Map([[start.uuid, brief(start)]]), edges = [], frontier = [{ uuid: start.uuid, depth: 0 }], visited = new Set();
    const epoch = generation, edgeKeys = new Set(); let cursor = 0, cachedQueries = 0, queries = 0, truncated = false, depthLimited = false;
    while (cursor < frontier.length) {
      const current = frontier[cursor++];
      if (visited.has(current.uuid)) continue; visited.add(current.uuid);
      if (current.depth >= p.depth) { depthLimited = true; continue; }
      const directions = p.direction === 'both' ? ['dependencies', 'users'] : [p.direction];
      for (const direction of directions) {
        const result = await links(current.uuid, direction, p.type); queries++; if (result.cached) cachedQueries++;
        for (const uuid of result.values) {
          const from = direction === 'users' ? uuid : current.uuid, to = direction === 'users' ? current.uuid : uuid;
          const edgeKey = `${from}:${to}`;
          if (edgeKeys.has(edgeKey)) continue;
          if (edges.length >= p.maxEdges || !nodes.has(uuid) && nodes.size >= p.maxNodes) { truncated = true; continue; }
          if (!nodes.has(uuid)) {
            const target = await db('query-asset-info', uuid);
            nodes.set(uuid, target ? brief(target) : { uuid, missing: true });
          }
          edgeKeys.add(edgeKey); edges.push({ from, to });
          if (!nodes.get(uuid).missing) frontier.push({ uuid, depth: current.depth + 1 });
        }
      }
    }
    return { root: start.uuid, direction: p.direction, depth: p.depth, nodes: [...nodes.values()], edges, nodeCount: nodes.size, edgeCount: edges.length, missing: [...nodes.values()].filter(n => n.missing).map(n => n.uuid), truncated, depthLimited, changedDuringRead: epoch !== generation, generation, queries, cachedQueries,
      scope: 'Native AssetDB imported dependencies/users within requested depth and budget. Runtime string paths/dynamic loading are not a complete project reference index.' };
  }
  return { invalidate, async dispatch(action, p) {
    if (action === 'asset.info') {
      const asset = await info(p.asset), [dependencies, users] = await Promise.all([links(asset.uuid, 'dependencies', 'all'), links(asset.uuid, 'users', 'all')]);
      const file = asset.file && fs.existsSync(asset.file) && !asset.isDirectory ? await source(asset) : null;
      return { ...brief(asset), source: asset.source, isDirectory: asset.isDirectory, subAssets: Object.values(asset.subAssets || {}).map(brief), ...(file ? { revision: file.revision, bytes: file.data.length } : {}), dependencies: dependencies.values, users: users.values, generation };
    }
    if (action === 'asset.graph') return graph(p);
    if (action === 'asset.import') {
      assetUrl(p.url); if (!path.isAbsolute(p.source)) throw new Error('Import source must be an absolute local path.');
      const src = fs.realpathSync(p.source);
      if (await db('query-asset-info', p.url)) throw new Error('Import destination exists; overwrite is disabled.');
      if (p.dryRun) return { dryRun: true, source: src, destination: p.url, directory: fs.statSync(src).isDirectory() };
      await db('import-asset', src, p.url, { overwrite: false, rename: false }); invalidate();
      const result = await info(p.url); return { ...brief(result), imported: true, subAssets: Object.values(result.subAssets || {}).map(brief) };
    }
    if (['asset.copy', 'asset.move'].includes(action)) {
      const asset = await info(p.asset, true); assetUrl(p.url);
      if (await db('query-asset-info', p.url)) throw new Error('Destination exists; overwrite is disabled.');
      const current = await expect(asset, p.expectedRevision), users = (await links(asset.uuid, 'users', 'all')).values;
      const identities = Object.values(asset.subAssets || {}).map(a => a.uuid).sort();
      if (p.dryRun) return { dryRun: true, source: asset.url, destination: p.url, uuid: asset.uuid, revision: current.revision, users };
      await clean();
      await db(action === 'asset.move' ? 'move-asset' : 'copy-asset', asset.url, p.url, { overwrite: false, rename: false }); invalidate();
      const result = await info(p.url, true);
      if ((await source(result)).revision !== current.revision) throw new Error(`Destination content mismatch. Inspect ${p.url}; source operation may have completed.`);
      if (action === 'asset.move' && (result.uuid !== asset.uuid || JSON.stringify(Object.values(result.subAssets || {}).map(a => a.uuid).sort()) !== JSON.stringify(identities))) throw new Error('Move did not preserve main/subasset identities; inspect AssetDB before retry.');
      if (action === 'asset.copy' && result.uuid === asset.uuid) throw new Error('Copy unexpectedly reused the source UUID.');
      return { ...brief(result), originalUuid: asset.uuid, identityPreserved: action === 'asset.move', usersBefore: users, usersAfter: (await links(result.uuid, 'users', 'all')).values, note: 'Uses native AssetDB; UUID checks do not prove runtime string paths remain valid after a move.' };
    }
    if (action === 'asset.reimport') {
      const asset = await info(p.asset, true); await expect(asset, p.expectedRevision); await clean();
      await db('reimport-asset', asset.uuid); invalidate();
      const result = await info(asset.uuid); if (result.url !== asset.url) throw new Error('Identity changed during reimport.');
      return { ...brief(result), reimported: true, revision: (await source(result)).revision };
    }
    if (action === 'asset.replace.plan') {
      const from = await info(p.from), to = await info(p.to);
      if (from.uuid === to.uuid || from.type !== to.type || ['cc.Script', 'cc.JavaScript', 'cc.TypeScript'].includes(from.type) || ['typescript', 'javascript'].includes(from.importer)) throw new Error('Replacement requires distinct assets of the same imported type; script class migrations are not supported.');
      const users = (await links(from.uuid, 'users', 'all')).values;
      if (users.length > p.maxAssets) throw new Error(`Replacement has ${users.length} users, above maxAssets. Narrow the change first.`);
      const entries = [], unsupported = []; let planBytes = 0;
      for (const uuid of users) {
        try {
          const asset = await info(uuid, true), current = await source(asset), value = JSON.parse(current.data.toString('utf8'));
          const locations = replaceUuid(value, from.uuid, to.uuid);
          if (!locations.length) { unsupported.push({ uuid, asset: asset.url, reason: 'No explicit serialized __uuid__ references; importer/script/dynamic references require a separate workflow.' }); continue; }
          const content = Buffer.from(JSON.stringify(value, null, 2));
          if (planBytes + current.data.length + content.length > 32 * 1024 * 1024) throw new Error('Replacement plan exceeds 32 MiB of retained source buffers; narrow the change.');
          planBytes += current.data.length + content.length;
          entries.push({ asset, data: current.data, revision: current.revision, content, expectedAfter: sha(content), locations });
        } catch (error) { unsupported.push({ uuid, reason: error.message }); }
      }
      for (const [id, plan] of plans) if (Date.now() - plan.time > 300000) plans.delete(id);
      let retained = [...plans.values()].reduce((total, p) => total + p.bytes, 0);
      while (plans.size && retained + planBytes > 64 * 1024 * 1024) { const id = plans.keys().next().value; retained -= plans.get(id).bytes; plans.delete(id); }
      const planId = randomUUID(); plans.set(planId, { from: from.uuid, to: to.uuid, type: to.type, entries, unsupported, bytes: planBytes, time: Date.now() });
      if (plans.size > 8) plans.delete(plans.keys().next().value);
      return { planId, from: brief(from), to: brief(to), assets: entries.map(e => ({ ...brief(e.asset), revision: e.revision, references: e.locations.length, locations: e.locations.slice(0, 20) })), unsupported, blocked: !!unsupported.length, references: entries.reduce((n, e) => n + e.locations.length, 0), expiresInMs: 300000, scope: 'Exact serialized __uuid__ fields only. Apply refuses any unsupported users; plan is not a full project migration.' };
    }
    if (action === 'asset.replace.apply') {
      const plan = plans.get(p.planId);
      if (!plan || Date.now() - plan.time > 300000) throw new Error('Replacement plan expired; create a new plan.');
      if (plan.unsupported.length || !plan.entries.length) throw new Error('Replacement plan is blocked or empty; no files changed.');
      await clean();
      const from = await info(plan.from), to = await info(plan.to);
      if (from.type !== plan.type || to.type !== plan.type) throw new Error('Replacement asset type changed.');
      invalidate(); const users = (await links(plan.from, 'users', 'all')).values;
      if (JSON.stringify([...users].sort()) !== JSON.stringify(plan.entries.map(e => e.asset.uuid).sort())) throw new Error('Reference users changed; make a fresh plan.');
      for (const entry of plan.entries) await expect(entry.asset, entry.revision);
      const recovery = backup(plan.entries, 'replace'), completed = [];
      plans.delete(p.planId);
      try {
        for (const e of plan.entries) {
          await clean(); await expect(e.asset, e.revision);
          completed.push(e);
          await db('save-asset', e.asset.uuid, e.content);
          if ((await source(e.asset)).revision !== e.expectedAfter) throw new Error('Source readback mismatch after replacement.');
        }
      } catch (error) {
        const failures = [];
        for (const e of completed.reverse()) try {
          const current = await source(e.asset);
          if (current.revision === e.revision) continue;
          if (current.revision !== e.expectedAfter) throw new Error('Concurrent source change prevents rollback.');
          await db('save-asset', e.asset.uuid, e.data);
          if ((await source(e.asset)).revision !== e.revision) throw new Error('Rollback readback mismatch.');
        } catch (failure) { failures.push({ asset: e.asset.url, error: failure.message }); }
        invalidate(); throw new Error(`${error.message} Recovery=${failures.length ? JSON.stringify(failures) : 'previous source contents restored and verified'}. BackupId=${recovery.backupId}. Scene state not rolled back; inspect before retrying.`);
      }
      invalidate();
      return { ...recovery, replaced: plan.entries.map(e => e.asset.url), references: plan.entries.reduce((n, e) => n + e.locations.length, 0), verified: 'Exact persisted source hashes, not rendered/runtime state. Reopen affected scenes and verify.' };
    }
    if (action === 'asset.restore') { const result = await store.restore(p.backupId, p.dryRun); invalidate(); return result; }
    throw new Error(`Unknown resource action: ${action}`);
  } };
}
module.exports = { createResources, replaceUuid };
