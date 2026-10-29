'use strict';
const { resolveNode, encode, decode, editableKey, equal } = require('./development-model.cjs');
function createDevelopment({ request }) {
  const scene = (method, args) => request('scene', 'execute-scene-script', { name: 'cocos-codex-bridge', method, args });
  const tree = () => request('scene', 'query-node-tree');
  const resolve = async target => resolveNode(await tree(), target);
  async function component(target, type) {
    const node = await resolve(target);
    const dump = await request('scene', 'query-node', node.uuid);
    const matches = (dump?.__comps__ || []).map((dump, index) => ({ dump, index })).filter(c => c.dump.type === type || c.dump.cid === type || c.dump.value?.uuid?.value === type);
    if (matches.length !== 1) throw new Error(`Expected one ${type} component on ${node.path || node.name}; found ${matches.length}. Use its component UUID when multiple match.`);
    return { node, ...matches[0] };
  }
  async function reference(dump, value, hierarchy, label) {
    if (dump.isArray) {
      if (!Array.isArray(value)) return value;
      return Promise.all(value.map((v, i) => reference(dump.value[i] || dump.elementTypeData, v, hierarchy, `${label}[${i}]`)));
    }
    const isReference = dump.type === 'cc.Node' || dump.extends?.includes('cc.Component') || dump.extends?.includes('cc.Asset') || dump.type === 'cc.Component' || dump.type === 'cc.Asset';
    if (isReference) {
      let uuid;
      if (value === null) uuid = '';
      else if (value && typeof value === 'object' && Object.keys(value).length === 1) {
        if (Object.hasOwn(value, '$node')) uuid = resolveNode(hierarchy, value.$node).uuid;
        else if (Object.hasOwn(value, '$component')) {
          const ref = value.$component;
          if (!ref || Object.keys(ref).some(k => !['node', 'type'].includes(k))) throw new Error(`${label}: invalid component reference`);
          uuid = (await component(ref.node, ref.type)).dump.value.uuid.value;
        } else if (Object.hasOwn(value, '$asset')) {
          const info = await request('asset-db', 'query-asset-info', value.$asset);
          if (!info) throw new Error(`${label}: asset not found: ${value.$asset}`);
          uuid = info.uuid;
        } else if (typeof value.uuid === 'string') uuid = value.uuid;
      }
      if (uuid === undefined) throw new Error(`${label}: use {$node:path}, {$component:{node,type}}, {$asset:urlOrUuid}, {uuid}, or null`);
      if (uuid) await scene('developmentReference', [hierarchy, dump.type, uuid]);
      return { uuid };
    }
    if (value && typeof value === 'object' && !Array.isArray(value) && dump.value && typeof dump.value === 'object') {
      const result = { ...value };
      for (const [key, val] of Object.entries(value)) if (dump.value[key]?.type) result[key] = await reference(dump.value[key], val, hierarchy, `${label}.${key}`);
      return result;
    }
    return value;
  }
  async function apply(target, changes) {
    async function verifyTarget() {
      await resolve(target.node.uuid);
      const current = await request('scene', 'query-node', target.node.uuid);
      if (current?.__comps__?.[target.index]?.value?.uuid?.value !== target.dump.value.uuid.value) throw new Error('Component identity/order changed during the edit. Reinspect before continuing.');
    }
    await verifyTarget();
    const effective = changes.filter(([key, dump]) => !equal(decode(target.dump.value[key]), decode(dump)));
    const output = () => ({ node: target.node.uuid, component: target.dump.value.uuid.value, type: target.dump.type, properties: Object.fromEntries(changes.map(([key, dump]) => [key, decode(dump)])), changed: effective.map(([key]) => key), verified: 'inspector readback', saved: false });
    if (!effective.length) return output();
    const recording = await request('scene', 'begin-recording', target.node.uuid);
    const attempted = [];
    try {
      for (const [key, dump] of effective) {
        await verifyTarget();
        attempted.push(key);
        const result = await request('scene', 'set-property', { uuid: target.node.uuid, path: `__comps__.${target.index}.${key}`, dump, record: false });
        const current = await request('scene', 'query-component', target.dump.value.uuid.value);
        if (!current?.value?.[key] || !equal(decode(dump), decode(current.value[key]))) throw new Error(`${result === false ? 'Creator rejected' : 'Readback mismatch for'} ${key}`);
      }
      await request('scene', 'end-recording', recording);
    } catch (error) {
      const failures = [];
      for (const key of attempted.reverse()) {
        try {
          await verifyTarget();
          await request('scene', 'set-property', { uuid: target.node.uuid, path: `__comps__.${target.index}.${key}`, dump: target.dump.value[key], record: false });
          const current = await request('scene', 'query-component', target.dump.value.uuid.value);
          if (!equal(decode(target.dump.value[key]), decode(current.value[key]))) throw new Error('restore readback mismatch');
        } catch (failure) { failures.push(`${key}: ${failure.message}`); }
      }
      try { await request('scene', 'end-recording', recording); } catch (failure) { failures.push(`undo record: ${failure.message}`); }
      throw new Error(`${error.message}. Property recovery: ${failures.length ? `INCOMPLETE ${failures.join('; ')}` : 'previous values restored and verified'}. Scene not saved.`);
    }
    return output();
  }
  async function status(p) {
    const info = p.asset ? await request('asset-db', 'query-asset-info', p.asset) : null;
    if (p.asset && (!info || info.importer !== 'typescript' && info.importer !== 'javascript')) throw new Error('Expected an imported TypeScript/JavaScript script asset.');
    const result = await scene('developmentClass', [p.className]);
    if (info && result.registered && result.scriptUuid !== info.uuid) throw new Error(`Class ${p.className} belongs to another script or is not a project script.`);
    return { ...result, ...(info ? { asset: info.url, assetUuid: info.uuid } : {}), note: 'Registration/ownership check; not full TypeScript type checking or proof of latest hot-reloaded source.' };
  }
  return { async dispatch(action, p) {
    if (action === 'node.resolve') {
      const n = await resolve(p.target); return { uuid: n.uuid, path: n.path, name: n.name, active: n.active, components: n.components || [], scene: (await tree()).uuid };
    }
    if (action === 'component.properties') {
      const t = await component(p.node, p.component);
      const props = Object.entries(t.dump.value).filter(([k, v]) => !k.startsWith('_') && !['uuid', 'node', 'name'].includes(k) && v?.type);
      return { node: t.node.uuid, component: t.dump.value.uuid.value, type: t.dump.type, properties: Object.fromEntries(props.filter(([k]) => !p.names?.length || p.names.includes(k)).map(([k, v]) => [k, { type: v.type, value: decode(v), readonly: !!v.readonly, ...(v.isArray ? { isArray: true } : {}), ...(v.enumList ? { enumList: v.enumList } : {}) }])) };
    }
    if (action === 'component.patch') {
      const t = await component(p.node, p.component), hierarchy = await tree();
      const entries = Object.entries(p.properties);
      if (!entries.length || entries.length > 40) throw new Error('Supply 1–40 properties.');
      const changes = [];
      for (const [key, value] of entries) {
        editableKey(key);
        if (t.dump.type === 'cc.Button' && key === 'clickEvents') throw new Error('Use button.events to validate Button event targets and handlers.');
        const dump = t.dump.value[key];
        if (!dump) throw new Error(`Unknown inspector property ${t.dump.type}.${key}`);
        changes.push([key, encode(dump, await reference(dump, value, hierarchy, key), key)]);
      }
      if (p.dryRun) return { dryRun: true, node: t.node.uuid, component: t.dump.value.uuid.value, properties: Object.fromEntries(changes.map(([k, d]) => [k, decode(d)])), note: 'Types/references checked; no edits made.' };
      return apply(t, changes);
    }
    if (action === 'script.status') return status(p);
    if (action === 'script.attach') {
      const start = Date.now(), node = await resolve(p.node), sceneId = (await tree()).uuid;
      let state;
      do {
        if ((await tree()).uuid !== sceneId) throw new Error('Scene changed while waiting for script registration. No component added.');
        state = await status(p);
        if (state.registered && (p.requiredMethods || []).every(name => state.methods.includes(name))) break;
        if (Date.now() - start >= (p.timeoutMs ?? 15000)) throw new Error(`Class ${p.className} or required methods did not register before timeout. Inspect editor.logs for compilation errors. No component added.`);
        await new Promise(resolve => setTimeout(resolve, 250));
      } while (true);
      const dump = await request('scene', 'query-node', node.uuid);
      const existing = (dump.__comps__ || []).filter(c => c.cid === state.classId || c.type === p.className);
      if (existing.length > 1) throw new Error('Multiple script components found; use their UUIDs.');
      if (!existing.length) await request('scene', 'create-component', { uuid: node.uuid, component: p.className });
      const current = await component(node.uuid, p.className);
      return { node: node.uuid, component: current.dump.value.uuid.value, type: p.className, classId: state.classId, added: !existing.length, waitedMs: Date.now() - start, saved: false, verified: 'class registration, source ownership and inspector component', note: state.note };
    }
    if (action === 'button.events') {
      const t = await component(p.node, 'cc.Button'), dump = t.dump.value.clickEvents;
      let values = decode(dump);
      const input = p.events || [];
      if (['replace', 'append'].includes(p.mode) && !input.length) throw new Error('Supply events for replace/append; use clear to remove all.');
      const events = [];
      for (const event of input) {
        const target = await resolve(event.target);
        const info = await scene('developmentHandler', [await tree(), target.uuid, event.component, event.handler]);
        events.push({ target: { uuid: target.uuid }, component: event.component, _componentId: info.classId, handler: event.handler, customEventData: event.customEventData || '' });
      }
      if (p.mode === 'clear') values = [];
      else if (p.mode === 'remove') {
        if (!Number.isInteger(p.index) || p.index < 0 || p.index >= values.length) throw new Error('Event index is out of range.');
        values.splice(p.index, 1);
      } else if (p.mode === 'replace') values = events;
      else if (p.mode === 'append') { for (const event of events) if (!values.some(v => equal(v, event))) values.push(event); }
      else throw new Error('Unknown event mode.');
      // Only this specialized operation may set Creator's private component ID.
      const desired = encode(dump, values, 'clickEvents');
      if (p.dryRun) return { dryRun: true, node: t.node.uuid, events: decode(desired), note: 'Targets, components and methods checked; no edits made.' };
      const result = await apply(t, [['clickEvents', desired]]);
      return { ...result, events: result.properties.clickEvents, verified: 'handler existence and inspector readback; runtime click still required' };
    }
    throw new Error(`Unknown development operation: ${action}`);
  } };
}
module.exports = { createDevelopment };
