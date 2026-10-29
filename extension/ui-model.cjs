'use strict';
function bounds(points) {
  if (points.length !== 4 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z))) throw new Error('UI transform contains non-finite geometry.');
  const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
  return { x, y, width: Math.max(...points.map(p => p.x)) - x, height: Math.max(...points.map(p => p.y)) - y };
}
const outside = (a, b, tolerance = 0.5) => a.x < b.x - tolerance || a.y < b.y - tolerance || a.x + a.width > b.x + b.width + tolerance || a.y + a.height > b.y + b.height + tolerance;
function intersection(a, b) {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x), height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? { x: Math.max(a.x,b.x), y: Math.max(a.y,b.y), width, height } : null;
}
function validateMeasurements(nodes, { tolerance = 0.5, overlaps = false, limit = 100, minFontSize = 12 } = {}) {
  const issues = []; let pairChecks = 0, pairBudgetExceeded = false;
  const add = (rule, severity, node, evidence) => issues.push({ rule, severity, node: node.uuid, path: node.path, evidence });
  for (const n of nodes) {
    if (!n.active || !n.ui) continue;
    if (n.nonPlanar || n.canvas?.camera?.projection === 1) add('ui.projection-limit','info',n,{nonPlanar:!!n.nonPlanar,projection:n.canvas?.camera?.projection,note:'Canvas-local AABB checks do not model perspective or 3D tilted UI projection.'});
    if (n.size.width <= 0 || n.size.height <= 0) add('ui.zero-size', 'warning', n, { size: n.size });
    if (!n.canvas) add('ui.no-canvas', 'warning', n, { scope: 'No project Canvas ancestor' });
    else {
      if (n.renderable && (!n.canvas.active || !n.canvas.camera?.active || !(n.canvas.camera.visibility & n.layer))) add('ui.camera-layer', 'warning', n, { canvas: n.canvas.uuid, camera: n.canvas.camera, layer: n.layer });
      if (n.uuid !== n.canvas.uuid && outside(n.bounds, n.canvas.bounds, tolerance)) add('ui.outside-canvas', 'warning', n, { bounds: n.bounds, canvasBounds: n.canvas.bounds, clippedBy: n.clippedBy, note: 'Canvas-local rectangles; scrolling/intentional offscreen content may be valid.' });
    }
    if (n.text?.enabled) {
      if (!n.text.useSystemFont && !n.text.font) add('text.missing-font', 'error', n, { component: n.text.type });
      if (n.text.actualFontSize > 0 && n.text.actualFontSize < minFontSize) add('text.small-render-size', 'warning', n, { requested: n.text.fontSize, actual: n.text.actualFontSize, threshold: minFontSize });
      if (n.text.missingGlyphs?.length) add('text.missing-bitmap-glyphs', 'error', n, { missingGlyphs: n.text.missingGlyphs });
    }
  }
  if (overlaps) {
    const buttons = nodes.filter(n => n.active && n.button && n.ui && n.canvas);
    pairs: for (let i = 0; i < buttons.length; i++) for (let j = i + 1; j < buttons.length; j++) {
      if (++pairChecks > 10000) { pairBudgetExceeded = true; break pairs; }
      const a = buttons[i], b = buttons[j];
      if (a.canvas.uuid !== b.canvas.uuid || a.ancestors.includes(b.uuid) || b.ancestors.includes(a.uuid)) continue;
      const overlap = intersection(a.bounds,b.bounds);
      if (overlap) add('ui.potential-button-overlap','info',a,{ other: b.uuid, otherPath: b.path, overlap, note:'AABB overlap only; not a hit-test, pixel-occlusion or draw-order assertion.' });
    }
  }
  return { issues: issues.slice(0,limit), issueCount: issues.length, counts: { error: issues.filter(i => i.severity === 'error').length, warning: issues.filter(i => i.severity === 'warning').length, info: issues.filter(i => i.severity === 'info').length }, truncated: issues.length > limit, pairChecks: Math.min(pairChecks,10000), pairBudgetExceeded };
}
function textChanges(p, properties) {
  const label = p.component === 'cc.Label', changes = {};
  const put = (key,value) => { if (value !== undefined) { if (!properties[key]) throw new Error(`${p.component} does not expose ${key} in this Creator.`); changes[key] = value; } };
  const enumeration = (key,name) => {
    if (name === undefined) return;
    const entry = properties[key]?.enumList?.find(e => e.name.toUpperCase() === name);
    if (!entry) throw new Error(`Unsupported ${key} value: ${name}`);
    put(key,entry.value);
  };
  put('string',p.text);put('fontSize',p.fontSize);put('lineHeight',p.lineHeight);put(label ? 'color' : 'fontColor',p.color);
  enumeration('horizontalAlign',p.horizontalAlign);enumeration('verticalAlign',p.verticalAlign);
  for (const [input,key] of [['wrap','enableWrapText'],['spacing','spacingX'],['bold','isBold'],['italic','isItalic'],['underline','isUnderline']]) {
    if (p[input] !== undefined && !label) throw new Error(`${input} applies to Label. Use RichText markup for inline styles.`);
    put(key,p[input]);
  }
  if (p.overflow !== undefined && !label) throw new Error('RichText uses maxWidth, not Label overflow.');
  enumeration('overflow',p.overflow);
  if (p.maxWidth !== undefined && label) throw new Error('maxWidth applies to RichText. Set Label UITransform contentSize for constrained text.');
  put('maxWidth',p.maxWidth);
  if (p.font?.system) { put('font',null);put('useSystemFont',true);put('fontFamily',p.font.system); }
  if (p.font?.asset) { put('font',{$asset:p.font.asset});put('useSystemFont',false); }
  if (!Object.keys(changes).length) throw new Error('Supply at least one text/style/font change.');
  return changes;
}
module.exports = { bounds, outside, intersection, validateMeasurements, textChanges };
