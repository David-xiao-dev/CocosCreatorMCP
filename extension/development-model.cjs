'use strict';
const forbidden = new Set(['__proto__', 'prototype', 'constructor', 'uuid', 'node', 'name']);
const clone = value => JSON.parse(JSON.stringify(value));
function indexTree(tree) {
  if (!tree?.uuid) throw new Error('No editable scene is open.');
  const nodes = [];
  function visit(node, path, depth) {
    if (depth > 100 || nodes.length >= 5000) throw new Error('Hierarchy exceeds 5000 nodes or 100 levels.');
    nodes.push({ ...node, path });
    for (const child of node.children || []) visit(child, path ? `${path}/${child.name}` : child.name, depth + 1);
  }
  visit(tree, '', 0); return nodes;
}
function resolveNode(tree, target) {
  const nodes = indexTree(tree);
  let matches = nodes.filter(n => n.uuid === target);
  if (!matches.length) {
    const route = target.replace(/^\//, '');
    matches = route.includes('/') ? nodes.filter(n => n.path === route) : nodes.filter(n => n.name === route || n.path === route);
  }
  if (!matches.length) throw new Error(`Node not found in editable project hierarchy: ${target}`);
  if (matches.length !== 1) throw new Error(`Ambiguous node '${target}'. Use UUID or an unambiguous path. Candidates: ${JSON.stringify(matches.slice(0, 12).map(n => ({ uuid: n.uuid, path: n.path })))}`);
  return matches[0];
}
function decode(dump) {
  if (dump.isArray) return dump.value.map(decode);
  const value = dump.value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, child && typeof child === 'object' && Object.hasOwn(child, 'type') && Object.hasOwn(child, 'value') ? decode(child) : child]));
  }
  return value;
}
// Convert plain values into the installed editor's actual property dumps.
// References are resolved and type-checked by the editor/scene adapter first.
function encode(dump, value, label = 'property') {
  if (!dump || typeof dump !== 'object' || !dump.type) throw new Error(`${label}: not an inspector property`);
  if (dump.readonly) throw new Error(`${label}: property is read-only`);
  const result = clone(dump);
  if (dump.isArray) {
    if (!Array.isArray(value) || value.length > 200) throw new Error(`${label}: expected an array of at most 200 items`);
    result.value = value.map((item, i) => encode(dump.value[i] || dump.elementTypeData, item, `${label}[${i}]`)); return result;
  }
  if (['Number', 'Float', 'Integer', 'Enum', 'BitMask'].includes(dump.type)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label}: expected a finite number`);
    if (dump.type === 'Enum' && dump.enumList && !dump.enumList.some(e => e.value === value)) throw new Error(`${label}: invalid enum value`);
    if (value < (dump.min ?? -Infinity) || value > (dump.max ?? Infinity)) throw new Error(`${label}: outside inspector limits`);
  } else if (dump.type === 'String' && typeof value !== 'string') throw new Error(`${label}: expected string`);
  else if (dump.type === 'Boolean' && typeof value !== 'boolean') throw new Error(`${label}: expected boolean`);
  else if (dump.value && typeof dump.value === 'object' && !Array.isArray(dump.value)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}: expected an object`);
    const keys = Object.keys(value);
    if (keys.some(k => ['__proto__', 'constructor', 'prototype'].includes(k))) throw new Error(`${label}: forbidden key`);
    if (keys.some(k => !Object.hasOwn(dump.value, k))) throw new Error(`${label}: unknown object field`);
    result.value = clone(dump.value);
    for (const key of keys) {
      const child = dump.value[key];
      if (child && typeof child === 'object' && Object.hasOwn(child, 'type') && Object.hasOwn(child, 'value')) result.value[key] = encode(child, value[key], `${label}.${key}`);
      else {
        if (typeof child === 'number' && (typeof value[key] !== 'number' || !Number.isFinite(value[key]))) throw new Error(`${label}.${key}: expected finite number`);
        if (typeof child === 'string' && typeof value[key] !== 'string') throw new Error(`${label}.${key}: expected string`);
        result.value[key] = clone(value[key]);
      }
    }
    return result;
  }
  result.value = value; return result;
}
function editableKey(key) {
  if (forbidden.has(key) || key.startsWith('_') || key.includes('.') || key.includes('/')) throw new Error(`Unsupported component property: ${key}. Use a public top-level inspector property.`);
}
function equal(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-5 * Math.max(1, Math.abs(a), Math.abs(b));
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a); return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && equal(a[k], b[k]));
}
module.exports = { indexTree, resolveNode, encode, decode, editableKey, equal };
