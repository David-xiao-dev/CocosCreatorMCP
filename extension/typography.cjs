'use strict';
const {resolveNode}=require('./development-model.cjs');
const {textChanges,validateMeasurements}=require('./ui-model.cjs');
function createTypography({request,dispatch}) {
  const scene=(method,args)=>request('scene','execute-scene-script',{name:'cocos-codex-bridge',method,args});
  const hierarchy=()=>request('scene','query-node-tree');
  return {async dispatch(action,p) {
    if(action==='font.inspect') {
      const info=await request('asset-db','query-asset-info',p.asset);
      if(!info?.imported)throw new Error('Imported font asset not found.');
      return {asset:info.url,...await scene('inspectFont',[info.uuid,p.text])};
    }
    const tree=await hierarchy(),node=p.node ? resolveNode(tree,p.node) : tree;
    if(action==='ui.measure'||action==='ui.validate') {
      const result=await scene('measureUI',[tree,node.uuid,action==='ui.validate'||p.subtree,p.includeInactive,p.maxNodes]);
      if(action==='ui.measure') {
        if(p.detail==='full')return result;
        const canvases=[...new Map(result.nodes.filter(n=>n.canvas).map(n=>[n.canvas.uuid,n.canvas])).values()];
        return {...result,canvases,nodes:result.nodes.map(n=>({uuid:n.uuid,path:n.path,active:n.active,ui:n.ui,canvas:n.canvas?.uuid||null,...(n.ui?{size:n.size,bounds:n.bounds,space:n.space,nonPlanar:n.nonPlanar}:{}),...(n.text?{text:{type:n.text.type,font:n.text.font,fontSize:n.text.fontSize,actualFontSize:n.text.actualFontSize,textPreview:n.text.textPreview}}:{})})),detail:'compact'};
      }
      const report=validateMeasurements(result.nodes,p);
      return {scene:result.scene,root:node.uuid,scanned:result.nodes.length,nodeCount:result.nodeCount,nodeBudgetExceeded:result.truncated,...report,scope:result.scope,
        checked:['ui.projection-limit','ui.zero-size','ui.no-canvas','ui.camera-layer','ui.outside-canvas','text.missing-font','text.small-render-size','text.missing-bitmap-glyphs',...(p.overlaps?['ui.potential-button-overlap']:[])],completeWithinScope:!result.truncated&&!report.truncated&&!report.pairBudgetExceeded};
    }
    if(action==='text.inspect')return {node:node.uuid,...await scene('inspectText',[tree,node.uuid,p.component,p.includeText])};
    if(action==='text.configure') {
      const props=await dispatch('component.properties',{node:node.uuid,component:p.component});
      const changes=textChanges(p,props.properties);
      if(p.font?.asset) {
        const font=await dispatch('font.inspect',{asset:p.font.asset,text:p.text||''});
        if(p.component==='cc.RichText'&&font.kind!=='ttf')throw new Error('RichText requires a TTFFont; bitmap fonts are supported by Label.');
      }
      return dispatch('component.patch',{node:node.uuid,component:props.component,properties:changes,dryRun:p.dryRun});
    }
    throw new Error(`Unknown typography/UI operation: ${action}`);
  }};
}
module.exports={createTypography};
