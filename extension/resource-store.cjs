'use strict';
const fs = require('fs');
const path = require('path');
const { createHash, randomUUID } = require('crypto');
const sha = content => createHash('sha256').update(content).digest('hex');
function assetUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('db://assets/') || /[\\%?#\x00-\x1f]/.test(url) || url.slice(12).split('/').some(s => !s || s === '.' || s === '..' || /[:*<>|]/.test(s)) || url.endsWith('.meta')) throw new Error('Use a project db://assets/... URL without traversal, wildcard, escapes or .meta suffix.');
  return url;
}
function contained(root, filename) {
  const rel = path.relative(fs.realpathSync(root), fs.realpathSync(filename));
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error('Resource path escapes the project assets directory.');
  return filename;
}
function createStore({ request, project }) {
  const db = (message, ...args) => request('asset-db', message, ...args);
  async function info(asset, writable = false) {
    let result;
    // Native save/reimport can resolve before its AssetDB import flag settles.
    // Retry only observation; a write is never replayed here.
    for (let attempt = 0; attempt < 25; attempt++) {
      result = await db('query-asset-info', asset);
      if (result && !result.invalid && result.imported) break;
      if (attempt < 24) await new Promise(resolve => setTimeout(resolve, 40));
    }
    if (!result || result.invalid || !result.imported) throw new Error(`Imported asset not found: ${asset}`);
    if (writable) {
      assetUrl(result.url);
      if (result.readonly || result.isDirectory || !result.file || !result.source) throw new Error('Expected a writable project source file, not an internal asset, folder or subasset.');
      contained(path.join(project(), 'assets'), result.file);
    }
    return result;
  }
  async function source(asset) {
    let previous, failure;
    for (let i = 0; i < 20; i++) {
      try {
        if (fs.statSync(asset.file).size > 16 * 1024 * 1024) throw new Error('Source exceeds the 16 MiB workflow limit.');
        const data = fs.readFileSync(asset.file), revision = sha(data);
        if (previous === revision) return { data, revision };
        previous = revision;
      } catch (error) { failure = error; }
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    throw new Error(`Source did not stabilize: ${failure?.message || asset.url}. Writes are not retried.`);
  }
  async function expect(asset, revision) {
    const current = await info(asset.uuid, true);
    if (current.url !== asset.url) throw new Error('Asset moved; inspect again.');
    const data = await source(current);
    if (data.revision !== revision) throw new Error(`Resource revision changed: ${current.url}. Reinspect before writing.`);
    return data;
  }
  function backup(entries, kind) {
    const backupId = randomUUID(), dir = path.join(project(), 'local', 'cocos-mcp', 'resource-backups', backupId);
    fs.mkdirSync(dir, { recursive: true });
    const manifest = { backupId, kind, createdAt: new Date().toISOString(), entries: entries.map((e, i) => {
      fs.writeFileSync(path.join(dir, `${i}.source`), e.data, { flag: 'wx' });
      if (fs.existsSync(`${e.asset.file}.meta`)) fs.copyFileSync(`${e.asset.file}.meta`, path.join(dir, `${i}.meta`), fs.constants.COPYFILE_EXCL);
      return { uuid: e.asset.uuid, url: e.asset.url, revision: sha(e.data), expectedAfter: e.expectedAfter, file: `${i}.source` };
    }) };
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
    return { backupId, backupPath: dir };
  }
  async function restore(backupId, dryRun) {
    if (!/^[a-f0-9-]{36}$/.test(backupId)) throw new Error('Invalid backup id.');
    const dir = path.join(project(), 'local', 'cocos-mcp', 'resource-backups', backupId);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    if (manifest.backupId !== backupId || !Array.isArray(manifest.entries) || manifest.entries.length > 100) throw new Error('Invalid backup manifest.');
    const entries = [];
    for (let i = 0; i < manifest.entries.length; i++) {
      const entry = manifest.entries[i];
      if (entry.file !== `${i}.source`) throw new Error('Invalid backup content path.');
      const data = fs.readFileSync(path.join(dir, entry.file));
      if (sha(data) !== entry.revision) throw new Error('Backup content hash mismatch.');
      const asset = await info(entry.uuid, true);
      if (asset.url !== entry.url) throw new Error('Backup resource URL/UUID changed.');
      const current = await expect(asset, entry.expectedAfter);
      entries.push({ asset, data: current.data, expectedAfter: entry.revision, restore: data });
    }
    if (dryRun) return { dryRun: true, backupId, assets: entries.map(e => e.asset.url) };
    await clean();
    const recovery = backup(entries, 'restore');
    const completed = [];
    try {
      for (const e of entries) {
        await clean(); await expect(e.asset, sha(e.data));
        await db('save-asset', e.asset.uuid, e.restore);
        if ((await source(e.asset)).revision !== sha(e.restore)) throw new Error('Restored source readback mismatch.');
        completed.push(e.asset.url);
      }
    } catch (error) { throw new Error(`${error.message} Restore is non-atomic; completed=${JSON.stringify(completed)}. Recovery backupId=${recovery.backupId}. Inspect before retrying.`); }
    return { ...recovery, restoredFrom: backupId, restored: completed, note: 'Source content restored through AssetDB; meta is preserved, not overwritten. Reopen affected scenes to verify.' };
  }
  async function clean() { if (await request('scene', 'query-dirty')) throw new Error('Save current scene/prefab explicitly before resource changes.'); }
  return { db, info, source, expect, backup, restore, clean };
}
module.exports = { createStore, assetUrl, contained, sha };
