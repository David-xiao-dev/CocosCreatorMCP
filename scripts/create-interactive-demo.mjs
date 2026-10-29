import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { demoTree } from '../examples/interactive-demo/tree.mjs';
import { emptyScene } from './lib/empty-scene.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arg = process.argv.indexOf('--project');
const project = path.resolve(arg < 0 ? path.join(root, 'test-project') : process.argv[arg + 1]);
const client = new Client({ name: 'cocos-interactive-demo', version: '0.8.0' });
const checks = [];
let passed = false, createdScene = false;
const sceneUrl = 'db://assets/MCP_InteractiveDemo.scene', scriptUrl = 'db://assets/McpInteractiveDemo.ts';
const artifact = path.join(root, 'artifacts', 'interactive-demo.json');
const results = {};
async function tool(name, args) {
  const out = await client.callTool({ name, arguments: args }, undefined, { timeout: 90000 });
  const body = JSON.parse(out.content[0].text);
  if (out.isError) throw new Error(JSON.stringify(body));
  return body.result;
}
const observe = (op, params = {}) => tool('cocos_observe', { op, params, detail: 'full' });
async function execute(steps) {
  const result = await tool('cocos_execute', { steps });
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.steps;
}
const run = async (op, params = {}) => (await execute([{ id: 'step', op, params, output: 'full' }]))[0].result;
const request = (pkg, message, ...args) => run('editor.request', { package: pkg, message, args });
const pass = message => { checks.push(message); console.log(`PASS ${message}`); };
try {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'src/server.mjs'), '--project', project], stderr: 'pipe' }));
  const status = await tool('cocos_status', {});
  if (path.relative(project, status.project) !== '' || status.editorVersion !== '3.8.8') throw new Error('Expected the requested Creator 3.8.8 project.');
  const original = await observe('scene.tree'); results.original = original.uuid;
  const existingScene = await request('asset-db', 'query-asset-info', sceneUrl);
  const resume = !!existingScene && process.argv.includes('--resume') && original.uuid === existingScene.uuid;
  if (await request('scene', 'query-dirty') && !resume) throw new Error('Current scene has unsaved changes. Save them before creating the demo.');
  if (existingScene && !resume) throw new Error(`${sceneUrl} exists. This command never overwrites it. To continue an interrupted setup, open that scene and pass --resume.`);
  const source = await request('asset-db', 'query-asset-info', original.uuid);
  if (!source?.file) throw new Error('Open a saved source scene before generating the standalone demo.');
  const script = await fs.readFile(path.join(root, 'examples/interactive-demo/McpInteractiveDemo.ts'), 'utf8');
  const existing = await request('asset-db', 'query-asset-info', scriptUrl);
  if (existing && !resume && !process.argv.includes('--update-script')) throw new Error(`${scriptUrl} exists. Refusing overwrite; use --update-script only if this is the demo's own script.`);
  results.script = existing && resume && !process.argv.includes('--update-script') ? existing : await run('asset.write', { url: scriptUrl, content: script, mode: existing ? 'save' : 'create' });
  if (!resume) {
    await run('asset.write', { url: sceneUrl, content: emptyScene(await fs.readFile(source.file, 'utf8'), 'MCP_InteractiveDemo'), mode: 'create' });
    createdScene = true;
    await run('scene.open', { asset: sceneUrl });
  }
  const built = resume ? { root: (await observe('node.resolve', { target: 'Canvas/InteractiveDemo' })).uuid } : await run('ui.build', { tree: demoTree }); results.root = built.root;
  pass('UI generated through MCP in a standalone project scene, with native Canvas and camera');
  const attach = await run('script.attach', { node: built.root, className: 'McpInteractiveDemo', asset: scriptUrl, timeoutMs: 25000, requiredMethods: ['onPlay', 'onSettings', 'onInventory', 'onBack'] }); results.component = attach.component;
  const again = await run('script.attach', { node: built.root, className: 'McpInteractiveDemo', asset: scriptUrl });
  if (again.added || again.component !== attach.component) throw new Error('Script attach duplicated the component.');
  pass('script registration and source ownership verified; attach is idempotent');
  const base = 'Canvas/InteractiveDemo';
  await run('component.patch', { node: base, component: 'McpInteractiveDemo', properties: {
    statusLabel: { $component: { node: `${base}/Status`, type: 'cc.Label' } },
    settingsPanel: { $node: `${base}/SettingsPanel` }, inventoryPanel: { $node: `${base}/InventoryPanel` },
    actionButtons: ['PlayButton', 'SettingsButton', 'InventoryButton'].map(name => ({ $node: `${base}/${name}` })),
  } });
  const properties = await observe('component.properties', { node: base, component: 'McpInteractiveDemo' });
  if (properties.properties.actionButtons.value.length !== 3) throw new Error('Array reference binding failed.');
  results.references = properties;
  pass('typed Label, Node and Node[] references bound and read back');
  for (const [node, handler] of [['PlayButton', 'onPlay'], ['SettingsButton', 'onSettings'], ['InventoryButton', 'onInventory'], ['SettingsPanel/BackButton', 'onBack'], ['InventoryPanel/BackButton', 'onBack']]) {
    const events = [{ target: base, component: 'McpInteractiveDemo', handler }];
    await run('button.events', { node: `${base}/${node}`, mode: 'replace', events });
    const append = await run('button.events', { node: `${base}/${node}`, mode: 'append', events });
    if (append.events.length !== 1) throw new Error('Identical append created duplicate events.');
  }
  pass('five real Button event lists bound; identical append does not duplicate handlers');
  const before = await observe('component.properties', { node: base, component: 'McpInteractiveDemo' });
  try { await run('component.patch', { node: base, component: 'McpInteractiveDemo', properties: { statusLabel: { $node: `${base}/Title` } } }); throw new Error('Invalid component reference was accepted.'); }
  catch (e) { if (!e.message.includes('not a project cc.Label')) throw e; }
  const after = await observe('component.properties', { node: base, component: 'McpInteractiveDemo' });
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Rejected reference changed the component.');
  pass('wrong reference type rejected before editing');
  await run('scene.save');
  if (resume) await request('scene', 'close-scene');
  else await run('scene.open', { asset: results.original });
  await run('scene.open', { asset: sceneUrl });
  const reopened = await observe('component.properties', { node: base, component: 'McpInteractiveDemo' });
  if (JSON.stringify(reopened.properties) !== JSON.stringify(properties.properties)) throw new Error('References changed after reopen.');
  const event = await observe('component.properties', { node: `${base}/PlayButton`, component: 'cc.Button', names: ['clickEvents'] });
  if (event.properties.clickEvents.value.length !== 1 || event.properties.clickEvents.value[0].handler !== 'onPlay') throw new Error('Event did not survive scene reopen.');
  pass('script, typed references and events persist after save and scene reopen');
  await request('cocos-codex-bridge', 'locate-ui', built.root);
  const window = (await observe('editor.windows')).find(w => w.url.includes('/windows/main.html'));
  const shot = await observe('editor.screenshot', { windowId: window.id, maxWidth: 1600 }).catch(() => null);
  if (shot?.data) await fs.writeFile(path.join(root, 'artifacts', 'interactive-demo-editor.png'), Buffer.from(shot.data, 'base64'));
  results.preview = await request('preview', 'query-preview-url');
  console.log('PREVIEW', JSON.stringify(results.preview));
  passed = true;
} finally {
  await fs.mkdir(path.dirname(artifact), { recursive: true });
  await fs.writeFile(artifact, JSON.stringify({ passed, createdScene, project, sceneUrl, time: new Date().toISOString(), checks, ...results }, null, 2));
  await client.close();
  if (!passed) process.exitCode = 1;
}
