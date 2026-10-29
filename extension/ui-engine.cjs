'use strict';
const { projectNodes } = require('./scene-model.cjs');
const { bounds } = require('./ui-model.cjs');
function fontData(cc, font, text = '') {
  const bitmap = font instanceof cc.BitmapFont;
  const dictionary = bitmap ? font.fntConfig?.fontDefDictionary : null;
  const missingGlyphs = dictionary ? [...new Set([...text].filter(ch => !/[\r\n\t]/.test(ch) && !Object.hasOwn(dictionary,String(ch.codePointAt(0)))))] : null;
  return { uuid: font._uuid, type: cc.js.getClassName(font), kind: bitmap ? 'bitmap' : font instanceof cc.TTFFont ? 'ttf' : 'font',
    ...(bitmap ? { fontSize: font.fontSize, glyphCount: dictionary ? Object.keys(dictionary).length : null, missingGlyphs:missingGlyphs?.slice(0,100)||null,missingGlyphCount:missingGlyphs?.length??null,missingGlyphsTruncated:(missingGlyphs?.length||0)>100, texture: font.spriteFrame?.texture ? { uuid:font.spriteFrame.texture._uuid, width:font.spriteFrame.texture.width,height:font.spriteFrame.texture.height } : null } : { glyphCoverage:'unknown; font loaded is not proof of glyph coverage or identical fallback on another system' }) };
}
async function inspectFont(cc, uuid, text) {
  const font = await new Promise((resolve,reject) => cc.assetManager.loadAny(uuid,(error,value) => error ? reject(error) : resolve(value)));
  if (!(font instanceof cc.Font)) throw new Error('Expected an imported Font resource.');
  return { ...fontData(cc,font,text), loaded:true };
}
function inspectText(cc, node, component, includeText = false) {
  const ctor = component === 'cc.RichText' ? cc.RichText : cc.Label;
  const matches = node.getComponents(ctor);
  if (matches.length !== 1) throw new Error(`Expected one ${component}; found ${matches.length}.`);
  const c = matches[0], label = component === 'cc.Label', text = c.string;
  const font = c.font ? fontData(cc,c.font,label ? text : '') : null;
  return { component:c.uuid,type:component,enabled:c.enabled,useSystemFont:c.useSystemFont,fontFamily:c.fontFamily,font:font?.uuid || null,fontInfo:font,
    textLength:text.length,textPreview:text.slice(0,160),...(includeText ? {text} : {}),fontSize:c.fontSize,lineHeight:c.lineHeight,
    ...(label ? { actualFontSize:c.actualFontSize,overflow:c.overflow,wrap:c.enableWrapText,spacing:c.spacingX,bold:c.isBold,italic:c.isItalic,underline:c.isUnderline,missingGlyphs:font?.missingGlyphs || null } : {maxWidth:c.maxWidth}),
    horizontalAlign:c.horizontalAlign,verticalAlign:c.verticalAlign,scope:'Current engine state. Size is the UITransform rectangle, not measured text ink; fallback/complex shaping need runtime visual checks.' };
}
function measurements(cc, hierarchy, target, subtree = false, includeInactive = false, limit = 200) {
  const all = projectNodes(cc.director.getScene(),hierarchy), allowed = new Set(all), byId = new Map(all.map(n => [n.uuid,n]));
  const root = byId.get(target); if (!root) throw new Error('UI target is not in the editable project hierarchy.');
  const selected = [];const walk = node => { selected.push(node); if(subtree) for(const child of node.children) if(allowed.has(child))walk(child); };walk(root);
  const canvasCache = new Map();
  function canvasInfo(node) {
    let parent = node;
    while(parent && allowed.has(parent) && !parent.getComponent(cc.Canvas))parent = parent.parent;
    if(!parent || !allowed.has(parent))return null;
    if(canvasCache.has(parent.uuid))return canvasCache.get(parent.uuid);
    const canvas = parent.getComponent(cc.Canvas),ui = parent.getComponent(cc.UITransform),camera = canvas.cameraComponent;
    if(!ui)throw new Error('Canvas has no UITransform.');
    const value = { uuid:parent.uuid,name:parent.name,active:parent.activeInHierarchy && canvas.enabled,
      bounds:{x:-ui.anchorX*ui.width,y:-ui.anchorY*ui.height,width:ui.width,height:ui.height},
      camera:camera ? {uuid:camera.uuid,active:camera.enabled && camera.node.activeInHierarchy,visibility:camera.visibility,projection:camera.projection} : null };
    canvasCache.set(parent.uuid,value);return value;
  }
  const out = [];let total = 0;
  for(const node of selected) {
    if(!includeInactive && !node.activeInHierarchy)continue;
    total++;if(out.length>=limit)continue;
    const ancestors=[],names=[];let parent=node;
    while(parent && allowed.has(parent)) { if(!(parent instanceof cc.Scene))names.unshift(parent.name);if(parent!==node)ancestors.push(parent.uuid);parent=parent.parent; }
    const ui = node.getComponent(cc.UITransform),canvas = canvasInfo(node),canvasUi = canvas ? byId.get(canvas.uuid).getComponent(cc.UITransform) : null;
    const base = {uuid:node.uuid,path:names.join('/'),active:node.activeInHierarchy,layer:node.layer,ancestors,ui:!!ui,canvas,renderable:node.getComponents(cc.UIRenderer).some(c=>c.enabled)||!!node.getComponent(cc.RichText)?.enabled,button:!!node.getComponent(cc.Button)?.enabled,clippedBy:ancestors.filter(id=>byId.get(id)?.getComponent(cc.Mask)?.enabled)};
    if(ui) {
      const x=-ui.anchorX*ui.width,y=-ui.anchorY*ui.height;
      const corners = [[x,y],[x+ui.width,y],[x+ui.width,y+ui.height],[x,y+ui.height]].map(([x,y])=>{const world=ui.convertToWorldSpaceAR(new cc.Vec3(x,y,0));const p=canvasUi ? canvasUi.convertToNodeSpaceAR(world) : world;return {x:p.x,y:p.y,z:p.z};});
      Object.assign(base,{size:{width:ui.width,height:ui.height},anchor:{x:ui.anchorX,y:ui.anchorY},corners,bounds:bounds(corners),space:canvas ? 'canvas-local' : 'world',nonPlanar:Math.max(...corners.map(p=>p.z))-Math.min(...corners.map(p=>p.z))>0.01});
    }
    if(node.getComponent(cc.Label))base.text=inspectText(cc,node,'cc.Label');
    else if(node.getComponent(cc.RichText))base.text=inspectText(cc,node,'cc.RichText');
    out.push(base);
  }
  return {scene:hierarchy.uuid,root:target,nodes:out,nodeCount:total,truncated:total>out.length,scope:'Project nodes only; own UI rectangles in each nearest Canvas local coordinates. AABB/corners are not screen pixels, rendered glyph extents or final visibility/occlusion proof.'};
}
module.exports={inspectFont,inspectText,measurements};
