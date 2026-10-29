import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { resolveNode, encode, decode } = require('../extension/development-model.cjs');
const { createDevelopment } = require('../extension/development.cjs');
const prop = (type, value, extra = {}) => ({ type, value, ...extra });

test('project node resolver rejects ambiguous sibling paths and names, accepts UUID and unique path', () => {
  const tree = { uuid: 'scene', name: 'Main', children: [{ uuid: 'canvas', name: 'Canvas', children: [{ uuid: 'a', name: 'Button' }, { uuid: 'b', name: 'Button' }] }, { uuid: 'other', name: 'Button' }] };
  assert.equal(resolveNode(tree, 'a').uuid, 'a');
  assert.equal(resolveNode(tree, '/Canvas').uuid, 'canvas');
  assert.throws(() => resolveNode(tree, 'Button'), /Ambiguous.*Candidates/);
  assert.throws(() => resolveNode(tree, 'Canvas/Button'), /Ambiguous/);
  assert.throws(() => resolveNode(tree, 'Reference-Image-Canvas'), /not found/);
});

test('typed property conversion preserves nested array dumps, validates enums, primitive types and read-only fields', () => {
  const d = prop('Event', [], { isArray: true, elementTypeData: prop('Event', { handler: prop('String', ''), target: prop('cc.Node', { uuid: '' }) }) });
  const value = [{ handler: 'click', target: { uuid: 'node' } }];
  assert.deepEqual(decode(encode(d, value)), value);
  assert.deepEqual(d.value, [], 'conversion must not mutate original dumps used for recovery');
  assert.throws(() => encode(d, [{ handler: 12 }]), /expected string/);
  assert.throws(() => encode(prop('Enum', 0, { enumList: [{ value: 0 }] }), 3), /enum/);
  assert.throws(() => encode(prop('Number', 1, { min: 0 }), -1), /limits/);
  assert.throws(() => encode(prop('String', '', { readonly: true }), 'x'), /read-only/);
});

function fixture() {
  const tree = { uuid: 'scene', name: 'Main', children: [{ uuid: 'node', name: 'Target' }] };
  const original = { type: 'Demo', cid: 'demo-id', value: { uuid: prop('String', 'component'), node: prop('cc.Node', { uuid: 'node' }), title: prop('String', 'Before'), count: prop('Number', 0), link: prop('cc.Node', { uuid: '' }) } };
  const state = structuredClone(original); const calls = []; let rejectCount = false;
  const request = async (pkg, message, ...args) => {
    calls.push([message, ...args]);
    if (message === 'query-node-tree') return tree;
    if (message === 'query-node') return { __comps__: [structuredClone(state)] };
    if (message === 'query-component') return structuredClone(state);
    if (message === 'begin-recording') return 'record';
    if (message === 'set-property') {
      const key = args[0].path.split('.').at(-1);
      if (rejectCount && key === 'count' && args[0].dump.value === 2) throw new Error('native failure');
      state.value[key] = structuredClone(args[0].dump); return true;
    }
    if (message === 'execute-scene-script' && args[0].method === 'developmentReference') {
      if (args[0].args[2] !== 'node') throw new Error('invalid reference');
      return { valid: true };
    }
  };
  return { api: createDevelopment({ request }), state, calls, fail: () => { rejectCount = true; } };
}

test('component patch validates every field and reference before edits; dry-run does not create undo records', async () => {
  const f = fixture();
  await assert.rejects(f.api.dispatch('component.patch', { node: 'Target', component: 'Demo', properties: { title: 'Changed', count: 'bad' } }), /finite number/);
  assert.equal(f.calls.filter(c => c[0] === 'set-property').length, 0);
  await assert.rejects(f.api.dispatch('component.patch', { node: 'Target', component: 'Demo', properties: { link: { uuid: 'helper' } } }), /invalid reference/);
  await f.api.dispatch('component.patch', { node: 'Target', component: 'Demo', properties: { link: { $node: 'Target' } }, dryRun: true });
  assert.equal(f.calls.filter(c => c[0] === 'begin-recording').length, 0);
  assert.equal(f.state.value.title.value, 'Before');
});

test('native failure restores already modified fields and verifies recovery; success uses one undo group', async () => {
  const f = fixture(); f.fail();
  await assert.rejects(f.api.dispatch('component.patch', { node: 'Target', component: 'Demo', properties: { title: 'Changed', count: 2 } }), /previous values restored and verified/);
  assert.equal(f.state.value.title.value, 'Before'); assert.equal(f.state.value.count.value, 0);
  const out = await f.api.dispatch('component.patch', { node: 'Target', component: 'Demo', properties: { title: 'After', link: { $node: 'Target' } } });
  assert.equal(out.properties.title, 'After'); assert.deepEqual(out.properties.link, { uuid: 'node' });
  assert.equal(f.calls.filter(c => c[0] === 'begin-recording').length, 2);
  assert.equal(f.calls.filter(c => c[0] === 'end-recording').length, 2);
  const again = await f.api.dispatch('component.patch', { node: 'Target', component: 'Demo', properties: { title: 'After' } });
  assert.deepEqual(again.changed, []);
  assert.equal(f.calls.filter(c => c[0] === 'begin-recording').length, 2, 'equal values do not create empty undo records');
});

test('button events validate methods, avoid duplicate append, and support remove/clear without empty undo records', async () => {
  const tree = { uuid: 'scene', name: 'Main', children: [{ uuid: 'button', name: 'Button' }, { uuid: 'target', name: 'Controller' }] };
  const event = prop('cc.ClickEvent', { target: prop('cc.Node', { uuid: '' }), component: prop('String', ''), _componentId: prop('String', ''), handler: prop('String', ''), customEventData: prop('String', '') });
  const button = { type: 'cc.Button', value: { uuid: prop('String', 'button-comp'), clickEvents: prop('cc.ClickEvent', [], { isArray: true, elementTypeData: event }) } };
  let records = 0;
  const request = async (pkg, msg, ...args) => {
    if (msg === 'query-node-tree') return tree;
    if (msg === 'query-node') return { __comps__: [structuredClone(button)] };
    if (msg === 'query-component') return structuredClone(button);
    if (msg === 'begin-recording') { records++; return 'undo'; }
    if (msg === 'set-property') { button.value.clickEvents = structuredClone(args[0].dump); return true; }
    if (msg === 'execute-scene-script') {
      if (args[0].args[3] === 'missing') throw new Error('method missing');
      return { classId: 'script-id' };
    }
  };
  const api = createDevelopment({ request });
  const p = { node: 'Button', events: [{ target: 'Controller', component: 'Demo', handler: 'onClick' }] };
  const dry = await api.dispatch('button.events', { ...p, mode: 'replace', dryRun: true });
  assert.equal(dry.events.length, 1); assert.equal(records, 0);
  await assert.rejects(api.dispatch('button.events', { ...p, mode: 'replace', events: [{ ...p.events[0], handler: 'missing' }] }), /method missing/);
  assert.equal(records, 0);
  await api.dispatch('button.events', { ...p, mode: 'replace' });
  const again = await api.dispatch('button.events', { ...p, mode: 'append' });
  assert.equal(again.events.length, 1); assert.equal(records, 1);
  await assert.rejects(api.dispatch('button.events', { node: 'Button', mode: 'remove', index: 5 }), /range/);
  const removed = await api.dispatch('button.events', { node: 'Button', mode: 'remove', index: 0 });
  assert.equal(removed.events.length, 0);
  await api.dispatch('button.events', { ...p, mode: 'append' });
  const cleared = await api.dispatch('button.events', { node: 'Button', mode: 'clear' });
  assert.equal(cleared.events.length, 0); assert.equal(records, 4);
});

test('script attach fails without writes on timeout, source mismatch, or missing required methods', async () => {
  const mutations = [];
  let scriptUuid = 'script', registered = false;
  const request = async (pkg, msg, ...args) => {
    if (msg === 'query-node-tree') return { uuid: 'scene', name: 'Main', children: [{ uuid: 'node', name: 'Target' }] };
    if (msg === 'query-asset-info') return { uuid: 'script', importer: 'typescript', url: 'db://assets/Demo.ts' };
    if (msg === 'execute-scene-script') return { registered, scriptUuid, classId: 'id', methods: ['onClick'] };
    mutations.push(msg);
  };
  const api = createDevelopment({ request });
  const p = { node: 'Target', className: 'Demo', asset: 'db://assets/Demo.ts', timeoutMs: 0 };
  await assert.rejects(api.dispatch('script.attach', p), /did not register/);
  registered = true; scriptUuid = 'another';
  await assert.rejects(api.dispatch('script.attach', p), /another script/);
  scriptUuid = 'script';
  await assert.rejects(api.dispatch('script.attach', { ...p, requiredMethods: ['notLoadedYet'] }), /did not register/);
  assert.deepEqual(mutations, []);
});
