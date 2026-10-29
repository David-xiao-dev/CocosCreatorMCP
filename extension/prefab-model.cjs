'use strict';
const { createHash } = require('crypto');
const revision = text => createHash('sha256').update(text).digest('hex');
function assetUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('db://assets/') || !url.endsWith('.prefab') || /[\\%?#\x00-\x1f]/.test(url) || url.slice(12).split('/').some(p => !p || p === '.' || p === '..' || p.includes(':'))) throw new Error('Use a project db://assets/.../*.prefab URL without traversal or URL escapes.');
  return url;
}
function serialized(text) {
  if (Buffer.byteLength(text) > 8 * 1024 * 1024) throw new Error('Prefab exceeds the 8 MiB inspection limit.');
  const data = JSON.parse(text);
  if (!Array.isArray(data) || data.length > 50000 || data[0]?.__type__ !== 'cc.Prefab' || data[data[0]?.data?.__id__]?.__type__ !== 'cc.Node') throw new Error('Expected Creator prefab serialization with a Node root.');
  const assets = new Set(), types = new Set(); let references = 0;
  function visit(v, depth) {
    if (depth > 100) throw new Error('Prefab value nesting exceeds 100 levels.');
    if (!v || typeof v !== 'object') return;
    if (Object.hasOwn(v, '__id__')) {
      if (!Number.isInteger(v.__id__) || v.__id__ < 0 || v.__id__ >= data.length || !data[v.__id__]) throw new Error(`Broken serialized object reference: ${v.__id__}`);
      references++;
    }
    if (typeof v.__uuid__ === 'string' && v.__uuid__) assets.add(v.__uuid__);
    if (typeof v.__type__ === 'string') types.add(v.__type__);
    for (const child of Object.values(v)) visit(child, depth + 1);
  }
  for (const object of data) visit(object, 0);
  return { objects: data.length, nodes: data.filter(v => v?.__type__ === 'cc.Node').length, references, assets: [...assets], types: [...types], rootName: data[data[0].data.__id__]._name };
}
module.exports = { revision, assetUrl, serialized };
