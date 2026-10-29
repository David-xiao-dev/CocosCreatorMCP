'use strict';
const { createStore, assetUrl, sha } = require('./resource-store.cjs');
const { validateSpec } = require('./animation-model.cjs');
function createAnimation({ request, project, dispatch }) {
  const store = createStore({ request, project });
  const scene = (method, args) => request('scene', 'execute-scene-script', { name: 'cocos-codex-bridge', method, args });
  async function clip(asset) {
    const info = await store.info(asset, true);
    if (info.type !== 'cc.AnimationClip' || !info.url.endsWith('.anim')) throw new Error('Expected a project .anim source file; model subasset clips are read-only in this workflow.');
    return { info, ...await store.source(info) };
  }
  async function refs(spec) {
    const next = JSON.parse(JSON.stringify(spec));
    for (const track of next.tracks || []) for (const keys of Object.values(track.channels)) for (const key of keys) if (key.value?.$asset) key.value.$asset = (await store.info(key.value.$asset)).uuid;
    return next;
  }
  async function withComponent(node, type, edit) {
    const before = await request('scene', 'query-node', node.uuid);
    const matches = before.__comps__?.filter(c => c.type === type) || [];
    if (matches.length > 1) throw new Error(`Multiple ${type} components; inspect and resolve the ambiguity first.`);
    let added;
    if (!matches.length) {
      const after = await dispatch('component.add', { uuid: node.uuid, component: type });
      added = after.__comps__?.find(c => c.type === type)?.value?.uuid?.value;
      if (!added) throw new Error(`${type} add returned no component identity; inspect node ${node.uuid} before retrying.`);
    }
    try { return await edit(); }
    catch (error) {
      let recovery = 'existing component property recovery is reported by component.patch';
      if (added) {
        try {
          await dispatch('component.remove', { uuid: added });
          const current = await request('scene', 'query-node', node.uuid);
          if (current.__comps__?.some(c => c.value?.uuid?.value === added)) throw new Error('component still present');
          recovery = 'new component removed and verified';
        } catch (failure) { recovery = `INCOMPLETE removing new component ${added}: ${failure.message}`; }
      }
      throw new Error(`${error.message}. Binding recovery: ${recovery}. Scene not saved.`);
    }
  }
  return { async dispatch(action, p) {
    if (action === 'animation.inspect' || action === 'animation.sample') {
      const t = await clip(p.asset);
      if (p.time !== undefined && p.time < 0) throw new Error('Sample time cannot be negative.');
      return { asset: t.info.url, assetUuid: t.info.uuid, revision: t.revision, ...await scene('animationRead', [t.data.toString('utf8'), !!p.keys, p.time]) };
    }
    if (action === 'animation.create' || action === 'animation.edit') {
      const editing = action === 'animation.edit';
      let previous;
      if (editing) { previous = await clip(p.asset); await store.expect(previous.info, p.expectedRevision); }
      else {
        assetUrl(p.url); if (!p.url.endsWith('.anim')) throw new Error('Animation URL must end with .anim.');
        if (await store.db('query-asset-info', p.url)) throw new Error('Animation destination already exists.');
      }
      const spec = await refs(p.spec); if (!editing) validateSpec(spec);
      const output = await scene('animationSerialize', [spec, previous?.data.toString('utf8') || null]);
      if (p.dryRun) return { dryRun: true, destination: previous?.info.url || p.url, name: output.name, duration: output.duration, tracks: output.tracks, events: output.events };
      if (editing) await store.clean();
      const recovery = editing ? store.backup([{ asset: previous.info, data: previous.data, expectedAfter: sha(output.content) }], 'animation-edit') : null;
      try {
        if (editing) await store.expect(previous.info, p.expectedRevision);
        await store.db(editing ? 'save-asset' : 'create-asset', editing ? previous.info.uuid : p.url, output.content);
        const t = await clip(editing ? previous.info.uuid : p.url);
        if (t.revision !== sha(output.content)) throw new Error('Animation source readback mismatch.');
        return { asset: t.info.url, assetUuid: t.info.uuid, revision: t.revision, ...recovery, ...await scene('animationRead', [t.data.toString('utf8'), false]) };
      } catch (error) { throw new Error(`${error.message} Asset may have changed; ${recovery ? `backupId=${recovery.backupId}` : `inspect ${p.url}`}. Do not blindly repeat the write.`); }
    }
    if (action === 'animation.bind') {
      const t = await clip(p.asset);
      const node = await dispatch('node.resolve', { target: p.node });
      return withComponent(node, 'cc.Animation', async () => {
      const current = await dispatch('component.properties', { node: node.uuid, component: 'cc.Animation', names: ['clips'] });
      const old = current.properties.clips.value || [];
      const clips = old.some(a => a.uuid === t.info.uuid) ? old : [...old, { uuid: t.info.uuid }];
      const changes = { clips, ...(p.defaultClip ? { defaultClip: { uuid: t.info.uuid } } : {}), playOnLoad: p.playOnLoad };
      return dispatch('component.patch', { node: node.uuid, component: 'cc.Animation', properties: changes });
      });
    }
    if (action === 'spine.inspect') {
      const asset = await store.info(p.asset);
      return { asset: asset.url, ...await scene('spineRead', [asset.uuid]) };
    }
    if (action === 'spine.configure') {
      const asset = await store.info(p.asset), meta = await scene('spineRead', [asset.uuid]);
      if (!meta.loaded || meta.compatible === false || meta.textures.some(t => !t.uuid || !t.width || !t.height)) throw new Error('Spine skeleton failed compatibility/runtime/texture checks. Inspect the asset and import logs.');
      if (p.skin && !meta.skins.includes(p.skin)) throw new Error(`Spine skin not found: ${p.skin}`);
      if (p.animation && !meta.animations.some(a => a.name === p.animation)) throw new Error(`Spine animation not found: ${p.animation}`);
      const node = await dispatch('node.resolve', { target: p.node });
      return withComponent(node, 'sp.Skeleton', () => dispatch('component.patch', { node: node.uuid, component: 'sp.Skeleton', properties: { skeletonData: { uuid: asset.uuid }, ...(p.skin ? { defaultSkin: p.skin } : {}), ...(p.animation ? { defaultAnimation: p.animation } : {}), loop: p.loop, timeScale: p.timeScale } }));
    }
    throw new Error(`Unknown animation/Spine action: ${action}`);
  } };
}
module.exports = { createAnimation };
