'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { randomUUID, createHash } = require('crypto');
const { contained } = require('./resource-store.cjs');
const terminal = new Set(['success', 'failure', 'cancel']);
function hashFile(file) {
  const hash = createHash('sha256'), buffer = Buffer.alloc(1024 * 1024), fd = fs.openSync(file, 'r');
  try { let length; while ((length = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, length)); }
  finally { fs.closeSync(fd); }
  return hash.digest('hex');
}
function createBuild({ request, project, openPreview }) {
  const servers = new Map();
  const base = () => path.join(project(), 'local', 'cocos-mcp', 'build-runs');
  const outputBase = () => path.join(project(), 'build', 'cocos-mcp');
  function save(run) { fs.mkdirSync(base(), { recursive: true }); fs.writeFileSync(path.join(base(), `${run.runId}.json`), JSON.stringify(run, null, 2)); }
  function read(id) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid build run id.');
    const run = JSON.parse(fs.readFileSync(path.join(base(), `${id}.json`), 'utf8'));
    if (run.runId !== id || run.outputName !== `web-${id}` || !['web-desktop', 'web-mobile'].includes(run.platform)) throw new Error('Invalid build run manifest.');
    return run;
  }
  async function status(runId) {
    const run = read(runId), tasks = await request('builder', 'query-tasks-info');
    const matches = (tasks.list || []).filter(t => t.options?.outputName === run.outputName && t.options?.buildPath === 'project://build/cocos-mcp');
    if (matches.length !== 1) return { runId, state: matches.length ? 'ambiguous' : 'unknown', terminal: false, artifactVerified: false, note: 'Task not uniquely present in Creator history. Do not resubmit blindly.' };
    const t = matches[0];
    if (run.taskId && run.taskId !== t.id) throw new Error('Build task identity changed.');
    if (!run.taskId) { run.taskId = t.id; save(run); }
    return { runId, taskId: t.id, platform: run.platform, state: t.state, terminal: terminal.has(t.state), progress: t.progress, stage: t.stage, message: t.message, detail: String(t.detailMessage || '').slice(-2000), outputPath: path.join(outputBase(), run.outputName), logDest: t.options?.logDest || null, artifactVerified: false };
  }
  async function artifacts(p) {
    const run = read(p.runId), state = await status(p.runId), directory = path.join(outputBase(), run.outputName);
    if (!state.terminal || state.state !== 'success') throw new Error(`Build is ${state.state}; successful terminal state required before artifact verification.`);
    if (!fs.existsSync(directory)) throw new Error('Creator reported success but output directory is missing.');
    contained(outputBase(), directory);
    const files = []; let bytes = 0;
    function walk(dir) {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, item.name);
        if (item.isSymbolicLink()) throw new Error('Build artifacts contain a symlink; inspect before serving.');
        if (item.isDirectory()) walk(file);
        else {
          if (files.length >= 20000) throw new Error('Artifact inventory exceeds 20000 files.');
          const size = fs.statSync(file).size; bytes += size;
          files.push({ path: path.relative(directory, file).replace(/\\/g, '/'), bytes: size, ...(p.hashes ? { sha256: hashFile(file) } : {}) });
        }
      }
    }
    walk(directory);
    const index = files.find(f => f.path === 'index.html');
    if (!index || !index.bytes || !files.some(f => /\.js$/.test(f.path))) throw new Error('Output is missing a nonempty index.html or JavaScript files.');
    return { runId: run.runId, platform: run.platform, outputPath: directory, state: state.state, artifactVerified: true, files: files.slice(0, p.limit), fileCount: files.length, totalBytes: bytes, truncated: files.length > p.limit, hashes: !!p.hashes, scope: 'Native success + file inventory/entry point; run build.preview and runtime checks to prove startup/gameplay.' };
  }
  async function serve(runId) {
    if (servers.has(runId)) return servers.get(runId).url;
    const data = await artifacts({ runId, hashes: false, limit: 1 }), directory = data.outputPath;
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.bin': 'application/octet-stream', '.ttf': 'font/ttf', '.ogg': 'audio/ogg' };
    const server = http.createServer((req, res) => {
      try {
        if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
        const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
        if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').includes('..')) { res.writeHead(403).end(); return; }
        let file = path.join(directory, pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''));
        if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
        if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
        contained(directory, file);
        const size = fs.statSync(file).size;
        res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Content-Length': size, 'Cache-Control': 'no-store', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' });
        if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
      } catch { if (!res.headersSent) res.writeHead(403); res.end(); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const url = `http://127.0.0.1:${server.address().port}/`;
    servers.set(runId, { server, url }); return url;
  }
  return { async dispose() { for (const item of servers.values()) { item.server.closeAllConnections?.(); item.server.close(); } servers.clear(); }, async dispatch(action, p) {
    if (action === 'build.platforms') {
      const config = await request('builder', 'query-platform-config');
      return { platforms: config.order.map(id => ({ id, native: config.native.includes(id), dedicatedWorkflow: ['web-desktop', 'web-mobile'].includes(id) })), scope: 'Web dedicated workflow implemented; other installed platforms require their own SDK/toolchain acceptance.' };
    }
    if (action === 'build.start') {
      if (await request('scene', 'query-dirty')) throw new Error('Save the current scene/prefab explicitly before building.');
      if (!await request('asset-db', 'query-ready')) throw new Error('AssetDB is not ready.');
      const scenes = [];
      for (const input of p.scenes) {
        const info = await request('asset-db', 'query-asset-info', input);
        if (info?.type !== 'cc.SceneAsset' || !info.url.startsWith('db://assets/')) throw new Error(`Expected a project scene: ${input}`);
        if (scenes.some(s => s.uuid === info.uuid)) throw new Error('Build scenes must be unique.');
        scenes.push({ url: info.url, uuid: info.uuid });
      }
      const start = p.startScene ? await request('asset-db', 'query-asset-info', p.startScene) : { uuid: scenes[0].uuid };
      if (!scenes.some(s => s.uuid === start?.uuid)) throw new Error('Start scene must be in the scene list.');
      const runId = randomUUID(), outputName = `web-${runId}`;
      const options = { platform: p.platform, taskName: `Cocos MCP ${runId}`, name: 'Cocos MCP Web', buildPath: 'project://build/cocos-mcp', outputName, scenes, startScene: start.uuid, debug: p.debug, sourceMaps: p.sourceMaps, md5Cache: false };
      if (p.dryRun) return { dryRun: true, options, createsOutput: path.join(outputBase(), outputName) };
      const tasks = await request('builder', 'query-tasks-info');
      if ((tasks.list || []).some(t => ['waiting','processing'].includes(t.state))) throw new Error('Another Creator build is queued/running. Poll it before starting a new build.');
      save({ runId, outputName, platform: p.platform, createdAt: new Date().toISOString(), options });
      try { await request('builder', 'add-task', options, false); }
      catch (error) { throw new Error(`${error.message} Build submission uncertain; inspect build.status runId=${runId} before resubmitting.`); }
      return { ...await status(runId), accepted: true, note: 'Accepted is not finished. Poll status, verify artifacts, then launch and test the built game.' };
    }
    if (action === 'build.status') return status(p.runId);
    if (action === 'build.artifacts') return artifacts(p);
    if (action === 'build.logs') {
      const state = await status(p.runId);
      if (!state.logDest) return { runId: p.runId, available: false, lines: [] };
      if (!state.logDest.startsWith('project://temp/builder/log/')) throw new Error('Unsupported native build log location.');
      const file = path.join(project(), state.logDest.slice('project://'.length));
      if (!fs.existsSync(file)) return { runId: p.runId, available: false, lines: [] };
      contained(path.join(project(), 'temp', 'builder', 'log'), file);
      const size = fs.statSync(file).size, offset = Math.max(0, size - 128 * 1024), data = Buffer.alloc(size - offset), fd = fs.openSync(file, 'r');
      try { fs.readSync(fd, data, 0, data.length, offset); } finally { fs.closeSync(fd); }
      const lines = data.toString('utf8').split(/\r?\n/).filter(line => !p.filter || line.toLowerCase().includes(p.filter.toLowerCase()));
      return { runId: p.runId, available: true, logDest: state.logDest, totalBytes: size, tailBytes: data.length, lines: lines.slice(-p.limit), tailOnly: offset > 0 };
    }
    if (action === 'build.preview') {
      const url = new URL(await serve(p.runId));
      if (p.testEvidence) url.searchParams.set('mcp-test', '1');
      return { runId: p.runId, ...await openPreview(url, p), artifact: true };
    }
    if (action === 'build.stopServer') {
      read(p.runId); const item = servers.get(p.runId);
      if (item) { item.server.closeAllConnections?.(); await new Promise(resolve => item.server.close(resolve)); servers.delete(p.runId); }
      return { runId: p.runId, stopped: !!item, note: 'Static server stopped; build files and Creator tasks are preserved.' };
    }
    throw new Error(`Unknown build operation: ${action}`);
  } };
}
module.exports = { createBuild };
