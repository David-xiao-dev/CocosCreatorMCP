'use strict';
// The director scene also contains Creator cameras, gizmos and reference-image
// canvases. Only nodes present in the editor's project hierarchy are user data.
function projectNodes(root, hierarchy) {
  if (!hierarchy || hierarchy.uuid !== root.uuid) throw new Error('Scene changed while reading the project hierarchy. Retry after the scene is ready.');
  const ids = new Set();
  function index(node, depth = 0) {
    if (depth > 100 || ids.size >= 5000) throw new Error('Project hierarchy exceeds 5000 nodes or 100 levels.');
    ids.add(node.uuid);
    for (const child of node.children || []) index(child, depth + 1);
  }
  index(hierarchy);
  const nodes = [];
  function visit(node) {
    if (!ids.has(node.uuid)) return; // Prune the entire editor-only subtree.
    nodes.push(node);
    for (const child of node.children || []) visit(child);
  }
  visit(root);
  if (nodes.length !== ids.size) throw new Error('Project hierarchy and live scene disagree. Retry after the scene is ready.');
  return nodes;
}
module.exports = { projectNodes };
