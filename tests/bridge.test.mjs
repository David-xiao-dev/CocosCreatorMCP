import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { BridgeClient } from '../src/client.mjs';
const { startBridge } = createRequire(import.meta.url)('../extension/bridge.cjs');

async function setup(t, dispatch) {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'cocos-mcp-'));
  const bridge = await startBridge({ project, version: '3.8.8', dispatch });
  t.after(async () => { await bridge.close(); await fs.rm(project, { recursive: true, force: true }); });
  const descriptor = JSON.parse(await fs.readFile(path.join(project, 'temp/cocos-mcp/connection.json'), 'utf8'));
  return { bridge, project, descriptor, client: new BridgeClient(project) };
}

test('loopback RPC authenticates, rejects browser origins and cleans up its descriptor', async t => {
  const { descriptor, client } = await setup(t, async () => null);
  for (const headers of [{}, { Authorization: `Bearer ${descriptor.token}`, Origin: 'http://evil.example' }]) {
    const response = await fetch(descriptor.url, { method: 'POST', headers, body: '{}' });
    assert.equal(response.status, 401);
  }
  assert.equal((await client.call('status')).result.editorVersion, '3.8.8');
});

test('concurrent edits serialize, a failure does not poison the queue, and duplicate writes are rejected', async t => {
  const order = [];
  const { client, descriptor } = await setup(t, async (action, p) => {
    order.push(`start:${p.n}`);
    await new Promise(resolve => setTimeout(resolve, 20));
    order.push(`end:${p.n}`);
    if (p.fail) throw new Error('edit failed');
    return p.n;
  });
  const results = await Promise.allSettled([client.call('edit', { n: 1, fail: true }), client.call('edit', { n: 2 })]);
  assert.equal(results[0].status, 'rejected');
  assert.equal(results[1].value.result, 2);
  // Concurrent HTTP connections can arrive in either order; edits must never overlap.
  assert.deepEqual([order[0], order[2]].sort(), ['start:1', 'start:2']);
  assert.equal(order[1], order[0].replace('start:', 'end:'));
  assert.equal(order[3], order[2].replace('start:', 'end:'));
  const requestId = randomUUID();
  const envelope = JSON.stringify({ requestId, action: 'edit', params: { n: 3 } });
  const options = { method: 'POST', headers: { Authorization: `Bearer ${descriptor.token}` }, body: envelope };
  assert.equal((await fetch(descriptor.url, options)).status, 200);
  assert.equal((await fetch(descriptor.url, options)).status, 409);
  assert.equal((await client.call('operation.status', { requestId })).result.state, 'completed');
  assert.deepEqual(order.slice(-2), ['start:3', 'end:3']);
});

test('timed-out edits remain observable while running and after completion', async t => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const { client } = await setup(t, async () => pending);
  let failure;
  try { await client.call('edit', {}, { timeout: 100 }); } catch (error) { failure = error; }
  assert.ok(failure?.requestId);
  assert.match(failure.message, /do not blindly retry/);
  assert.equal((await client.call('operation.status', { requestId: failure.requestId })).result.state, 'running');
  finish({ applied: true });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal((await client.call('operation.status', { requestId: failure.requestId })).result.state, 'completed');
});

test('non-JSON results fail cleanly and the next operation succeeds', async t => {
  const cyclic = {}; cyclic.self = cyclic;
  const { client } = await setup(t, async action => action === 'bad' ? cyclic : { ok: true });
  await assert.rejects(client.call('bad'), /circular/i);
  assert.deepEqual((await client.call('good')).result, { ok: true });
});
