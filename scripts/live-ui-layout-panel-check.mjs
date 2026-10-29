import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BridgeClient } from '../src/client.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const client = new BridgeClient(path.join(root, 'test-project'));
const call = async (action, params = {}) => (await client.call(action, params)).result;
let windowId;
const checks = [];
const pass = value => { checks.push(value); console.log(`PASS ${value}`); };
async function dom(expression) {
  const source = `(()=>{function find(r){const a=r.querySelector('#app');if(a)return a;for(const e of r.querySelectorAll('*'))if(e.shadowRoot){const a=find(e.shadowRoot);if(a)return a;}}const root=find(document);if(!root)return null;return (${expression});})()`;
  return call('editor.script', { context: 'main', code: `return require('electron').BrowserWindow.fromId(${windowId}).webContents.executeJavaScript(${JSON.stringify(source)});` });
}
const input = params => call('editor.input', { windowId, ...params });
async function click(selector) {
  const position = await dom(`(()=>{const e=root.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Panel control not found');const r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),disabled:e.disabled};})()`);
  assert.equal(position.disabled, false);
  await input({ events: [{ type: 'mouseDown', x: position.x, y: position.y, button: 'left' }, { type: 'mouseUp', x: position.x, y: position.y, button: 'left' }] });
}
async function fill(selector, value) {
  await click(selector);
  await input({ events: [{ type: 'keyDown', keyCode: 'A', modifiers: ['control'] }, { type: 'keyUp', keyCode: 'A', modifiers: ['control'] }] });
  await input({ text: String(value) });
  assert.equal(await dom(`root.querySelector(${JSON.stringify(selector)}).value`), String(value));
}
try {
  await call('editor.panel', { name: 'cocos-codex-bridge' });
  for (const w of (await call('editor.windows')).filter(w => w.visible && !w.minimized)) {
    windowId = w.id;
    if (await dom('!!root.querySelector("#uilayout")')) break;
    windowId = undefined;
  }
  assert.ok(windowId, 'MCP panel window not found');
  await click('[data-page="uilayout"]');
  await fill('#layout-node', 'Canvas/TypographyDemo');
  await fill('#layout-properties', JSON.stringify({ type: 'VERTICAL', resizeMode: 'CHILDREN', spacingY: 8 }));
  await click('[data-ui-layout="configure"][data-dry="true"]');
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && !(await dom('root.querySelector("#ui-layout-result").textContent.includes("wouldAdd")'))) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(await dom('root.querySelector("#ui-layout-result").textContent.includes("wouldAdd")'), true);
  pass('Creator UI adaptation panel accepts a target and semantic JSON, then shows a read-only dry-run plan');
  await fs.writeFile(path.join(root, 'artifacts/ui-layout-panel.png'), Buffer.from((await call('editor.screenshot', { windowId })).data, 'base64'));
} finally {
  await fs.writeFile(path.join(root, 'artifacts/live-ui-layout-panel-check.json'), JSON.stringify({ passed: checks.length > 0, time: new Date().toISOString(), checks }, null, 2));
  if (!checks.length) process.exitCode = 1;
}
