import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {BridgeClient} from '../src/client.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))), c=new BridgeClient(path.join(root,'test-project'));
const call=async(a,p={})=>(await c.call(a,p)).result;
const checks=[],frames=[];let passed=false;
const pass=s=>{checks.push(s);console.log('PASS '+s);};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const runId=process.argv[process.argv.indexOf('--run')+1];
try{
  assert.equal((await call('scene.tree')).name,'MCP_WorkflowDemo');
  let preview;
  if(process.argv.includes('--run')){
    const status=await call('build.status',{runId});assert.equal(status.state,'success');
    const artifacts=await call('build.artifacts',{runId,hashes:true,limit:5});assert.equal(artifacts.artifactVerified,true);
    pass(`native ${status.platform} build success and ${artifacts.fileCount} artifacts verified`);
    preview=await call('build.preview',{runId});
  }else preview=await call('preview.open');
  const windowId=preview.windowId,node='Canvas/WorkflowDemo/MovingSprite',spine='Canvas/WorkflowDemo/SpineActor';
  const inspect=(target,extra={})=>call('runtime.inspect',{windowId,node:target,...extra});
  const animation=(action,extra={})=>call('animation.control',{windowId,node,action,...extra});
  const skeleton=(action,extra={})=>call('spine.control',{windowId,node:spine,action,...extra});
  const deadline=Date.now()+30000;let state;
  while(true){try{state=await inspect(node);if(!state.animation?.[0]?.playing)throw Error('Waiting for autoplay');break;}catch(e){if(Date.now()>deadline)throw e;await wait(250);}}
  assert.equal(state.animation[0].playing,true);
  await animation('sample',{time:0.5});state=await inspect(node);
  assert.equal(state.position.x,-140);assert.equal(state.position.y,25);assert.equal(state.animation[0].paused,true);
  pass('runtime animation sample applies actual target position and pauses state');
  await animation('play',{clip:'Motion'});
  const labelBefore=await inspect('Canvas/WorkflowDemo/EventCount');
  await wait(1100);
  const labelAfter=await inspect('Canvas/WorkflowDemo/EventCount');
  assert.notEqual(labelAfter.label,labelBefore.label);assert.match(labelAfter.label,/motion/);
  await animation('pause');assert.equal((await inspect(node)).animation[0].paused,true);
  await animation('resume');assert.equal((await inspect(node)).animation[0].paused,false);
  await animation('crossFade',{clip:'Motion',fade:0.2});
  pass('runtime play/pause/resume/crossFade and native clip business event update visible Label');
  await skeleton('skin',{skin:'warm'});await skeleton('mix',{from:'idle',to:'hop',duration:0.2});
  await skeleton('play',{animation:'hop',loop:false});await skeleton('queue',{animation:'idle',loop:true});
  await wait(1400);state=await inspect(spine,{bones:['body']});
  assert.equal(state.spine.tracks[0].animation,'idle');assert.equal(state.spine.bones[0].missing,undefined);
  assert.ok(state.events.some(e=>e.kind==='spine.complete'&&e.animation==='hop'),JSON.stringify(state.events));
  assert.ok(state.events.some(e=>e.kind==='spine.event'&&e.event==='pulse'),JSON.stringify(state.events));
  await skeleton('pause');assert.equal((await inspect(spine)).spine.paused,true);
  await skeleton('resume');assert.equal((await inspect(spine)).spine.paused,false);
  pass('Spine skin/mix/play/queue/pause/resume, bone readback, complete and custom events verified');
  await assert.rejects(skeleton('play',{animation:'does-not-exist'}),/not found/);
  const logs=await call('preview.status',{windowId,limit:100});
  assert.equal(logs.logs.filter(l=>l.level===3||l.level==='error').length,0,JSON.stringify(logs.logs));
  const shot=await call('editor.screenshot',{windowId});const filename=path.join(root,'artifacts',process.argv.includes('--run')?`workflow-${runId}.png`:'workflow-preview.png');
  await fs.writeFile(filename,Buffer.from(shot.data,'base64'));frames.push(filename);
  pass('invalid animation rejected, no captured runtime console errors, screenshot saved');passed=true;
}finally{
  const report=process.argv.includes('--run')?`live-build-${runId}.json`:'live-workflow-check.json';
  await fs.writeFile(path.join(root,'artifacts',report),JSON.stringify({passed,time:new Date().toISOString(),runId:process.argv.includes('--run')?runId:undefined,checks,frames},null,2));
  if(!passed)process.exitCode=1;
}
