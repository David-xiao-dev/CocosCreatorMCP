'use strict';
const http = require('http');
const { timingSafeEqual, randomBytes } = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_BODY = 2 * 1024 * 1024;
const MAX_RESPONSE = 24 * 1024 * 1024;
const IMMEDIATE = new Set(['status', 'operation.status', 'events']);

function jsonValue(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

async function startBridge({ project, version, dispatch, controls = () => ({}) }) {
  project = fs.realpathSync(project);
  const token = randomBytes(32).toString('hex');
  const descriptor = path.join(project, 'temp', 'cocos-mcp', 'connection.json');
  const operations = new Map();
  const events = [];
  let sequence = 0;
  let queue = Promise.resolve();
  const traffic = { requests: 0, requestBytes: 0, responseBytes: 0 };
  const event = (type, data) => {
    events.push({ sequence: ++sequence, time: new Date().toISOString(), type, data: jsonValue(data) });
    if (events.length > 500) events.shift();
  };
  const getStatus = () => ({ protocol: 1, project, editorVersion: version, pid: process.pid, operations: operations.size, controls: controls() });
  const perform = async (action, params) => {
    if (action === 'status') return getStatus();
    if (action === 'events') {
      const after = params.after ?? 0;
      return { events: events.filter(e => e.sequence > after), latest: sequence, oldest: events[0]?.sequence ?? sequence };
    }
    if (action === 'operation.status') {
      const operation = operations.get(params.requestId);
      if (!operation) throw new Error('Unknown operation; it may have expired from the 200-entry history.');
      return operation;
    }
    return dispatch(action, params);
  };
  function send(res, status, value) {
    if (res.destroyed || res.writableEnded) return;
    let body;
    try {
      body = JSON.stringify(value);
      if (Buffer.byteLength(body) > MAX_RESPONSE) throw new Error('Response exceeds 24 MiB; narrow the query.');
    } catch (error) {
      status = 500;
      body = JSON.stringify({ ok: false, error: error.message });
    }
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    traffic.responseBytes += Buffer.byteLength(body);
    res.end(body);
  }
  const server = http.createServer(async (req, res) => {
    // This is a privileged local RPC endpoint, never a browser-facing web service.
    const expected = Buffer.from(`Bearer ${token}`);
    const received = Buffer.from(req.headers.authorization || '');
    if (req.headers.origin || received.length !== expected.length || !timingSafeEqual(received, expected)) {
      req.resume();
      return send(res, 401, { ok: false, error: 'Local bridge authentication failed.' });
    }
    if (req.method !== 'POST' || req.url !== '/rpc') {
      req.resume();
      return send(res, 404, { ok: false, error: 'Unknown endpoint.' });
    }
    try {
      const chunks = [];
      let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > MAX_BODY) {
          req.resume();
          return send(res, 413, { ok: false, error: 'Request exceeds 2 MiB.' });
        }
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      traffic.requests++; traffic.requestBytes += length;
      const { action, params = {}, requestId } = body;
      if (typeof action !== 'string' || !params || typeof params !== 'object' || Array.isArray(params) ||
          typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(requestId)) {
        return send(res, 400, { ok: false, error: 'Invalid RPC envelope.' });
      }
      if (IMMEDIATE.has(action)) {
        return send(res, 200, { ok: true, requestId, result: jsonValue(await perform(action, params)) });
      }
      if (operations.has(requestId)) return send(res, 409, { ok: false, requestId, error: 'Duplicate request ID. Inspect operation.status instead of retrying.' });
      // Evict only finished operations. Never lose track of an in-flight edit.
      if (operations.size >= 200) {
        const finished = [...operations].find(([, value]) => ['completed', 'failed'].includes(value.state));
        if (finished) operations.delete(finished[0]);
        else return send(res, 429, { ok: false, requestId, error: 'Operation queue is full.' });
      }
      const record = { requestId, action, state: 'queued', queuedAt: new Date().toISOString() };
      operations.set(requestId, record);
      const run = queue.then(async () => {
        record.state = 'running';
        record.startedAt = new Date().toISOString();
        event('operation.started', { requestId, action });
        try {
          const result = jsonValue(await perform(action, params));
          record.state = result?.ok === false ? 'failed' : 'completed';
          if (result?.ok === false) record.error = result.failed?.error || 'Workflow reported failure.';
          // Avoid retaining screenshots and large inspector dumps in operation history.
          record.resultAvailable = false;
          event(`operation.${record.state}`, { requestId, action });
          return result;
        } catch (error) {
          record.state = 'failed';
          record.error = error.message || String(error);
          event('operation.failed', { requestId, action, error: record.error });
          throw error;
        } finally {
          record.finishedAt = new Date().toISOString();
        }
      });
      queue = run.catch(() => {});
      try { send(res, 200, { ok: true, requestId, result: await run }); }
      catch (error) { send(res, 500, { ok: false, requestId, error: error.message || String(error) }); }
    } catch (error) {
      send(res, 400, { ok: false, error: error.message || String(error) });
    }
  });
  server.requestTimeout = 30_000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const connection = { ...getStatus(), url: `http://127.0.0.1:${server.address().port}/rpc`, token };
  try {
    fs.mkdirSync(path.dirname(descriptor), { recursive: true });
    fs.writeFileSync(descriptor, JSON.stringify(connection, null, 2), { mode: 0o600 });
  } catch (error) {
    await new Promise(resolve => server.close(resolve));
    throw error;
  }
  return {
    event, getStatus,
    runLocal(action, params = {}) {
      const requestId = require('crypto').randomUUID();
      return new Promise((resolve, reject) => {
        const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: '/rpc', method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }, res => {
          const chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => {
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
              if (!body.ok) throw new Error(body.error);
              resolve(body);
            } catch (error) { reject(error); }
          });
        });
        req.on('error', reject);
        req.setTimeout(90_000, () => req.destroy(new Error(`Request timed out. Inspect requestId=${requestId} before retrying.`)));
        req.end(JSON.stringify({ requestId, action, params }));
      });
    },
    dashboard() {
      const history = [...operations.values()].slice(-30).reverse();
      const counts = { queued: 0, running: 0, completed: 0, failed: 0 };
      for (const op of operations.values()) counts[op.state]++;
      return { ...getStatus(), history, counts, traffic: { ...traffic }, latestEvent: sequence };
    },
    async close() {
      try {
        if (JSON.parse(fs.readFileSync(descriptor, 'utf8')).token === token) fs.unlinkSync(descriptor);
      } catch (error) { if (error.code !== 'ENOENT') console.warn('[Cocos MCP] Connection descriptor cleanup:', error.message); }
      server.closeIdleConnections?.();
      await new Promise(resolve => server.close(resolve));
    },
  };
}

module.exports = { startBridge };
