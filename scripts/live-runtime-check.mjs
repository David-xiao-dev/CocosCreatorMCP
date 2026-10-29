import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = process.argv.indexOf('--project'), project = path.resolve(arg < 0 ? path.join(root, 'test-project') : process.argv[arg + 1]);
const client = new Client({ name: 'cocos-runtime-check', version: '0.8.0' });
const checks = [], frames = [];
let passed = false;
async function tool(name, args) {
  const out = await client.callTool({ name, arguments: args }, undefined, { timeout: 90000 });
  if (out.isError) throw new Error(out.content[0].text);
  return out;
}
async function run(op, params = {}) {
  const out = await tool('cocos_execute', { steps: [{ id: 'step', op, params, output: 'full' }] });
  return JSON.parse(out.content[0].text).result.steps[0].result;
}
async function observe(op, params = {}) { return JSON.parse((await tool('cocos_observe', { op, params, detail: 'full' })).content[0].text).result; }
const pass = message => { checks.push(message); console.log(`PASS ${message}`); };
async function waitFor(id, expected) {
  const until = Date.now() + 15000;
  let state;
  do {
    state = await observe('preview.status', { windowId: id, limit: 100 });
    if (state.page.testEvidence?.startsWith(expected) && state.page.testClickTargets) return state;
    await new Promise(resolve => setTimeout(resolve, 200));
  } while (Date.now() < until);
  throw new Error(`Runtime evidence did not reach ${expected}: ${JSON.stringify(state)}`);
}
async function capture(id, name) {
  const out = await tool('cocos_observe', { op: 'editor.screenshot', params: { windowId: id } });
  const img = out.content.find(c => c.type === 'image'); assert.ok(img);
  const filename = path.join(root, 'artifacts', name);
  await fs.writeFile(filename, Buffer.from(img.data, 'base64')); frames.push(filename);
}
async function click(id, name, expected) {
  const state = await observe('preview.status', { windowId: id });
  const targets = JSON.parse(state.page.testClickTargets || '[]');
  const target = targets.find(t => t.name === name); assert.ok(target, `visible target ${name}`);
  assert.ok(target.x > 0 && target.x < state.contentBounds.width && target.y > 0 && target.y < state.contentBounds.height, `${name} is outside visible window`);
  await run('editor.input', { windowId: id, events: [{ type: 'mouseDown', button: 'left', x: Math.round(target.x), y: Math.round(target.y) }, { type: 'mouseUp', button: 'left', x: Math.round(target.x), y: Math.round(target.y) }] });
  return waitFor(id, expected);
}
try {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'src/server.mjs'), '--project', project], stderr: 'pipe' }));
  const scene = await observe('scene.tree');
  assert.equal(scene.name, 'MCP_InteractiveDemo', 'Open the saved demo scene first.');
  for (const width of [1100, 620]) {
    const preview = await run('preview.open', { width, height: 800, testEvidence: true });
    const id = preview.windowId;
    await waitFor(id, 'Ready');
    await capture(id, `demo-runtime-${width}-menu.png`);
    await click(id, 'PlayButton', 'Playing · score 1');
    await click(id, 'PlayButton', 'Playing · score 2');
    pass(`${width}px preview: real pointer clicks increment score exactly once per click`);
    await click(id, 'SettingsButton', 'Settings opened');
    await click(id, 'BackButton', 'Ready · back to menu');
    await click(id, 'InventoryButton', 'Inventory opened');
    await capture(id, `demo-runtime-${width}-inventory.png`);
    await click(id, 'BackButton', 'Ready · back to menu');
    const state = await observe('preview.status', { windowId: id, limit: 100 });
    assert.equal(state.logs.filter(l => l.level === 3 || l.level === 'error').length, 0, JSON.stringify(state.logs));
    pass(`${width}px preview: settings/inventory/back interact correctly; no captured runtime console errors`);
  }
  const editor = (await observe('editor.windows')).find(w => w.url.includes('/windows/main.html'));
  await assert.rejects(run('preview.close', { windowId: editor.id }), /not a preview window owned/);
  pass('preview close rejects the actual Creator editor window');
  passed = true;
} finally {
  await fs.writeFile(path.join(root, 'artifacts', 'live-runtime-check.json'), JSON.stringify({ passed, time: new Date().toISOString(), project, editorVersion: '3.8.8', checks, frames, note: 'Sample supplies optional visible evidence/click target geometry; actions use real pointer events through MCP, never invoke game handlers directly. This is a sample regression, not a universal runtime inspector.' }, null, 2));
  await client.close();
  if (!passed) process.exitCode = 1;
}
