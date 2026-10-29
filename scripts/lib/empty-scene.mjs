import { randomUUID } from 'node:crypto';
// Keep only the reachable scene environment; never copy game objects or IDs.
export function emptyScene(source, name) {
  const data = JSON.parse(source), sceneIndex = data[0].scene.__id__;
  data[sceneIndex]._children = []; data[sceneIndex]._components = []; data[sceneIndex]._id = randomUUID();
  data[0]._name = name; data[sceneIndex]._name = name;
  const mapping = new Map(), output = [];
  function object(index) {
    if (mapping.has(index)) return mapping.get(index);
    const target = output.length; mapping.set(index, target); output.push(null);
    output[target] = value(data[index]); return target;
  }
  function value(v) {
    if (Array.isArray(v)) return v.map(value);
    if (v && typeof v === 'object') {
      if (Object.hasOwn(v, '__id__')) return { __id__: object(v.__id__) };
      return Object.fromEntries(Object.entries(v).map(([k, v]) => [k, value(v)]));
    }
    return v;
  }
  object(0); return JSON.stringify(output, null, 2);
}
