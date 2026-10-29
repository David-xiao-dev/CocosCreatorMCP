import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{bounds,validateMeasurements,textChanges}=require('../extension/ui-model.cjs'),{measurements}=require('../extension/ui-engine.cjs'),{createTypography}=require('../extension/typography.cjs');
const canvas={uuid:'canvas',active:true,bounds:{x:-100,y:-100,width:200,height:200},camera:{active:true,visibility:1,projection:0}};
const node=(uuid,extra={})=>({uuid,path:uuid,active:true,ui:true,renderable:true,layer:1,size:{width:20,height:20},bounds:{x:0,y:0,width:20,height:20},canvas,ancestors:['canvas'],...extra});
test('UI bounds include transformed corners and reject non-finite geometry',()=>{
 assert.deepEqual(bounds([{x:0,y:0,z:0},{x:0,y:100,z:0},{x:-40,y:100,z:0},{x:-40,y:0,z:0}]),{x:-40,y:0,width:40,height:100});
 assert.throws(()=>bounds([{x:NaN,y:0,z:0},...Array(3).fill({x:0,y:0,z:0})]),/non-finite/);
});
test('validation separates camera/layer, Canvas overflow, font and informational overlap evidence',()=>{
 const nodes=[node('outside',{bounds:{x:95,y:0,width:20,height:20}}),node('layer',{layer:2}),node('disabled',{active:false,size:{width:0,height:0}}),node('text',{text:{enabled:true,type:'cc.Label',fontSize:30,actualFontSize:8,useSystemFont:false,font:null,missingGlyphs:['?']}}),node('a',{button:true}),node('b',{button:true})];
 const report=validateMeasurements(nodes,{overlaps:true});
 for(const rule of ['ui.outside-canvas','ui.camera-layer','text.missing-font','text.small-render-size','text.missing-bitmap-glyphs','ui.potential-button-overlap'])assert.ok(report.issues.some(i=>i.rule===rule),rule);
 assert.ok(!report.issues.some(i=>i.node==='disabled'));
 assert.equal(report.issues.find(i=>i.rule==='ui.potential-button-overlap').severity,'info');
 assert.ok(!validateMeasurements([node('container',{renderable:false,layer:2})]).issues.length);
});
test('UI diagnostics report output and overlap budgets and skip nested/cross-Canvas pairs',()=>{
 const nodes=Array.from({length:150},(_,i)=>node('b'+i,{button:true}));
 const report=validateMeasurements(nodes,{overlaps:true,limit:3});assert.equal(report.issues.length,3);assert.equal(report.truncated,true);assert.equal(report.pairBudgetExceeded,true);assert.equal(report.pairChecks,10000);
 const nested=[node('a',{button:true}),node('b',{button:true,ancestors:['a','canvas']}),node('c',{button:true,canvas:{...canvas,uuid:'other'}})];
 assert.equal(validateMeasurements(nested,{overlaps:true}).issues.length,0);
 assert.equal(validateMeasurements([node('epsilon',{bounds:{x:90.2,y:0,width:10,height:10}})],{tolerance:0.5}).issues.length,0);
});
test('text semantic enum mapping rejects unsupported styles before a native edit',()=>{
 const props=Object.fromEntries(['font','useSystemFont','fontFamily','string','fontSize','isBold','fontColor','maxWidth','horizontalAlign','overflow'].map(k=>[k,{}]));
 props.horizontalAlign.enumList=[{name:'LEFT',value:0},{name:'CENTER',value:1}];props.overflow.enumList=[{name:'SHRINK',value:2}];
 assert.deepEqual(textChanges({component:'cc.Label',font:{system:'Arial'},horizontalAlign:'LEFT',overflow:'SHRINK'},props),{horizontalAlign:0,overflow:2,font:null,useSystemFont:true,fontFamily:'Arial'});
 assert.throws(()=>textChanges({component:'cc.RichText',bold:true},props),/applies to Label/);
 assert.throws(()=>textChanges({component:'cc.Label',maxWidth:200},props),/applies to RichText/);
 assert.throws(()=>textChanges({component:'cc.Label',horizontalAlign:'RIGHT'},props),/Unsupported/);
 assert.throws(()=>textChanges({component:'cc.Label'},props),/at least one/);
});
test('typography font precheck rejects bitmap RichText before component.patch',async()=>{
 let writes=0;
 const typography=createTypography({request:async(pkg,msg)=>{if(msg==='query-node-tree')return {uuid:'scene',children:[{uuid:'node',name:'Text'}]};throw Error(msg);},dispatch:async(action)=>{
  if(action==='component.properties')return {component:'component',properties:{font:{},useSystemFont:{}}};
  if(action==='font.inspect')return {kind:'bitmap'};
  if(action==='component.patch'){writes++;return {};}
  throw Error(action);
 }});
 await assert.rejects(typography.dispatch('text.configure',{node:'node',component:'cc.RichText',font:{asset:'bitmap'}}),/requires a TTFFont/);assert.equal(writes,0);
});
test('UI measurement excludes renderer-generated and editor-only children and honors node budget',()=>{
 class Vec3{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}}
 class Scene{};const cc={Vec3,Scene,Canvas:'canvas',UITransform:'ui',UIRenderer:'renderer',Button:'button',Mask:'mask',Label:'label',RichText:'rich'};
 const make=(uuid,comps={})=>({uuid,name:uuid,children:[],activeInHierarchy:true,layer:1,getComponent:type=>comps[type]||null,getComponents:()=>[]});
 const root=Object.assign(new Scene(),make('scene')),canvasNode=make('canvas',{canvas:{enabled:true,cameraComponent:{uuid:'cam',enabled:true,node:{activeInHierarchy:true},visibility:1,projection:0}},ui:{width:200,height:200,anchorX:.5,anchorY:.5,convertToNodeSpaceAR:p=>p,convertToWorldSpaceAR:p=>p}});
 const child=make('child',{ui:{width:100,height:40,anchorX:0,anchorY:0,convertToWorldSpaceAR:p=>new Vec3(-p.y,p.x,p.z)}}),helper=make('helper');root.children=[canvasNode,helper];canvasNode.parent=root;canvasNode.children=[child];child.parent=canvasNode;child.children=[make('generated-rich-label')];
 cc.director={getScene:()=>root};const tree={uuid:'scene',children:[{uuid:'canvas',children:[{uuid:'child'}]}]};
 const result=measurements(cc,tree,'child');assert.equal(result.nodes.length,1);assert.deepEqual(JSON.parse(JSON.stringify(result.nodes[0].bounds)),{x:-40,y:0,width:40,height:100});
 assert.throws(()=>measurements(cc,tree,'helper'),/project hierarchy/);
 const limited=measurements(cc,tree,'scene',true,false,1);assert.equal(limited.nodeCount,3);assert.equal(limited.truncated,true);
});
test('compact UI measurement preserves geometry and budgets while deduplicating Canvas metadata',async()=>{
 const nodes=[node('a',{corners:Array(4).fill({x:0,y:0,z:0}),text:{type:'cc.Label',font:'font',fontSize:24,actualFontSize:20,textPreview:'abc',fontInfo:{large:'metadata'}}}),node('b')];
 const source={scene:'scene',nodes,nodeCount:3,truncated:true,scope:'canvas-local'};
 const typography=createTypography({request:async(pkg,msg)=>msg==='query-node-tree'?{uuid:'scene'}:structuredClone(source),dispatch:async()=>{throw Error('Unexpected edit');}});
 const full=await typography.dispatch('ui.measure',{node:'scene',detail:'full'}),compact=await typography.dispatch('ui.measure',{node:'scene'});
 assert.deepEqual(full,source);assert.equal(compact.canvases.length,1);assert.equal(compact.nodeCount,3);assert.equal(compact.truncated,true);
 for(let i=0;i<nodes.length;i++){assert.deepEqual(compact.nodes[i].bounds,full.nodes[i].bounds);assert.deepEqual(compact.nodes[i].size,full.nodes[i].size);assert.equal(compact.nodes[i].canvas,'canvas');}
 assert.equal(compact.nodes[0].text.actualFontSize,20);assert.equal(compact.nodes[0].text.fontInfo,undefined);assert.ok(JSON.stringify(compact).length<JSON.stringify(full).length);
});
