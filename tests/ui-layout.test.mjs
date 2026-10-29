import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createUILayout } = require('../extension/ui-layout.cjs');

const enums = list => list.map((name, value) => ({ name, value }));
function fixture() {
  const components = new Map();
  const calls = [];
  const defs = {
    'cc.Widget': { alignMode: { type: 'Enum', value: 2, enumList: enums(['ONCE', 'ALWAYS', 'ON_WINDOW_RESIZE']) }, isAlignTop: { type: 'Boolean', value: false }, top: { type: 'Number', value: 0 }, target: { type: 'cc.Node', value: { uuid: '' } } },
    'cc.Layout': { type: { type: 'Enum', value: 0, enumList: enums(['NONE', 'HORIZONTAL', 'VERTICAL', 'GRID']) }, resizeMode: { type: 'Enum', value: 0, enumList: enums(['NONE', 'CONTAINER', 'CHILDREN']) }, paddingLeft: { type: 'Number', value: 0 }, spacingY: { type: 'Number', value: 0 } },
    'cc.ScrollView': { content: { type: 'cc.Node', value: { uuid: '' } }, horizontal: { type: 'Boolean', value: true }, vertical: { type: 'Boolean', value: true }, inertia: { type: 'Boolean', value: true } },
    'cc.Mask': { type: { type: 'Enum', value: 0, enumList: enums(['GRAPHICS_RECT', 'GRAPHICS_ELLIPSE', 'GRAPHICS_STENCIL', 'SPRITE_STENCIL']) }, inverted: { type: 'Boolean', value: false } },
  };
  const node = 'panel';
  const dispatch = async (action, p) => {
    calls.push([action, p]);
    if (action === 'node.resolve') return { uuid: node, path: 'Canvas/Panel', name: 'Panel' };
    if (action === 'component.properties') {
      const type = p.component;
      const values = components.get(type);
      if (!values) throw new Error(`Expected one ${type} component on Panel; found 0.`);
      return { node, component: values.uuid, type, properties: Object.fromEntries(Object.entries(values.props).map(([key, value]) => [key, { ...value, value: values.values[key] }])) };
    }
    if (action === 'component.add') {
      const type = p.component;
      const props = defs[type];
      if (!props) throw new Error(`Unsupported component ${type}`);
      components.set(type, { uuid: `${type}-id`, props, values: Object.fromEntries(Object.entries(props).map(([key, meta]) => [key, meta.value])) });
      return {};
    }
    if (action === 'component.remove') {
      for (const [type, value] of components) if (value.uuid === p.uuid) components.delete(type);
      return { removed: p.uuid };
    }
    if (action === 'component.patch') {
      const values = [...components.values()].find(value => value.uuid === p.component);
      if (!values) throw new Error('component missing');
      if (p.dryRun) return { node, component: p.component, type: 'cc.Mask', dryRun: true, properties: p.properties };
      for (const [key, value] of Object.entries(p.properties)) values.values[key] = value;
      return { node, component: p.component, type: values.props.type, properties: p.properties, changed: Object.keys(p.properties) };
    }
    throw new Error(`unexpected ${action}`);
  };
  return { view: createUILayout({ dispatch }), components, calls };
}

test('ui.layout ensures Widget and converts semantic enum names with native readback', async () => {
  const { view, components } = fixture();
  const result = await view.dispatch('ui.layout', { action: 'ensure', node: 'Panel', component: 'widget', properties: { alignTop: true, top: 24, alignMode: 'ALWAYS' } });
  assert.equal(result.added, true);
  assert.equal(result.properties.isAlignTop, true);
  assert.equal(result.properties.top, 24);
  assert.equal(result.properties.alignMode, 1);
  assert.equal(components.get('cc.Widget').values.alignMode, 1);
});

test('ui.layout configures Layout and ScrollView references in one compact semantic call', async () => {
  const { view } = fixture();
  const layout = await view.dispatch('ui.layout', { action: 'ensure', node: 'Panel', component: 'layout', properties: { type: 'VERTICAL', resizeMode: 'CHILDREN', paddingLeft: 16, spacingY: 8 } });
  assert.equal(layout.properties.type, 2);
  assert.equal(layout.properties.resizeMode, 2);
  assert.equal(layout.properties.spacingY, 8);
  const scroll = await view.dispatch('ui.layout', { action: 'ensure', node: 'Panel', component: 'scrollView', properties: { content: 'Canvas/Panel/Content', vertical: true, horizontal: false } });
  assert.deepEqual(scroll.properties.content, { $node: 'Canvas/Panel/Content' });
  assert.equal(scroll.properties.horizontal, false);
});

test('ui.layout dryRun and removal never claim a missing or invalid component edit succeeded', async () => {
  const { view } = fixture();
  await assert.rejects(view.dispatch('ui.layout', { action: 'configure', node: 'Panel', component: 'mask', properties: { type: 'BAD' } }), /unsupported enum BAD/);
  await view.dispatch('ui.layout', { action: 'ensure', node: 'Panel', component: 'mask', properties: { type: 'GRAPHICS_RECT' } });
  const preview = await view.dispatch('ui.layout', { action: 'configure', node: 'Panel', component: 'mask', properties: { type: 'GRAPHICS_ELLIPSE' }, dryRun: true });
  assert.equal(preview.dryRun, true);
  const removed = await view.dispatch('ui.layout', { action: 'remove', node: 'Panel', component: 'mask' });
  assert.equal(removed.removed, true);
  const absent = await view.dispatch('ui.layout', { action: 'inspect', node: 'Panel', component: 'mask' });
  assert.equal(absent.present, false);
});
