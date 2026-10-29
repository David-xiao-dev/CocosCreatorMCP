'use strict';
const { channels, validateSpec } = require('./animation-model.cjs');
const load = (cc, uuid) => new Promise((resolve, reject) => cc.assetManager.loadAny(uuid, (err, a) => err ? reject(err) : resolve(a)));
async function deserialize(cc, text) {
  const details = new cc.deserialize.Details();
  const asset = cc.deserialize(JSON.parse(text), details);
  const assets = new Map();
  for (const uuid of new Set(details.uuidList || [])) assets.set(uuid, await load(cc, uuid));
  details.assignAssetsBy(uuid => assets.get(uuid));
  if (!(asset instanceof cc.AnimationClip)) throw new Error('Expected a serialized AnimationClip.');
  return asset;
}
function describeTrack(cc, t, includeKeys, time) {
  const path = [];
  for (let i = 0; i < t.path.length; i++) {
    if (t.path.isHierarchyAt(i)) path.push({ node: t.path.parseHierarchyAt(i) });
    else if (t.path.isComponentAt(i)) path.push({ component: t.path.parseComponentAt(i) });
    else if (t.path.isPropertyAt(i)) path.push({ property: t.path.parsePropertyAt(i) });
    else if (t.path.isElementAt(i)) path.push({ element: t.path.parseElementAt(i) });
    else path.push({ unsupported: true });
  }
  const value = v => v instanceof cc.Asset ? { uuid: v._uuid } : v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
  const type = cc.js.getClassName(t), names = type.endsWith('VectorTrack') ? ['x','y','z','w'].slice(0,t.componentsCount)
    : type.endsWith('ColorTrack') ? channels.color : type.endsWith('SizeTrack') ? channels.size : ['value'];
  return { type, path, ...(type.endsWith('VectorTrack') ? { componentsCount: t.componentsCount } : {}), channels: [...t.channels()].slice(0,names.length).map((c,i) => ({ name: names[i], keyframes: c.curve.keyFramesCount,
    ...(includeKeys ? { keys: [...c.curve].map(([time, v]) => ({ time, value: value(v) })) } : {}), ...(time !== undefined ? { sampled: value(c.curve.evaluate(time)) } : {}) })) };
}
async function animationSerialize(cc, serializer, spec, original) {
  const clip = original ? await deserialize(cc, original) : new cc.AnimationClip(spec.name);
  const duration = spec.duration ?? clip.duration;
  validateSpec({ ...spec, duration });
  if (spec.name !== undefined) clip.name = spec.name;
  if (spec.duration !== undefined) clip.duration = spec.duration;
  if (spec.sample !== undefined) clip.sample = spec.sample;
  if (spec.speed !== undefined) clip.speed = spec.speed;
  if (spec.wrap !== undefined) clip.wrapMode = cc.AnimationClip.WrapMode[spec.wrap];
  if (spec.tracks !== undefined) {
    clip.clearTracks();
    for (const s of spec.tracks) {
      if (s.component && !cc.js.getClassByName(s.component)) throw new Error(`Unregistered component: ${s.component}`);
      const types = { real: 'RealTrack', vector2: 'VectorTrack', vector3: 'VectorTrack', vector4: 'VectorTrack', color: 'ColorTrack', size: 'SizeTrack', quat: 'QuatTrack', object: 'ObjectTrack' };
      const t = new cc.animation[types[s.type]]();
      t.path = new cc.animation.TrackPath();
      if (s.nodePath) t.path.toHierarchy(s.nodePath);
      if (s.component) t.path.toComponent(s.component);
      for (const prop of s.property.split('.')) t.path.toProperty(prop);
      if (s.type.startsWith('vector')) t.componentsCount = Number(s.type.slice(-1));
      const list = [...t.channels()];
      for (const [name, keys] of Object.entries(s.channels)) {
        const c = list[channels[s.type].indexOf(name)];
        const pairs = [];
        for (const key of keys) {
          let value;
          if (s.type === 'object') value = key.value?.$asset ? await load(cc, key.value.$asset) : key.value;
          else if (s.type === 'quat') value = { value: new cc.Quat(key.value.x, key.value.y, key.value.z, key.value.w), interpolationMode: key.interpolation === 'CONSTANT' ? cc.QuatInterpolationMode.CONSTANT : cc.QuatInterpolationMode.SLERP };
          else value = { value: key.value, interpolationMode: cc.RealInterpolationMode[key.interpolation || 'LINEAR'], leftTangent: key.leftTangent || 0, rightTangent: key.rightTangent || 0 };
          pairs.push([key.time, value]);
        }
        c.curve.assignSorted(pairs);
      }
      clip.addTrack(t);
    }
  }
  if (spec.events !== undefined) clip.events = spec.events.map(e => ({ frame: e.time, func: e.method, params: e.args || [] }));
  // Shrinking a clip must also validate unchanged tracks and events.
  for (const t of clip.tracks) for (const ch of t.channels()) for (const [time] of ch.curve) if (time < 0 || time > duration) throw new Error('An existing keyframe lies outside the requested duration.');
  if (clip.events.some(e => e.frame > duration || e.frame < 0)) throw new Error('An existing event lies outside duration.');
  return { content: serializer(clip), name: clip.name, duration: clip.duration, tracks: clip.tracksCount, events: clip.events.length };
}
async function animationRead(cc, text, includeKeys, time) {
  const clip = await deserialize(cc, text);
  return { name: clip.name, duration: clip.duration, sample: clip.sample, speed: clip.speed, wrapMode: clip.wrapMode, events: clip.events,
    tracks: [...clip.tracks].map(t => describeTrack(cc, t, includeKeys, time)), ...(time !== undefined ? { time, scope: 'Curve values only, not bound target state or runtime playback.' } : {}) };
}
async function spineRead(cc, uuid) {
  const asset = await load(cc, uuid);
  if (!(asset instanceof cc.sp.SkeletonData)) throw new Error('Expected imported sp.SkeletonData.');
  const json = asset.skeletonJson;
  const version = json?.skeleton?.spine || null;
  const compatible = version ? cc.sp.isJsonCompatible(json) : null;
  if (compatible === false) return { uuid, runtimeVersion: cc.sp.SPINE_VERSION, sourceVersion: version, compatible: false, loaded: false, animations: [], skins: [], bones: [], slots: [], textures: [] };
  const runtime = asset.getRuntimeData(true);
  return { uuid, runtimeVersion: cc.sp.SPINE_VERSION, sourceVersion: version, compatible, loaded: !!runtime, binary: !version,
    animations: runtime?.animations?.map(a => ({ name: a.name, duration: a.duration })) || [], skins: runtime?.skins?.map(s => s.name) || [],
    bones: runtime?.bones?.map(b => b.name) || [], slots: runtime?.slots?.map(s => s.name) || [], events: runtime?.events?.map(e => e.name) || [],
    textures: asset.textures.map((t, i) => ({ name: asset.textureNames[i], uuid: t?._uuid || null, width: t?.width, height: t?.height })),
    note: 'Runtime parse and direct textures are checked. Binary version requires a compatible binary resource; null compatibility is not a successful version check.' };
}
module.exports = { animationSerialize, animationRead, spineRead };
