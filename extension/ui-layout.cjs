'use strict';

// Semantic UI layout adapter for Creator 3.8.x.  It keeps the MCP payload
// stable while resolving the installed inspector's numeric enum values and
// component UUIDs through the existing typed component pipeline.
const COMPONENTS = {
  widget: 'cc.Widget',
  layout: 'cc.Layout',
  scrollView: 'cc.ScrollView',
  mask: 'cc.Mask',
  safeArea: 'cc.SafeArea',
  blockInputEvents: 'cc.BlockInputEvents',
};

const FIELDS = {
  'cc.Widget': {
    enabled: 'enabled', target: 'target',
    alignTop: 'isAlignTop', alignBottom: 'isAlignBottom', alignLeft: 'isAlignLeft', alignRight: 'isAlignRight',
    alignVerticalCenter: 'isAlignVerticalCenter', alignHorizontalCenter: 'isAlignHorizontalCenter',
    top: 'top', bottom: 'bottom', left: 'left', right: 'right',
    horizontalCenter: 'horizontalCenter', verticalCenter: 'verticalCenter',
    absoluteTop: 'isAbsoluteTop', absoluteBottom: 'isAbsoluteBottom', absoluteLeft: 'isAbsoluteLeft', absoluteRight: 'isAbsoluteRight',
    absoluteHorizontalCenter: 'isAbsoluteHorizontalCenter', absoluteVerticalCenter: 'isAbsoluteVerticalCenter',
    alignMode: 'alignMode', alignFlags: 'alignFlags',
  },
  'cc.Layout': {
    enabled: 'enabled', alignHorizontal: 'alignHorizontal', alignVertical: 'alignVertical',
    type: 'type', resizeMode: 'resizeMode', cellSize: 'cellSize', startAxis: 'startAxis',
    paddingLeft: 'paddingLeft', paddingRight: 'paddingRight', paddingTop: 'paddingTop', paddingBottom: 'paddingBottom',
    spacingX: 'spacingX', spacingY: 'spacingY', verticalDirection: 'verticalDirection',
    horizontalDirection: 'horizontalDirection', constraint: 'constraint', constraintNum: 'constraintNum', affectedByScale: 'affectedByScale',
  },
  'cc.ScrollView': {
    enabled: 'enabled', bounceDuration: 'bounceDuration', brake: 'brake', elastic: 'elastic', inertia: 'inertia',
    content: 'content', horizontal: 'horizontal', vertical: 'vertical', horizontalScrollBar: 'horizontalScrollBar',
    verticalScrollBar: 'verticalScrollBar', cancelInnerEvents: 'cancelInnerEvents',
  },
  'cc.Mask': { enabled: 'enabled', type: 'type', inverted: 'inverted', segments: 'segments', alphaThreshold: 'alphaThreshold' },
  'cc.SafeArea': { enabled: 'enabled', symmetric: 'symmetric' },
  'cc.BlockInputEvents': { enabled: 'enabled' },
};
const ENUM_NAMES = {
  'cc.Widget': { alignMode: ['ONCE', 'ALWAYS', 'ON_WINDOW_RESIZE'] },
  'cc.Layout': { type: ['NONE', 'HORIZONTAL', 'VERTICAL', 'GRID'], resizeMode: ['NONE', 'CONTAINER', 'CHILDREN'], startAxis: ['HORIZONTAL', 'VERTICAL'], verticalDirection: ['BOTTOM_TO_TOP', 'TOP_TO_BOTTOM'], horizontalDirection: ['LEFT_TO_RIGHT', 'RIGHT_TO_LEFT'], constraint: ['NONE', 'FIXED_ROW', 'FIXED_COL'] },
  'cc.Mask': { type: ['GRAPHICS_RECT', 'GRAPHICS_ELLIPSE', 'GRAPHICS_STENCIL', 'SPRITE_STENCIL'] },
};

function componentType(value) {
  if (COMPONENTS[value]) return COMPONENTS[value];
  if (Object.values(COMPONENTS).includes(value)) return value;
  throw new Error(`Unsupported UI layout component: ${value}.`);
}

function normalizeEnum(meta, value, label) {
  if (typeof value === 'number') {
    if (!meta.enumList?.some(item => item.value === value)) throw new Error(`${label}: invalid enum value ${value}.`);
    return value;
  }
  if (typeof value !== 'string') throw new Error(`${label}: expected an enum name or numeric value.`);
  const key = value.toUpperCase().replace(/[- ]/g, '_');
  const match = meta.enumList?.find(item => item.name.toUpperCase() === key);
  if (!match) throw new Error(`${label}: unsupported enum ${value}; use one of ${(meta.enumList || []).map(item => item.name).join(', ')}.`);
  return match.value;
}

function nodeReference(value, label) {
  if (value === null || (value && typeof value === 'object')) return value;
  if (typeof value === 'string' && value) return { $node: value };
  throw new Error(`${label}: use a node UUID/path string, {$node: path}, or null.`);
}

function semanticProperties(type, properties, metadata) {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) throw new Error('properties must be an object.');
  const fields = FIELDS[type];
  const output = {};
  for (const [key, value] of Object.entries(properties)) {
    const actual = fields[key];
    if (!actual) throw new Error(`${type} does not expose semantic UI field '${key}'. Supported fields: ${Object.keys(fields).join(', ')}.`);
    const meta = metadata.properties?.[actual];
    if (!meta) throw new Error(`${type}.${actual} is unavailable in this Creator build.`);
    if (meta.readonly) throw new Error(`${type}.${actual} is read-only.`);
    if (meta.enumList) output[actual] = normalizeEnum(meta, value, `${type}.${key}`);
    else if ((type === 'cc.Widget' && key === 'target') || (type === 'cc.ScrollView' && key === 'content')) output[actual] = nodeReference(value, `${type}.${key}`);
    else output[actual] = value;
  }
  return output;
}

function validateDryRun(type, properties) {
  const fields = FIELDS[type];
  for (const [key, value] of Object.entries(properties || {})) {
    if (!fields[key]) throw new Error(`${type} does not expose semantic UI field '${key}'. Supported fields: ${Object.keys(fields).join(', ')}.`);
    const allowed = ENUM_NAMES[type]?.[key];
    if (allowed && typeof value === 'string' && !allowed.includes(value.toUpperCase().replace(/[- ]/g, '_'))) throw new Error(`${type}.${key}: unsupported enum ${value}; use one of ${allowed.join(', ')}.`);
  }
}

async function findComponent(dispatch, node, type) {
  try { return await dispatch('component.properties', { node, component: type }); }
  catch (error) {
    if (/found 0|not found|Expected one/i.test(error.message)) return null;
    throw error;
  }
}

function compactProperties(result) {
  return Object.fromEntries(Object.entries(result.properties || {}).map(([key, value]) => [key, value.value]));
}

function createUILayout({ dispatch }) {
  return {
    async dispatch(action, p) {
      const mode = p.action;
      const type = componentType(p.component);
      const current = await findComponent(dispatch, p.node, type);
      if (mode === 'inspect') {
        if (!current) return { node: p.node, component: type, present: false, properties: {}, supported: Object.keys(FIELDS[type]) };
        return { node: current.node, component: current.component, type, present: true, properties: compactProperties(current), supported: Object.keys(FIELDS[type]), verified: 'typed inspector readback' };
      }
      if (mode === 'remove') {
        if (!current) return { node: p.node, component: type, removed: false, present: false };
        await dispatch('component.remove', { uuid: current.component });
        const after = await findComponent(dispatch, p.node, type);
        if (after) throw new Error(`${type} still exists after removal.`);
        return { node: current.node, component: type, removed: true, verified: 'component absence readback', saved: false };
      }
      const mustEnsure = mode === 'ensure' || p.ensure !== false;
      let added = false;
      let target = current;
      if (!target && mustEnsure) {
        if (p.dryRun) {
          validateDryRun(type, p.properties || {});
          return { node: p.node, component: type, type, dryRun: true, wouldAdd: true, properties: p.properties || {}, note: 'Component is missing; semantic fields checked from the Creator 3.8.x contract. No edits made.' };
        }
        await dispatch('component.add', { uuid: (await dispatch('node.resolve', { target: p.node })).uuid, component: type });
        target = await findComponent(dispatch, p.node, type);
        added = true;
      }
      if (!target) throw new Error(`${type} is not attached to ${p.node}; set ensure=true or use action=ensure.`);
      const properties = semanticProperties(type, p.properties || {}, target);
      if (mode === 'ensure' && !Object.keys(properties).length) return { node: target.node, component: target.component, type, ensured: true, added, properties: compactProperties(target), verified: 'typed inspector readback', saved: false };
      if (!Object.keys(properties).length) throw new Error('Supply at least one UI layout property for configure.');
      const result = await dispatch('component.patch', { node: target.node, component: target.component, properties, dryRun: !!p.dryRun });
      if (p.dryRun) return { ...result, type, added, note: 'Semantic enums and node references checked; no edits made.' };
      const after = await findComponent(dispatch, target.node, type);
      return { ...result, node: target.node, component: target.component, type, added, properties: compactProperties(after), verified: 'typed inspector readback', saved: false };
    },
  };
}

module.exports = { COMPONENTS, FIELDS, createUILayout, normalizeEnum, semanticProperties };
