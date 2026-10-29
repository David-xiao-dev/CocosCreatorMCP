import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { BridgeClient } from '../src/client.mjs';
import { readZip } from './zip.mjs';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const project = path.join(root, 'test-project'); // Never accept arbitrary game projects.
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const bridge = new BridgeClient(project, { timeout: 10000 });
const script = async (code, args = {}) => (await bridge.call('editor.script', { context: 'main', code, args })).result;
const before = await script('return {dirty:await Editor.Message.request("scene","query-dirty"),tree:await Editor.Message.request("scene","query-node-tree")};');
const directory = path.join(project, 'extensions/cocos-codex-bridge');
const backupRoot = path.join(root, 'artifacts/extension-install-backups');
await fs.mkdir(backupRoot, { recursive: true });
const staging = await fs.mkdtemp(path.join(backupRoot, 'stage-'));
const backup = path.join(staging, 'previous-extension');
const reportFile = path.join(staging, 'reload.json');
const archive = readZip(await fs.readFile(path.join(root, `artifacts/releases/cocos-creator-mcp-${pkg.version}-extension.zip`)));
for (const dirname of new Set([...archive.keys()].map(name => path.dirname(path.join(staging, name))))) await fs.mkdir(dirname, { recursive: true });
const entries = [...archive];
for (let i = 0; i < entries.length; i += 32) await Promise.all(entries.slice(i, i + 32).map(([name, data]) => fs.writeFile(path.join(staging, name), data)));
// Schedule after the RPC response is delivered: unloading the bridge inside its
// own active request would otherwise close the response being awaited.
await script(`
const fs = require('fs/promises');
setTimeout(async () => {
  let moved = false, installed = false;
  try {
    await Editor.Package.disable(args.directory, {replacement:true});
    await fs.rename(args.directory,args.backup); moved=true;
    await fs.rename(args.extracted,args.directory); installed=true;
    await Editor.Package.enable(args.directory);
    await fs.writeFile(args.report,JSON.stringify({reloaded:true}));
  } catch(error) {
    try {
      if(installed) { await Editor.Package.disable(args.directory,{replacement:true}); await fs.rename(args.directory,args.extracted); }
      if(moved) await fs.rename(args.backup,args.directory);
      await Editor.Package.enable(args.directory);
      await fs.writeFile(args.report,JSON.stringify({reloaded:false,restored:true,error:error.message}));
    } catch(restore) { await fs.writeFile(args.report,JSON.stringify({reloaded:false,error:error.message,restoreError:restore.message})); }
  }
},250);
return {scheduled:true};`, { directory, backup, extracted: path.join(staging, 'cocos-codex-bridge'), report: reportFile });
let reload;
for (let i = 0; i < 60; i++) {
  try { reload = JSON.parse(await fs.readFile(reportFile, 'utf8')); break; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await new Promise(resolve => setTimeout(resolve, 500));
}
assert.ok(reload?.reloaded, JSON.stringify(reload || { error: 'Extension reload timed out', backup }));
const dashboard = (await bridge.call('editor.request', { package: 'cocos-codex-bridge', message: 'dashboard' })).result;
assert.equal(dashboard.installationReady, true); assert.equal(dashboard.installationMode, 'complete-extension');
assert.equal(dashboard.mcpVersion, pkg.version);
assert.equal(dashboard.config.mcpServers.cocos_creator.env.ELECTRON_RUN_AS_NODE, '1');
await assert.rejects(fs.access(path.join(directory, 'installation.json')));
const client = new Client({ name: 'live-complete-extension-check', version: '1' });
try {
  const entry = dashboard.config.mcpServers.cocos_creator;
  await client.connect(new StdioClientTransport({ command: entry.command, args: entry.args, env: { ...process.env, PATH: '', ...entry.env }, stderr: 'pipe', cwd: staging }));
  assert.equal((await client.listTools()).tools.length, 4);
  const status = JSON.parse((await client.callTool({ name: 'cocos_status', arguments: {} })).content[0].text).result;
  assert.equal(status.project, project); assert.equal(status.editorVersion, '3.8.8');
  const result = await client.callTool({ name: 'cocos_observe', arguments: { op: 'scene.tree', detail: 'full' } });
  assert.ok(!result.isError, JSON.stringify(result));
  assert.deepEqual(JSON.parse(result.content[0].text).result, before.tree);
} finally { await client.close(); }
const after = await script('return {dirty:await Editor.Message.request("scene","query-dirty"),tree:await Editor.Message.request("scene","query-node-tree")};');
assert.equal(after.dirty, before.dirty); assert.deepEqual(after.tree, before.tree);
const report = { passed: true, time: new Date().toISOString(), version: pkg.version, platform: process.platform, project, backup, checks: ['actual editor disable/extract/enable', 'no installation.json', 'panel dashboard emits complete client config', 'actual Creator runtime STDIO with empty PATH', 'four MCP tools', 'status and real scene tree', 'scene tree and dirty state preserved'] };
await fs.writeFile(path.join(root, 'artifacts/live-extension-check.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
