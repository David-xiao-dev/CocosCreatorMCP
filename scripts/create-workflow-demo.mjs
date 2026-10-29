import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {BridgeClient} from '../src/client.mjs';
import {emptyScene} from './lib/empty-scene.mjs';
import {robotPng,atlas,skeleton,motion,tree,probeScript} from '../examples/animation-spine/fixture.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))), project=path.join(root,'test-project');
const c=new BridgeClient(project),call=async(a,p={})=>(await c.call(a,p)).result;
const db=(message,...args)=>call('editor.request',{package:'asset-db',message,args});
const req=(message,...args)=>call('editor.request',{package:'scene',message,args});
const base='db://assets/MCP_WorkflowAssets',url='db://assets/MCP_WorkflowDemo.scene',script='db://assets/McpWorkflowProbe.ts',clip=base+'/Motion.anim';
const checks=[];let passed=false;
const pass=s=>{checks.push(s);console.log('PASS '+s);};
try{
  const status=await call('status');assert.equal(path.resolve(status.project),project);assert.equal(status.editorVersion,'3.8.8');
  if(await req('query-dirty'))throw Error('Save current scene first. Demo never saves unrelated edits.');
  const current=await req('query-current-scene'),existing=await db('query-asset-info',url),resume=process.argv.includes('--resume');
  if(existing&&(!resume||existing.uuid!==current))throw Error('Demo scene already exists; open it and use --resume to reconfigure its own fixture.');
  if(!await db('query-asset-info',base)){
    const folder=path.join(root,'artifacts/workflow-fixture');await fs.mkdir(folder,{recursive:true});
    await fs.writeFile(path.join(folder,'robot.png'),robotPng());await fs.writeFile(path.join(folder,'robot-warm.png'),robotPng(true));await fs.writeFile(path.join(folder,'robot.atlas'),atlas);await fs.writeFile(path.join(folder,'robot.json'),JSON.stringify(skeleton,null,2));
    await call('asset.import',{source:folder,url:base});
  }
  const spine=await call('spine.inspect',{asset:base+'/robot.json'});assert.equal(spine.compatible,true);assert.equal(spine.loaded,true);assert.equal(spine.textures[0].width,16);
  const graph=await call('asset.graph',{asset:base+'/robot.json',depth:4});assert.equal(graph.missing.length,0);assert.ok(graph.nodes.some(a=>a.type==='cc.Texture2D'));pass('original Spine 3.8 fixture imports, runtime parses, texture dependency graph resolves');
  if(!await db('query-asset-info',script))await call('asset.write',{url:script,content:probeScript});
  const deadline=Date.now()+25000;while(!(await call('script.status',{className:'McpWorkflowProbe',asset:script})).registered){if(Date.now()>deadline)throw Error('Script did not register.');await new Promise(r=>setTimeout(r,150));}
  if(!existing){const info=await db('query-asset-info',current);await call('asset.write',{url,content:emptyScene(await fs.readFile(info.file,'utf8'),'MCP_WorkflowDemo')});await call('scene.open',{asset:url});await call('ui.build',{tree});}
  const node='Canvas/WorkflowDemo/MovingSprite',spineNode='Canvas/WorkflowDemo/SpineActor';
  for(const name of ['robot.png','robot-warm.png']){
    const meta=await db('query-asset-meta',base+'/'+name);
    if(meta.userData.type!=='sprite-frame'){meta.userData.type='sprite-frame';await db('save-asset-meta',base+'/'+name,JSON.stringify(meta));}
  }
  const image=await db('query-asset-info',base+'/robot.png'),frame=Object.values(image.subAssets).find(a=>a.type==='cc.SpriteFrame');assert.ok(frame);
  await call('component.patch',{node,component:'cc.Sprite',properties:{sizeMode:0,spriteFrame:{$asset:frame.uuid}}});
  await call('component.patch',{node,component:'cc.UITransform',properties:{contentSize:{width:128,height:128}}});
  if(!await db('query-asset-info',clip))await call('animation.create',{url:clip,spec:motion});
  const parsed=await call('animation.inspect',{asset:clip});assert.equal(parsed.tracks.length,2);assert.equal(parsed.events.length,1);
  const sample=await call('animation.sample',{asset:clip,time:0.5});assert.equal(sample.tracks[0].channels[0].sampled,-140);
  await call('animation.bind',{node,asset:clip,playOnLoad:true});
  await call('script.attach',{node,className:'McpWorkflowProbe',asset:script,requiredMethods:['onPulse']});
  await call('component.patch',{node,component:'McpWorkflowProbe',properties:{label:{$component:{node:'Canvas/WorkflowDemo/EventCount',type:'cc.Label'}}}});
  pass('native animation authoring, curve sample, Animation binding and business event receiver configured');
  await call('spine.configure',{node:spineNode,asset:base+'/robot.json',skin:'default',animation:'idle',loop:true});
  pass('Spine skeleton/skin/animation configured through validated native properties');
  await call('scene.save');await call('scene.open',{asset:current});await call('scene.open',{asset:url});
  const props=(await call('component.properties',{node,component:'cc.Animation',names:['clips','defaultClip','playOnLoad']})).properties;
  assert.equal(props.playOnLoad.value,true);assert.ok(props.clips.value.some(a=>a.uuid===parsed.assetUuid));
  const bound=(await call('component.properties',{node:spineNode,component:'sp.Skeleton',names:['skeletonData','defaultAnimation','defaultSkin']})).properties;
  assert.equal(bound.skeletonData.value.uuid,spine.uuid);assert.equal(bound.defaultAnimation.value,'idle');
  pass('scene save/reopen preserves animation/Spine assets and autoplay configuration');passed=true;
}finally{
  await fs.writeFile(path.join(root,'artifacts/workflow-demo.json'),JSON.stringify({passed,time:new Date().toISOString(),project,scene:url,assetFolder:base,checks},null,2));
  if(!passed)process.exitCode=1;
}
