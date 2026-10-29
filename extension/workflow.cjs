'use strict';
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
const refPattern = /^([A-Za-z][\w-]{0,39})#((?:\/(?:[^~]|~[01])*)*)$/;
const isRef = value => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1 && typeof value.$ref === 'string';
function reference(value, previous) {
  const match = refPattern.exec(value);
  if (!match || !previous.has(match[1])) throw new Error(`Invalid or forward result reference: ${value}`);
  return match;
}
function pointer(value, path) {
  if (!path) return value;
  for (const key of path.slice(1).split('/').map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'))) {
    if (FORBIDDEN.has(key) || value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) throw new Error(`Result path not found: ${path}`);
    value = value[key];
  }
  return value;
}
function resolve(value, results) {
  if (isRef(value)) { const [, id, path] = reference(value.$ref, results); return pointer(results.get(id), path); }
  if (Array.isArray(value)) return value.map(item => resolve(item, results));
  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN.has(key)) throw new Error(`Forbidden key: ${key}`);
      output[key] = resolve(item, results);
    }
    return output;
  }
  return value;
}
// Validate the generated operation schemas in both the extension and MCP process.
// References defer only the referenced value; every constant is checked before edits.
function validate(schema, value, { root = schema, previous, path = '$', depth = 0 } = {}) {
  if (depth > 80) throw new Error('Input nesting exceeds 80 levels.');
  const fail = message => { throw new Error(`${path}: ${message}`); };
  if (previous && isRef(value)) { reference(value.$ref, previous); return; }
  if (schema.$ref) return validate(pointer(root, schema.$ref.slice(1)), value, { root, previous, path, depth: depth + 1 });
  if (schema.anyOf) {
    for (const option of schema.anyOf) {
      try { validate(option, value, { root, previous, path, depth: depth + 1 }); return; } catch {}
    }
    return fail('does not match an allowed value');
  }
  if (schema.enum && !schema.enum.includes(value)) fail(`expected one of ${schema.enum.join(', ')}`);
  if (Object.hasOwn(schema, 'const') && value !== schema.const) fail('unexpected constant');
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected object');
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) fail(`missing ${key}`);
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN.has(key)) fail(`forbidden key ${key}`);
      const child = schema.properties?.[key] ?? schema.additionalProperties;
      if (child === false) fail(`unknown field ${key}`);
      if (child && typeof child === 'object') validate(child, item, { root, previous, path: `${path}.${key}`, depth: depth + 1 });
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) fail('expected array');
    if (value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity)) fail('array length out of range');
    value.forEach((item, i) => validate(schema.items || {}, item, { root, previous, path: `${path}[${i}]`, depth: depth + 1 }));
  } else if (schema.type === 'string') {
    if (typeof value !== 'string') fail('expected string');
    if (value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity)) fail('string length out of range');
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail('invalid string pattern');
  } else if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (schema.type === 'integer' && !Number.isInteger(value))) fail(`expected ${schema.type}`);
    if (value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)) fail('number out of range');
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) fail('number below exclusive minimum');
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) fail('number above exclusive maximum');
  } else if (schema.type === 'boolean' && typeof value !== 'boolean') fail('expected boolean');
  else if (schema.type === 'null' && value !== null) fail('expected null');
}
function preflight(steps, catalog) {
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > 100) throw new Error('Use 1–100 steps.');
  const previous = new Map();
  for (const step of steps) {
    if (!step || !/^[A-Za-z][\w-]{0,39}$/.test(step.id) || previous.has(step.id)) throw new Error('Each step needs a unique id (1–40 letters, digits, _ or -; start with a letter).');
    if (Object.keys(step).some(k => !['id', 'op', 'params', 'fields', 'output'].includes(k))) throw new Error(`Unknown step field: ${step.id}`);
    const operation = catalog.find(op => op.action === step.op);
    if (!operation) throw new Error(`Unknown operation: ${step.op}`);
    if (step.op === 'editor.screenshot') throw new Error('Screenshots must use cocos_observe, which returns MCP image content.');
    if (step.fields !== undefined && (!Array.isArray(step.fields) || step.fields.length > 30 || step.fields.some(p => typeof p !== 'string' || (p !== '' && !p.startsWith('/'))))) throw new Error('fields must contain up to 30 JSON pointers.');
    if (step.output && !['summary', 'full', 'none'].includes(step.output)) throw new Error('Invalid output mode.');
    function scan(value, depth = 0) {
      if (depth > 80) throw new Error('Input nesting exceeds 80 levels.');
      if (isRef(value)) { reference(value.$ref, previous); return; }
      if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
        if (FORBIDDEN.has(key)) throw new Error(`Forbidden key: ${key}`);
        scan(child, depth + 1);
      }
    }
    scan(step.params);
    validate(operation.inputSchema, step.params || {}, { previous });
    previous.set(step.id, null);
  }
  return steps.map(step => ({ id: step.id, op: step.op, readOnly: catalog.find(op => op.action === step.op).readOnly }));
}
function defaults(schema, value, root = schema) {
  if (schema.$ref) return defaults(pointer(root, schema.$ref.slice(1)), value, root);
  if (value === undefined && Object.hasOwn(schema, 'default')) return JSON.parse(JSON.stringify(schema.default));
  if (schema.type === 'object' && value && typeof value === 'object') {
    const result = { ...value };
    for (const [key, child] of Object.entries(schema.properties || {})) {
      const applied = defaults(child, result[key], root);
      if (applied !== undefined) result[key] = applied;
    }
    return result;
  }
  if (schema.type === 'array' && Array.isArray(value)) return value.map(item => defaults(schema.items || {}, item, root));
  return value;
}
function compact(action, value) {
  if (action === 'component.add' && value?.__comps__) return { uuid: value.uuid?.value, components: value.__comps__.map(c => ({ type: c.type, uuid: c.value?.uuid?.value })) };
  if (action === 'asset.query' && value?.assets) return { ...value, assets: value.assets.map(a => ({ uuid: a.uuid, url: a.url, type: a.type, name: a.name })) };
  return summary(value);
}
function summary(value, depth = 0) {
  if (typeof value === 'string' && value.length > 600) return { preview: value.slice(0, 600), truncated: true, totalCharacters: value.length };
  if (!value || typeof value !== 'object') return value;
  if (depth >= 4) return { truncated: true, kind: Array.isArray(value) ? 'array' : 'object' };
  if (Array.isArray(value)) {
    const items = value.slice(0, 20).map(item => summary(item, depth + 1));
    return value.length <= 20 ? items : { items, total: value.length, truncated: true };
  }
  const entries = Object.entries(value);
  return Object.fromEntries([...entries.slice(0, 30).map(([key, item]) => [key, summary(item, depth + 1)]), ...(entries.length > 30 ? [['__summary', { truncated: true, totalKeys: entries.length }]] : [])]);
}
async function execute(steps, { catalog, dispatch, check = () => {}, progress = () => {}, dryRun = false }) {
  const plan = preflight(steps, catalog);
  for (const item of plan) check(item.op);
  if (dryRun) return { ok: true, dryRun: true, plan, note: 'Schema/reference validation only. Runtime state, permissions and reference value types are checked at execution; no edits made.' };
  const results = new Map();
  const completed = [];
  for (const step of steps) {
    try {
      check(step.op);
      const operation = catalog.find(op => op.action === step.op);
      const params = defaults(operation.inputSchema, resolve(step.params || {}, results));
      validate(operation.inputSchema, params);
      progress({ id: step.id, op: step.op, state: 'running' });
      const result = await dispatch(step.op, params);
      results.set(step.id, result);
      let output, outputWarning;
      try { output = step.output === 'none' ? undefined : step.fields ? Object.fromEntries(step.fields.map(p => [p, pointer(result, p)])) : step.output === 'full' ? result : compact(step.op, result); }
      catch (error) { output = compact(step.op, result); outputWarning = `Operation completed, but output projection failed: ${error.message}. Do not replay this edit.`; }
      completed.push({ id: step.id, ok: true, ...(output !== undefined ? { result: output } : {}), ...(outputWarning ? { outputWarning } : {}) });
      progress({ id: step.id, op: step.op, state: 'completed' });
    } catch (error) {
      progress({ id: step.id, op: step.op, state: 'failed', error: error.message });
      return { ok: false, atomic: false, completed: completed.length, steps: completed, failed: { id: step.id, op: step.op, error: error.message }, skipped: steps.slice(completed.length + 1).map(s => s.id), recovery: 'Earlier steps remain applied. Inspect the scene before continuing; do not replay the entire batch.' };
    }
  }
  return { ok: true, atomic: false, completed: completed.length, steps: completed };
}
module.exports = { isRef, pointer, resolve, validate, defaults, preflight, summary, compact, execute };
