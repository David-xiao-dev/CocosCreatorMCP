'use strict';
const fs = require('fs');
const path = require('path');
const { startBridge } = require('./bridge.cjs');
const workflow = require('./workflow.cjs');
const catalog = require('./operations.json');
const { createFeatures } = require('./features.cjs');
const { createDevelopment } = require('./development.cjs');
const { createPrefabs } = require('./prefab.cjs');
const { createResources } = require('./resources.cjs');
const { createAnimation } = require('./animation.cjs');
const { createBuild } = require('./build.cjs');
const { createTypography } = require('./typography.cjs');
const { createEditorView } = require('./editor-view.cjs');
const { createUILayout } = require('./ui-layout.cjs');
const runtimeBrowser = require('./runtime-browser.cjs');
const { connection } = require('./connection.cjs');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
let bridge;
const previewWindows = new Map();
const previewLogs = new Map();
const previewOrigins = new Map();
let settings = { paused: false, allowScripts: true };
const settingsFile = () => path.join(Editor.Project.path, 'local', 'cocos-mcp', 'settings.json');
function check(action) {
  if (action === 'workflow.execute') return;
  const op = catalog.find(item => item.action === action);
  if (settings.paused && !op?.readOnly) throw new Error('Editor writes are paused in the Cocos MCP control panel.');
  if (!settings.allowScripts && ['editor.script', 'editor.request'].includes(action)) throw new Error('Advanced script/message access is disabled in the Cocos MCP control panel.');
}
const features = createFeatures({ request: (...args) => request(...args), dispatch: (...args) => dispatch(...args) });
const development = createDevelopment({ request: (...args) => request(...args) });
const prefabs = createPrefabs({ request: (...args) => request(...args), project: () => Editor.Project.path });
const resources = createResources({ request: (...args) => request(...args), project: () => Editor.Project.path });
const animation = createAnimation({ request: (...args) => request(...args), project: () => Editor.Project.path, dispatch: (...args) => dispatch(...args) });
const build = createBuild({ request: (...args) => request(...args), project: () => Editor.Project.path, openPreview: (...args) => openPreviewUrl(...args) });
const typography = createTypography({request:(...args)=>request(...args),dispatch:(...args)=>dispatch(...args)});
const editorView = createEditorView({request:(...args)=>request(...args)});
const uiLayout = createUILayout({dispatch:(...args)=>dispatch(...args)});

const request = (pkg, message, ...args) => Editor.Message.request(pkg, message, ...args);
const clean = value => value === undefined ? null : JSON.parse(JSON.stringify(value));

function projectPath(relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative)) throw new Error('Use a project-relative path.');
  const root = fs.realpathSync(Editor.Project.path);
  const resolved = fs.realpathSync(path.resolve(root, relative));
  const rel = path.relative(root, resolved);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error('Path escapes the project, including through a symlink.');
  if (rel === 'temp' || rel.startsWith(`temp${path.sep}`)) throw new Error('temp/ is internal; use editor_events for bridge events.');
  return resolved;
}

function electron() { return require('electron'); }
function getWindow(id) {
  const win = electron().BrowserWindow.fromId(id);
  if (!win || win.isDestroyed()) throw new Error(`Editor window ${id} is closed or unavailable.`);
  return win;
}

async function messages(params) {
  const packages = Editor.Package.getPackages();
  const list = Array.isArray(packages) ? packages : Object.values(packages);
  const result = [];
  for (const pkg of list) {
    if (pkg.enable === false || pkg.invalid) continue;
    const info = pkg.info || pkg.package || (pkg.path ? JSON.parse(fs.readFileSync(path.join(pkg.path, 'package.json'), 'utf8')) : pkg);
    const name = info.name || pkg.name;
    if (params.package && name !== params.package) continue;
    for (const [message, metadata] of Object.entries(info.contributions?.messages || {})) {
      if (params.filter && !`${name}:${message}`.toLowerCase().includes(params.filter.toLowerCase())) continue;
      if (params.publicOnly && !metadata.public) continue;
      const entry = { package: name, message, public: !!metadata.public };
      for (const key of ['description', 'doc', 'example']) {
        if (metadata[key]) entry[key] = metadata[key].startsWith('i18n:') ? Editor.I18n.t(metadata[key].slice(5)) : metadata[key];
      }
      result.push(entry);
    }
  }
  const offset = params.offset || 0;
  const limit = Math.min(params.limit || 100, 500);
  return { total: result.length, offset, messages: result.slice(offset, offset + limit) };
}

function menuItems(menu, parent = []) {
  return (menu?.items || []).map((item, index) => {
    const route = [...parent, index];
    return { path: route, label: item.label, type: item.type, enabled: item.enabled, visible: item.visible,
      accelerator: item.accelerator, children: menuItems(item.submenu, route) };
  });
}

async function openPreviewUrl(url, p) {
  let win = [...previewWindows.values()].find(w => !w.isDestroyed());
  if (!win) {
    win = new (electron().BrowserWindow)({ width: p.width || 1100, height: p.height || 800, show: true, title: 'Cocos MCP · Game Preview', webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
    previewWindows.set(win.id, win);
    previewLogs.set(win.id, []);
    const id = win.id;
    win.on('closed', () => { previewWindows.delete(id); previewLogs.delete(id); previewOrigins.delete(id); });
    win.webContents.on('console-message', (...args) => {
      const details = typeof args[1] === 'number' ? { level: args[1], message: args[2], line: args[3], source: args[4] } : args[1] || args[0];
      const logs = previewLogs.get(id);
      if (!logs) return;
      logs.push({ time: Date.now(), level: details.level, message: String(details.message || '').slice(0, 2000), line: details.lineNumber ?? details.line, source: details.sourceId ?? details.source });
      if (logs.length > 200) logs.shift();
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, target) => { if (new URL(target).origin !== previewOrigins.get(id)) event.preventDefault(); });
  } else win.setSize(p.width || 1100, p.height || 800);
  previewOrigins.set(win.id, url.origin);
  previewLogs.set(win.id, []);
  await win.loadURL(url.href); win.show(); win.setContentSize(p.width || 1100, p.height || 800);
  return { windowId: win.id, url: url.href, loaded: true, runtimeVerified: false, note: 'Page loaded, not proof the game is ready. Observe screenshot and runtime evidence, then use editor.input.' };
}

async function dispatch(action, p) {
  check(action);
  const operation = catalog.find(op => op.action === action);
  if (operation) { p = workflow.defaults(operation.inputSchema, p || {}); workflow.validate(operation.inputSchema, p); }
  if (['runtime.inspect', 'animation.control', 'spine.control'].includes(action)) {
    const win = previewWindows.get(p.windowId);
    if (!win || win.isDestroyed()) throw new Error('Runtime operations require a dedicated MCP preview window.');
    return win.webContents.executeJavaScript(`(${runtimeBrowser.toString()})(${JSON.stringify({ ...p, domain: action.split('.')[0] })})`);
  }
  if (action.startsWith('build.')) return build.dispatch(action, p);
  if (['font.inspect','text.inspect','text.configure','ui.measure','ui.validate'].includes(action)) return typography.dispatch(action,p);
  if (action === 'ui.layout') return uiLayout.dispatch(action, p);
  if (['scene.view','reference.image'].includes(action)) return editorView.dispatch(action,p);
  if (action.startsWith('animation.') || action.startsWith('spine.')) return animation.dispatch(action, p);
  if (['asset.info', 'asset.graph', 'asset.import', 'asset.copy', 'asset.move', 'asset.reimport', 'asset.replace.plan', 'asset.replace.apply', 'asset.restore'].includes(action)) return resources.dispatch(action, p);
  if (action.startsWith('prefab.')) return prefabs.dispatch(action, p);
  if (['node.resolve', 'component.properties', 'component.patch', 'script.status', 'script.attach', 'button.events'].includes(action)) return development.dispatch(action, p);
  if (action === 'workflow.execute') return workflow.execute(p.steps, {
    catalog, dispatch, check, dryRun: !!p.dryRun,
    progress: progress => bridge?.event('workflow.step', progress),
  });
  if (['ui.build', 'ui.templates', 'scene.snapshot', 'scene.diff', 'scene.validate', 'knowledge.query'].includes(action)) return features.dispatch(action, p);
  switch (action) {
    case 'preview.open': {
      if (await request('scene', 'query-dirty')) throw new Error('Save the scene explicitly before previewing; preview must represent saved project content.');
      const url = new URL(await request('preview', 'query-preview-url'));
      if (url.protocol !== 'http:' || !url.port || url.username || url.password) throw new Error('Creator did not provide a supported local HTTP preview URL.');
      url.hostname = '127.0.0.1';
      if (p.testEvidence) url.searchParams.set('mcp-test', '1');
      return openPreviewUrl(url, p);
    }

    case 'preview.status': {
      const win = previewWindows.get(p.windowId);
      if (!win || win.isDestroyed()) throw new Error('This is not a preview window owned by the MCP.');
      const page = await win.webContents.executeJavaScript(`({readyState:document.readyState, canvases:Array.from(document.querySelectorAll('canvas')).map(c=>{const r=c.getBoundingClientRect();return {id:c.id,width:c.width,height:c.height,rect:{x:r.x,y:r.y,width:r.width,height:r.height}}}),testEvidence:document.getElementById('mcp-demo-evidence')?.textContent || null,testClickTargets:document.getElementById('mcp-demo-evidence')?.dataset.clickTargets || null})`);
      const logs = (previewLogs.get(win.id) || []).filter(item => !p.since || item.time >= p.since);
      return { windowId: win.id, url: win.webContents.getURL(), loading: win.webContents.isLoading(), contentBounds: win.getContentBounds(), page, logs: logs.slice(-(p.limit || 30)), totalRetainedLogs: logs.length,
        note: 'DOM loaded/canvas existence is not game-ready. testEvidence is supplied only by an explicitly instrumented sample. Logs cover this preview window since its latest load.' };
    }
    case 'preview.close': {
      const win = previewWindows.get(p.windowId);
      if (!win || win.isDestroyed()) throw new Error('This is not a preview window owned by the MCP.');
      win.destroy(); return { closed: p.windowId };
    }
    case 'editor.messages': return messages(p);
    case 'editor.logs': {
      const all = Editor.Logger.query();
      const logs = all.filter(log => (!p.level || log.type === p.level) && (!p.filter || String(log.message).toLowerCase().includes(p.filter.toLowerCase())) && (!p.since || log.time >= p.since));
      return { total: logs.length, logs: clean(logs.slice(-(p.limit || 100))) };
    }
    case 'editor.api': {
      let filename;
      if (p.source === 'editor') filename = path.join(Editor.App.path, 'node_modules', '@cocos', 'creator-types', 'editor', 'editor.d.ts');
      else if (p.source === 'engine') filename = path.join(Editor.Project.path, 'temp', 'declarations', 'cc.d.ts');
      else {
        const packages = Editor.Package.getPackages();
        const list = Array.isArray(packages) ? packages : Object.values(packages);
        const pkg = list.find(item => item.name === p.package);
        if (!pkg) throw new Error('Package not installed.');
        filename = path.join(pkg.path, '@types', p.source === 'types' ? 'public.d.ts' : 'message.d.ts');
      }
      if (!fs.existsSync(filename)) throw new Error('This package does not publish that declaration file. Use editor_messages documentation or inspect the package via editor_script.');
      const lines = fs.readFileSync(filename, 'utf8').split(/\r?\n/);
      const start = p.startLine || 1;
      const matches = p.search ? lines.map((text, i) => ({ line: i + 1, text })).filter(x => x.text.toLowerCase().includes(p.search.toLowerCase())) : [];
      return { source: p.source, totalLines: lines.length, startLine: start,
        lines: p.search ? matches.slice(0, p.limit || 100) : lines.slice(start - 1, start - 1 + (p.limit || 100)).map((text, i) => ({ line: start + i, text })),
        ...(p.search ? { totalMatches: matches.length } : {}) };
    }
    case 'editor.request': {
      if (p.package === 'cocos-codex-bridge' && p.message === 'workflow-action' && p.mode !== 'send') {
        workflowPanelAction(p.args?.[0]);
        return dispatch(p.args[0], p.args[1]);
      }
      if (p.package === 'cocos-codex-bridge' && p.message === 'prefab-action' && p.mode !== 'send') {
        prefabPanelAction(p.args?.[0]);
        return dispatch(p.args[0], p.args[1]);
      }
      // A template invoked through MCP is already inside the bridge queue.
      // Do not enqueue another HTTP request behind the operation awaiting it.
      if (p.package === 'cocos-codex-bridge' && p.message === 'run-template' && p.mode !== 'send') {
        return runTemplate(p.args?.[0], p.args?.[1] ?? true, async (action, params) => ({ result: await dispatch(action, params) }));
      }
      if (p.package === 'cocos-codex-bridge' && p.message === 'open-preview' && p.mode !== 'send') return dispatch('preview.open', {});
      if (p.mode === 'send') {
        Editor.Message.send(p.package, p.message, ...(p.args || []));
        return { sent: true, completed: false };
      }
      return clean(await request(p.package, p.message, ...(p.args || [])));
    }
    case 'editor.script': {
      if (p.context === 'scene') return request('scene', 'execute-scene-script', { name: 'cocos-codex-bridge', method: 'execute', args: [p.code, p.args || {}] });
      return clean(await new AsyncFunction('Editor', 'require', 'args', p.code)(Editor, require, p.args || {}));
    }
    case 'scene.tree': return request('scene', 'query-node-tree', ...(p.uuid ? [p.uuid] : []));
    case 'scene.open': {
      if (await request('scene', 'query-dirty')) throw new Error('The current scene has unsaved edits. Save it explicitly before switching scenes.');
      const uuid = p.asset.startsWith('db://') ? await request('asset-db', 'query-uuid', p.asset) : p.asset;
      if (!uuid) throw new Error('Scene asset not found.');
      await request('scene', 'open-scene', uuid);
      return { opened: uuid };
    }
    case 'scene.save': {
      const uuid = await request('scene', 'save-scene');
      const dirty = await request('scene', 'query-dirty');
      if (dirty || !uuid) throw new Error('Scene was not saved. Untitled scenes may require a Save As dialog; inspect the editor.');
      return { uuid, dirty };
    }
    case 'node.inspect': {
      const object = await request('scene', p.kind === 'component' ? 'query-component' : 'query-node', p.uuid);
      if (!object) throw new Error(`Object ${p.uuid} does not exist in the current scene.`);
      return object;
    }
    case 'node.create': {
      const parent = p.parent || (await request('scene', 'query-node-tree'))?.uuid;
      if (!parent) throw new Error('Open a scene before creating nodes.');
      const uuid = await request('scene', 'create-node', { ...p, parent, snapshot: true });
      if (!uuid) throw new Error('Creator did not create the node. Check the parent and asset UUID.');
      return uuid;
    }
    case 'node.remove': await request('scene', 'remove-node', { uuid: p.uuids }); return { removed: p.uuids };
    case 'node.duplicate': return request('scene', 'duplicate-node', p.uuids);
    case 'node.reparent': return request('scene', 'set-parent', { parent: p.parent, uuids: p.uuids, keepWorldTransform: p.keepWorldTransform });
    case 'property.set': {
      let targetUuid = p.uuid;
      let targetPath = p.path;
      if (!await request('scene', 'query-node', p.uuid)) {
        const component = await request('scene', 'query-component', p.uuid);
        targetUuid = component?.value?.node?.value?.uuid;
        if (!targetUuid) throw new Error('Target node or component does not exist.');
        const node = await request('scene', 'query-node', targetUuid);
        const index = node?.__comps__?.findIndex(item => item.value?.uuid?.value === p.uuid);
        if (index === undefined || index < 0) throw new Error('Component owner could not be resolved. Re-query the scene.');
        targetPath = `__comps__.${index}.${p.path}`;
      }
      const recording = await request('scene', 'begin-recording', targetUuid);
      try {
        const result = await request('scene', 'set-property', { uuid: targetUuid, path: targetPath, dump: p.dump, record: false });
        if (result === false) throw new Error('Creator rejected the property edit. Re-query the object and use its property dump.');
        await request('scene', 'end-recording', recording);
      } catch (error) {
        await request('scene', 'cancel-recording', recording);
        throw error;
      }
      return { applied: true, uuid: p.uuid, path: p.path };
    }
    case 'component.add': {
      if (!await request('scene', 'query-node', p.uuid)) throw new Error('Target node does not exist.');
      await request('scene', 'create-component', p);
      const node = await request('scene', 'query-node', p.uuid);
      if (!node?.__comps__?.some(component => component.type === p.component || component.cid === p.component)) {
        throw new Error('Component was not found after creation. Inspect editor_logs and the registered component class name.');
      }
      return node;
    }
    case 'component.remove': await request('scene', 'remove-component', p); return { removed: p.uuid };
    case 'selection': {
      if (p.uuids) {
        Editor.Selection.clear(p.type || 'node');
        if (p.uuids.length) Editor.Selection.select(p.type || 'node', p.uuids);
      }
      return { type: p.type || 'node', uuids: Editor.Selection.getSelected(p.type || 'node') };
    }
    case 'asset.query': {
      const result = await request('asset-db', 'query-assets', { pattern: p.pattern, ...(p.type ? { ccType: p.type } : {}) });
      return { total: result.length, assets: result.slice(p.offset || 0, (p.offset || 0) + (p.limit || 100)) };
    }
    case 'asset.write': {
      if (!p.url.startsWith('db://assets/') || p.url.includes('..') || p.url.endsWith('.meta')) throw new Error('Use db://assets/... without traversal or .meta suffix.');
      const current = await request('asset-db', 'query-asset-info', p.url);
      if (p.mode === 'create' && current) throw new Error('Asset already exists. Use mode=save explicitly.');
      if (p.mode === 'save' && !current) throw new Error('Asset does not exist. Use mode=create.');
      return request('asset-db', p.mode === 'save' ? 'save-asset' : 'create-asset', p.url, p.content);
    }
    case 'project.read': {
      const filename = projectPath(p.path);
      if (fs.statSync(filename).size > 1024 * 1024) throw new Error('File exceeds 1 MiB; use a script for targeted reading.');
      return { path: p.path, content: fs.readFileSync(filename, 'utf8') };
    }
    case 'project.files': return fs.readdirSync(projectPath(p.path || '.'), { withFileTypes: true })
      .filter(e => !['temp', 'library', 'node_modules', '.git', '.svn'].includes(e.name))
      .map(e => ({ name: e.name, directory: e.isDirectory(), symlink: e.isSymbolicLink() }));
    case 'editor.panel': {
      const newlyOpened = await Editor.Panel.open(p.name);
      if (!await Editor.Panel.has(p.name)) throw new Error('Creator could not open that panel. Check its registered name.');
      return { opened: p.name, newlyOpened: !!newlyOpened };
    }
    case 'editor.windows': return electron().BrowserWindow.getAllWindows().filter(w => !w.isDestroyed()).map(w => ({
      id: w.id, title: w.getTitle(), visible: w.isVisible(), focused: w.isFocused(), minimized: w.isMinimized(), contentBounds: w.getContentBounds(),
      url: w.webContents.getURL(), zoomFactor: w.webContents.getZoomFactor(),
    }));
    case 'editor.window': {
      const win = getWindow(p.windowId);
      if (p.action === 'focus') { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
      else win[p.action]();
      return { windowId: win.id, visible: win.isVisible(), minimized: win.isMinimized(), contentBounds: win.getContentBounds() };
    }
    case 'editor.screenshot': {
      const win = getWindow(p.windowId);
      const bounds = win.getContentBounds();
      if (win.isMinimized() || !bounds.width || !bounds.height) throw new Error('Restore the window with editor_window before capturing. A minimized window can return a stale image.');
      let image = await win.webContents.capturePage();
      if (image.isEmpty()) throw new Error('Window capture is empty. Make the editor window visible and retry.');
      const originalSize = image.getSize();
      if (p.maxWidth && originalSize.width > p.maxWidth) image = image.resize({ width: p.maxWidth });
      return { mimeType: 'image/png', data: image.toPNG().toString('base64'), originalSize, imageSize: image.getSize(), contentBounds: win.getContentBounds() };
    }
    case 'editor.input': {
      const win = getWindow(p.windowId);
      if (win.isMinimized() || !win.isVisible()) throw new Error('Focus the window with editor_window before sending input.');
      win.focus();
      if (p.text !== undefined) await win.webContents.insertText(p.text);
      for (const e of p.events || []) {
        const mouseButton = e.type === 'mouseDown' || e.type === 'mouseUp';
        win.webContents.sendInputEvent(mouseButton ? { clickCount: 1, ...e } : e);
        // Give Chromium a frame to consume focus/down/up before the next event.
        await new Promise(resolve => setTimeout(resolve, mouseButton ? 16 : 1));
      }
      return { dispatched: true, events: p.events?.length || 0, textInserted: p.text !== undefined, verified: false };
    }
    case 'editor.menu': {
      const menu = electron().Menu.getApplicationMenu();
      if (!p.path) return menuItems(menu);
      let item;
      let current = menu;
      for (const index of p.path) { item = current?.items[index]; current = item?.submenu; }
      if (!item || !item.enabled || item.visible === false || item.submenu || typeof item.click !== 'function') throw new Error('Menu item is unavailable or is a submenu.');
      item.click(item, electron().BrowserWindow.getFocusedWindow(), {});
      return { dispatched: true, label: item.label, verified: false };
    }
    default: throw new Error(`Unknown action: ${action}`);
  }
}

exports.load = async function () {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    settings = { paused: saved.paused === true, allowScripts: saved.allowScripts !== false };
  } catch (error) { if (error.code !== 'ENOENT') console.warn('[Cocos MCP] Ignoring invalid settings:', error.message); }
  bridge = await startBridge({ project: Editor.Project.path, version: Editor.App.version, dispatch, controls: () => ({ ...settings }) });
  console.log('[Cocos MCP] Local bridge ready for project:', Editor.Project.path);
};
exports.unload = async function () { await build.dispose(); for (const win of previewWindows.values()) if (!win.isDestroyed()) win.destroy(); previewWindows.clear(); previewLogs.clear(); previewOrigins.clear(); if (bridge) await bridge.close(); bridge = undefined; };
function prefabPanelAction(action) {
  if (!['selection', 'prefab.inspect', 'prefab.validate', 'prefab.create', 'prefab.open', 'prefab.save', 'prefab.close'].includes(action)) throw new Error('Unsupported prefab panel action.');
}
function workflowPanelAction(action) {
  if (!['selection', 'font.inspect', 'text.inspect', 'text.configure', 'ui.measure', 'ui.validate', 'scene.view', 'reference.image', 'asset.info', 'asset.graph', 'animation.inspect', 'animation.sample', 'spine.inspect', 'build.platforms', 'build.start', 'build.status', 'build.logs', 'build.artifacts', 'build.preview', 'build.stopServer'].includes(action)) throw new Error('Unsupported workflow panel action.');
}
async function runTemplate(id, dryRun, run) {
  if (!Object.hasOwn(require('./templates.cjs'), id)) throw new Error('Unknown template.');
  const output = await run('workflow.execute', { steps: [{ id: 'ui', op: 'ui.build', params: { template: id, dryRun } }] });
  const built = output.result?.steps?.[0]?.result;
  if (!dryRun && built?.root) {
    try { await exports.methods.locateUI(built.root); output.located = true; }
    catch (error) { output.locationWarning = `UI was generated, but locating it failed: ${error.message}`; }
  }
  return output;
}
exports.methods = {
  async workflowAction(action, params) {
    workflowPanelAction(action);
    return (await bridge.runLocal(action, params)).result;
  },
  async prefabAction(action, params) {
    prefabPanelAction(action);
    return (await bridge.runLocal(action, params)).result;
  },
  async openPreview() { return bridge.runLocal('preview.open', {}); },
  showStatus() { console.log('[Cocos MCP]', bridge?.getStatus() || 'Not started'); },
  openPanel() { return Editor.Panel.open('cocos-codex-bridge'); },
  dashboard() {
    const setup = connection({ directory: __dirname, project: Editor.Project.path });
    return { ...bridge?.dashboard(), settings: { ...settings }, config: setup.config, toml: setup.toml, installationReady: setup.ready, installationMode: setup.mode, installationError: setup.error, mcpVersion: require('./package.json').version, catalog: catalog.map(({ inputSchema, ...op }) => op), templates: Object.entries(require('./templates.cjs')).map(([id, t]) => ({ id, title: t.title, description: t.description })) };
  },
  operationSchema(action) {
    const op = catalog.find(item => item.action === action);
    if (!op) throw new Error('Unknown operation.');
    return op;
  },
  async runTemplate(id, dryRun = true) {
    return runTemplate(id, dryRun, (action, params) => bridge.runLocal(action, params));
  },
  async locateUI(uuid) {
    const tree = await request('scene', 'query-node-tree');
    function contains(node) { return node.uuid === uuid || (node.children || []).some(contains); }
    if (!contains(tree)) throw new Error('UI node is not in the current editable scene. Generate it again or reopen the correct scene.');
    Editor.Selection.clear('node');
    Editor.Selection.select('node', [uuid]);
    await request('scene', 'change-is2D', true);
    await request('scene', 'focus-camera', [uuid]);
    return { selected: uuid, focused: true };
  },
  setSettings(next) {
    if (!next || Object.keys(next).some(key => !['paused', 'allowScripts'].includes(key)) || Object.values(next).some(value => typeof value !== 'boolean')) throw new Error('Invalid settings.');
    settings = { ...settings, ...next };
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
    bridge?.event('settings.changed', settings);
    return { ...settings };
  },
  templatePlan(id) {
    const template = require('./templates.cjs')[id];
    if (!template) throw new Error('Unknown template.');
    return { steps: [{ id: 'ui', op: 'ui.build', params: { template: id, dryRun: true } }] };
  },
  onSceneReady(...args) { bridge?.event('scene.ready', args); },
  onSceneSave(...args) { bridge?.event('scene.saved', args); },
  onCompiled(...args) { bridge?.event('programming.compiled', args); },
  onBuildChanged(...args) { bridge?.event('builder.taskChanged', args); },
  onAssetChanged(...args) { resources.invalidate(); bridge?.event('asset.changed', args); },
};
