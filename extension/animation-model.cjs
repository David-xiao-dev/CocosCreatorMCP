'use strict';
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const channels = { real: ['value'], vector2: ['x', 'y'], vector3: ['x', 'y', 'z'], vector4: ['x', 'y', 'z', 'w'], color: ['r', 'g', 'b', 'a'], size: ['width', 'height'], quat: ['value'], object: ['value'] };
function validateSpec(p) {
  let count = 0; const targets = new Set();
  for (const t of p.tracks || []) {
    const allowed = channels[t.type]; if (!allowed) throw new Error(`Unsupported track type: ${t.type}`);
    if (!t.property || t.property.split('.').some(k => forbidden.has(k) || !/^[A-Za-z][A-Za-z0-9_]*$/.test(k))) throw new Error('Use public property names without prototype/private paths.');
    if (t.nodePath?.split('/').some(k => k === '..' || k === '.')) throw new Error('Track nodePath must be a relative child path without traversal.');
    const target = `${t.nodePath || ''}:${t.component || ''}:${t.property}`;
    if (targets.has(target)) throw new Error(`Duplicate animation target: ${target}`); targets.add(target);
    const names = Object.keys(t.channels);
    if (!names.length || names.some(n => !allowed.includes(n))) throw new Error(`Invalid channels for ${t.type}; use ${allowed.join(',')}`);
    for (const keys of Object.values(t.channels)) {
      let previous = -Infinity;
      for (const key of keys) {
        if (++count > 20000) throw new Error('Animation exceeds 20000 keyframes.');
        if (!Number.isFinite(key.time) || key.time < 0 || key.time > p.duration || key.time <= previous) throw new Error('Keyframe times must be strictly increasing inside clip duration.');
        previous = key.time;
        if (t.type === 'quat') {
          if (key.interpolation === 'CUBIC') throw new Error('Quaternion tracks support LINEAR (SLERP) or CONSTANT interpolation, not CUBIC.');
          if (!key.value || ['x','y','z','w'].some(k => !Number.isFinite(key.value[k])) || Math.abs(Math.hypot(key.value.x,key.value.y,key.value.z,key.value.w) - 1) > 0.001) throw new Error('Quaternion keyframes must be normalized {x,y,z,w}.');
        } else if (t.type === 'object') {
          const v = key.value;
          if (v && typeof v === 'object' && (Object.keys(v).length !== 1 || typeof v.$asset !== 'string')) throw new Error('Object track keys accept primitives, null or {$asset:uuidOrUrl}.');
        } else if (!Number.isFinite(key.value)) throw new Error('Numeric animation tracks require finite keyframe values.');
        if (t.type === 'color' && (key.value < 0 || key.value > 255)) throw new Error('Color channels must be between 0 and 255.');
      }
    }
  }
  for (const e of p.events || []) if (e.time < 0 || e.time > p.duration || !/^[A-Za-z][A-Za-z0-9_]*$/.test(e.method) || forbidden.has(e.method)) throw new Error('Animation events require a public method and time inside duration.');
  return { tracks: p.tracks?.length || 0, keyframes: count, events: p.events?.length || 0 };
}
module.exports = { channels, validateSpec };
