'use strict';
const { join } = require('path');
module.paths.push(join(Editor.App.path, 'node_modules'));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const { projectNodes } = require('./scene-model.cjs');
const engineTools = require('./engine-tools.cjs');
const uiEngine = require('./ui-engine.cjs');

exports.load = function () {};
exports.unload = function () {};
exports.methods = {
  async inspectFont(uuid,text) { return uiEngine.inspectFont(require('cc'),uuid,text); },
  inspectText(hierarchy,uuid,component,includeText) {
    const cc=require('cc'),node=projectNodes(cc.director.getScene(),hierarchy).find(n=>n.uuid===uuid);
    if(!node)throw new Error('Text target is not a project node.');
    return uiEngine.inspectText(cc,node,component,includeText);
  },
  measureUI(hierarchy,uuid,subtree,includeInactive,limit) { return uiEngine.measurements(require('cc'),hierarchy,uuid,subtree,includeInactive,limit); },
  async animationSerialize(spec, original) { return engineTools.animationSerialize(require('cc'), EditorExtends.serialize, spec, original); },
  async animationRead(source, keys, time) { return engineTools.animationRead(require('cc'), source, keys, time); },
  async spineRead(uuid) { return engineTools.spineRead(require('cc'), uuid); },
  prefabAudit(hierarchy, nodeId) {
    const cc = require('cc');
    const all = projectNodes(cc.director.getScene(), hierarchy);
    const root = all.find(n => n.uuid === nodeId);
    if (!root || root instanceof cc.Scene || root.name === 'should_hide_in_hierarchy') throw new Error('Expected a project prefab/content node, not a scene or editor wrapper.');
    const members = new Set();
    function collect(n) { members.add(n); for (const ch of n.children) { if (!all.includes(ch)) throw new Error('Subtree contains non-project nodes.'); collect(ch); } }
    collect(root);
    const external = [], incoming = [], assets = new Set(), scripts = new Set(); let fields = 0;
    function inspect(value, path, seen, depth, outside = false) {
      if (++fields > 100000 || depth > 60) throw new Error('Prefab reference inspection exceeds supported bounds.');
      if (!value || typeof value !== 'object') return;
      if (value instanceof cc.Node || value instanceof cc.Component) {
        const target = value instanceof cc.Node ? value : value.node;
        if (outside ? members.has(target) : !members.has(target)) (outside ? incoming : external).push({ path, target: value.uuid, node: target?.uuid, name: target?.name });
        return;
      }
      if (value instanceof cc.Asset) { if (!outside && value._uuid) assets.add(value._uuid); return; }
      if (seen.has(value)) return; seen.add(value);
      if (Array.isArray(value)) { value.forEach((v, i) => inspect(v, `${path}[${i}]`, seen, depth + 1, outside)); return; }
      for (const key of value.constructor?.__values__ || Object.keys(value)) inspect(value[key], `${path}.${key}`, seen, depth + 1, outside);
    }
    for (const node of members) for (const comp of node.getComponents(cc.Component)) {
      const ctor = comp.constructor;
      if (ctor.prototype.__scriptUuid) scripts.add(ctor.prototype.__scriptUuid);
      for (const key of ctor.__values__ || []) {
        if (['node', '__prefab'].includes(key)) continue;
        inspect(comp[key], `${node.name}[${cc.js.getClassName(comp)}].${key}`, new Set(), 0);
      }
    }
    for (const node of all) if (!members.has(node)) for (const comp of node.getComponents(cc.Component)) {
      for (const key of comp.constructor.__values__ || []) {
        if (['node', '__prefab'].includes(key)) continue;
        inspect(comp[key], `${node.name}[${cc.js.getClassName(comp)}].${key}`, new Set(), 0, true);
      }
    }
    return { nodes: members.size, components: [...members].reduce((n, v) => n + v.getComponents(cc.Component).length, 0), external, incoming, assets: [...assets], scripts: [...scripts],
      instanceRoot: root._prefab?.root?.uuid || null, assetUuid: root._prefab?.asset?._uuid || null };
  },
  prefabTypes(types) {
    const cc = require('cc');
    return { missingTypes: types.filter(type => !cc.js._getClassById(type) && !cc.js.getClassByName(type)) };
  },
  developmentClass(name) {
    const cc = require('cc');
    const ctor = cc.js.getClassByName(name);
    if (!ctor) return { registered: false, className: name };
    if (!(ctor.prototype instanceof cc.Component)) throw new Error(`${name} is not a Component class.`);
    return { registered: true, className: name, classId: cc.js._getClassId(ctor), scriptUuid: ctor.prototype.__scriptUuid || ctor.__scriptUuid || null,
      methods: Object.getOwnPropertyNames(ctor.prototype).filter(key => key !== 'constructor' && !key.startsWith('_') && typeof Object.getOwnPropertyDescriptor(ctor.prototype, key)?.value === 'function') };
  },
  async developmentReference(hierarchy, type, uuid) {
    const cc = require('cc');
    const ctor = cc.js.getClassByName(type);
    if (!ctor) throw new Error(`Reference type is not registered: ${type}`);
    const nodes = projectNodes(cc.director.getScene(), hierarchy);
    if (ctor === cc.Node || ctor === cc.Component || ctor.prototype instanceof cc.Component) {
      const object = ctor === cc.Node ? nodes.find(n => n.uuid === uuid) : nodes.flatMap(n => n.getComponents(cc.Component)).find(c => c.uuid === uuid);
      if (!object || !(object instanceof ctor)) throw new Error(`Reference ${uuid} is not a project ${type}.`);
    } else {
      if (!(ctor === cc.Asset || ctor.prototype instanceof cc.Asset)) throw new Error(`Unsupported reference type ${type}`);
      const asset = await new Promise((resolve, reject) => cc.assetManager.loadAny(uuid, (error, asset) => error ? reject(error) : resolve(asset)));
      if (!(asset instanceof ctor)) throw new Error(`Asset ${uuid} is not a ${type}.`);
    }
    return { valid: true };
  },
  developmentHandler(hierarchy, nodeId, type, method) {
    const cc = require('cc');
    if (!method || method.startsWith('_') || ['constructor', 'destroy'].includes(method)) throw new Error('Use a public business event handler.');
    const node = projectNodes(cc.director.getScene(), hierarchy).find(n => n.uuid === nodeId);
    const ctor = cc.js.getClassByName(type);
    const components = ctor && node ? node.getComponents(ctor) : [];
    if (components.length !== 1 || typeof components[0][method] !== 'function') throw new Error(`Expected one ${type} with method ${method} on target.`);
    return { classId: cc.js._getClassId(ctor), component: components[0].uuid };
  },
  uiContext(classes, hierarchy, parentId) {
    const cc = require('cc');
    const root = cc.director.getScene();
    if (!root) throw new Error('No scene is open.');
    const nodes = projectNodes(root, hierarchy);
    const canvasInfo = node => {
      const canvas = node.getComponent(cc.Canvas);
      const camera = canvas.cameraComponent;
      return { uuid: node.uuid, name: node.name, active: node.activeInHierarchy && canvas.enabled,
        camera: camera ? { uuid: camera.uuid, node: camera.node.uuid, active: camera.enabled && camera.node.activeInHierarchy, visibility: camera.visibility } : null };
    };
    const canvases = nodes.filter(node => node.getComponent(cc.Canvas)).map(canvasInfo);
    let parentCanvas;
    if (parentId) {
      let node = nodes.find(node => node.uuid === parentId);
      if (!node) throw new Error('Parent is not in the editable project hierarchy; editor helper nodes cannot contain game UI.');
      if (!node.activeInHierarchy) throw new Error('Parent is inactive; enable it before generating visible UI.');
      while (node) {
        if (node.getComponent(cc.Canvas)) { parentCanvas = canvasInfo(node); break; }
        node = node.parent;
      }
      if (!parentCanvas) throw new Error('The selected parent must be inside a project Canvas.');
    }
    const usable = canvases.filter(c => c.active);
    return { canvas: parentCanvas?.uuid || (usable.length === 1 ? usable[0].uuid : undefined), canvases, parentCanvas,
      missing: classes.filter(name => !cc.js.getClassByName(name)) };
  },
  snapshot(hierarchy) {
    const cc = require('cc');
    const root = cc.director.getScene();
    if (!root) throw new Error('No scene is open.');
    const nodes = [];
    for (const node of projectNodes(root, hierarchy)) {
      const ui = node.getComponent(cc.UITransform);
      const label = node.getComponent(cc.Label);
      const vec = value => ({ x: value.x, y: value.y, z: value.z });
      nodes.push({ uuid: node.uuid, parent: node.parent?.uuid || null, name: node.name, active: node.active,
        layer: node.layer, position: vec(node.position), rotation: vec(node.eulerAngles), scale: vec(node.scale),
        components: node.getComponents(cc.Component).map(c => ({ uuid: c.uuid, type: cc.js.getClassName(c), enabled: c.enabled })),
        ...(ui ? { size: { width: ui.width, height: ui.height } } : {}), ...(label ? { text: label.string } : {}) });
    }
    return { scene: root.uuid, nodes };
  },
  async execute(code, args = {}) {
    const cc = require('cc');
    const result = await new AsyncFunction('cc', 'Editor', 'require', 'args', code)(cc, Editor, require, args);
    // Reject cyclic/native engine objects before Creator's IPC serializer sees them.
    return result === undefined ? null : JSON.parse(JSON.stringify(result));
  },
};
