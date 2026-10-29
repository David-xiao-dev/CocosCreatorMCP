import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import { catalog } from '../scripts/generate-catalog.mjs';
const { execute, preflight } = createRequire(import.meta.url)('../extension/workflow.cjs');

test('generated catalog agrees with source schemas', async () => {
  assert.deepEqual(JSON.parse(await fs.readFile(new URL('../extension/operations.json', import.meta.url), 'utf8')), catalog);
});
test('all constant errors and forward references are rejected before any edit', async () => {
  let calls = 0;
  for (const bad of [
    { id: 'bad', op: 'node.create', params: { name: 7 } },
    { id: 'bad', op: 'node.create', params: { name: 'X', typo: true } },
    { id: 'bad', op: 'node.create', params: { name: 'X', parent: { $ref: 'later#' } } },
    { id: 'bad', op: 'property.set', params: { uuid: 'u', path: 'name', dump: { value: { $ref: 'later#' } } } },
    { id: 'bad', op: 'not.real', params: {} },
  ]) await assert.rejects(execute([{ id: 'create', op: 'node.create', params: { name: 'A' } }, bad], { catalog, dispatch: () => calls++ }));
  assert.equal(calls, 0);
});
test('batch refs use full results despite omitted output, and defaults are applied', async () => {
  const calls = [];
  const result = await execute([
    { id: 'create', op: 'node.create', params: { name: 'A' }, output: 'none' },
    { id: 'inspect', op: 'node.inspect', params: { uuid: { $ref: 'create#' } }, output: 'none' },
    { id: 'set', op: 'property.set', params: { uuid: { $ref: 'inspect#/uuid/value' }, path: 'name', dump: { type: 'String', value: 'B' } } },
  ], { catalog, dispatch: async (op, p) => { calls.push({ op, p }); return op === 'node.create' ? 'abc' : op === 'node.inspect' ? { uuid: { value: 'abc' } } : { applied: true }; } });
  assert.equal(result.ok, true);
  assert.equal(calls[0].p.nameIncrease, false);
  assert.equal(calls[1].p.kind, 'node');
  assert.equal(calls[2].p.uuid, 'abc');
  assert.equal(result.steps[0].result, undefined);
});
test('failure stops later writes and exposes completed/failed/skipped without claiming rollback', async () => {
  const calls = [];
  const steps = ['one', 'two', 'three'].map(id => ({ id, op: 'node.create', params: { name: id } }));
  const result = await execute(steps, { catalog, dispatch: async (op, p) => { calls.push(p.name); if (p.name === 'two') throw new Error('native failed'); return p.name; } });
  assert.equal(result.atomic, false);
  assert.equal(result.completed, 1);
  assert.equal(result.failed.id, 'two');
  assert.deepEqual(result.skipped, ['three']);
  assert.deepEqual(calls, ['one', 'two']);
});
test('dry-run does not dispatch, disabled operations reject the entire plan, and UI recursive schema is checked', async () => {
  let calls = 0;
  const steps = [{ id: 'a', op: 'node.create', params: { name: 'A' } }];
  assert.equal((await execute(steps, { catalog, dryRun: true, dispatch: () => calls++ })).dryRun, true);
  await assert.rejects(execute(steps, { catalog, dispatch: () => calls++, check: () => { throw new Error('paused'); } }), /paused/);
  assert.equal(calls, 0);
  assert.throws(() => preflight([{ id: 'ui', op: 'ui.build', params: { tree: { name: 'A', children: [{ name: 3 }] } } }], catalog), /expected string/);
});
test('bad result projections never report an applied edit as unexecuted', async () => {
  const result = await execute([{ id: 'create', op: 'node.create', params: { name: 'A' }, fields: ['/not-found'] }], { catalog, dispatch: async () => 'created-id' });
  assert.equal(result.ok, true);
  assert.equal(result.steps[0].result, 'created-id');
  assert.match(result.steps[0].outputWarning, /Operation completed/);
});
