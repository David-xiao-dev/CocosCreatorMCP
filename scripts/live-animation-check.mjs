import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {BridgeClient} from '../src/client.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),c=new BridgeClient(path.join(root,'test-project'));
const call=async(a,p={})=>(await c.call(a,p)).result;
const checks=[];let passed=false;
const pass=s=>{checks.push(s);console.log('PASS '+s);};
const url=`db://assets/MCP_WorkflowAssets/TrackCheck${Date.now()}.anim`;
try{
  const image=await call('asset.info',{asset:'db://assets/MCP_WorkflowAssets/robot.png'}),frame=image.subAssets.find(a=>a.type==='cc.SpriteFrame').uuid;
  const numeric=(type,property,channels)=>({type,property,channels:Object.fromEntries(channels.map(name=>[name,[{time:0,value:0},{time:1,value:10}]]))});
  const spec={name:'TrackCheck',duration:1,tracks:[numeric('real','speed',['value']),numeric('vector2','point',['x','y']),numeric('vector3','position',['x','y','z']),numeric('vector4','four',['x','y','z','w']),numeric('color','color',['r','g','b','a']),numeric('size','size',['width','height']),{type:'quat',property:'rotation',channels:{value:[{time:0,value:{x:0,y:0,z:0,w:1}},{time:1,value:{x:0,y:0,z:1,w:0}}]}},{type:'object',property:'spriteFrame',channels:{value:[{time:0,value:{$asset:frame}},{time:1,value:null}]}}],events:[{time:0.5,method:'onPulse',args:['test']}]};
  const dry=await call('animation.create',{url,spec,dryRun:true});assert.equal(dry.tracks,8);
  const created=await call('animation.create',{url,spec});assert.equal(created.tracks.length,8);
  const sampled=await call('animation.sample',{asset:url,time:0.5});
  for(const track of sampled.tracks.slice(0,6))for(const channel of track.channels)assert.equal(channel.sampled,5,JSON.stringify(track));
  assert.ok(Math.abs(sampled.tracks[6].channels[0].sampled.z-Math.SQRT1_2)<0.001);
  assert.equal(sampled.tracks[7].channels[0].sampled.uuid,frame);
  pass('8 native track types serialize/deserialize/sample including normalized quaternion and asset reference');
  const edited=await call('animation.edit',{asset:url,expectedRevision:created.revision,spec:{speed:2}});
  assert.equal(edited.speed,2);assert.equal(edited.tracks.length,8);assert.equal(edited.events.length,1);
  await assert.rejects(call('animation.edit',{asset:url,expectedRevision:created.revision,spec:{speed:3}}),/revision changed/);
  await assert.rejects(call('animation.edit',{asset:url,expectedRevision:edited.revision,spec:{duration:0.25}}),/outside/);
  assert.equal((await call('animation.inspect',{asset:url})).revision,edited.revision);
  await call('asset.restore',{backupId:edited.backupId});assert.equal((await call('animation.inspect',{asset:url})).revision,created.revision);
  pass('metadata edit preserves tracks/events; stale revision and invalid shrink reject; backup restores exact source');
  passed=true;
}finally{
  await fs.writeFile(path.join(root,'artifacts/live-animation-check.json'),JSON.stringify({passed,time:new Date().toISOString(),asset:url,checks},null,2));if(!passed)process.exitCode=1;
}
