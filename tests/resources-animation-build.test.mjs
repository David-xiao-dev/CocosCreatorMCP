import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {operations} from '../src/operations.mjs';
const require=createRequire(import.meta.url);
const {createResources,replaceUuid}=require('../extension/resources.cjs');
const {createStore,sha}=require('../extension/resource-store.cjs');
const {validateSpec}=require('../extension/animation-model.cjs');
const {createBuild}=require('../extension/build.cjs');
const {createAnimation}=require('../extension/animation.cjs');

async function fixture(t){
  const project=await fs.mkdtemp(path.join(os.tmpdir(),'cocos-resource-test-'));
  await fs.mkdir(path.join(project,'assets'));
  t.after(()=>fs.rm(project,{recursive:true,force:true}));
  const assets=new Map(),users=new Map();let failWrite,writeCount=0,dirty=false;
  async function asset(uuid,content,type='cc.JsonAsset'){
    const file=path.join(project,'assets',`${uuid}.json`),url=`db://assets/${uuid}.json`;
    await fs.writeFile(file,content);await fs.writeFile(file+'.meta','original meta '+uuid);
    const info={uuid,url,file,type,source:true,imported:true,subAssets:{}};assets.set(uuid,info);return info;
  }
  const request=async(pkg,msg,...args)=>{
    if(pkg==='scene'&&msg==='query-dirty')return dirty;
    assert.equal(pkg,'asset-db');
    if(msg==='query-asset-info')return assets.get(args[0])||[...assets.values()].find(a=>a.url===args[0])||null;
    if(msg==='query-asset-users')return users.get(args[0])||[];
    if(msg==='query-asset-dependencies')return [];
    if(msg==='save-asset'){
      writeCount++;if(failWrite?.(writeCount,args[0]))throw Error('injected write failure');
      await fs.writeFile(assets.get(args[0]).file,args[1]);return;
    }
    throw Error(msg);
  };
  return {project,asset,assets,users,request,context:{request,project:()=>project},fail:fn=>failWrite=fn,dirty:value=>dirty=value};
}

test('reference replacement touches only exact serialized UUID fields and escapes pointer paths',()=>{
  const data={'a/b~c':{__uuid__:'from'},text:'from',nested:[{__uuid__:'other'}]};
  assert.deepEqual(replaceUuid(data,'from','to'),['/a~1b~0c/__uuid__']);
  assert.equal(data.text,'from');assert.equal(data.nested[0].__uuid__,'other');
});
test('multi-asset replacement rolls back earlier writes on a later write failure',async t=>{
  const f=await fixture(t);await f.asset('from','{}');await f.asset('to','{}');
  const one=await f.asset('one','[{"__uuid__":"from"}]'),two=await f.asset('two','{"__uuid__":"from"}');
  f.users.set('from',['one','two']);const r=createResources(f.context);
  const plan=await r.dispatch('asset.replace.plan',{from:'from',to:'to',maxAssets:10});
  f.fail(n=>n===2);
  await assert.rejects(r.dispatch('asset.replace.apply',{planId:plan.planId}),/previous source contents restored and verified/);
  assert.equal(await fs.readFile(one.file,'utf8'),'[{"__uuid__":"from"}]');
  assert.equal(await fs.readFile(two.file,'utf8'),'{"__uuid__":"from"}');
  assert.equal(await fs.readFile(one.file+'.meta','utf8'),'original meta one');
});
test('a concurrent change during failure recovery is preserved and reported',async t=>{
  const f=await fixture(t);await f.asset('from','{}');await f.asset('to','{}');
  const one=await f.asset('one','{"__uuid__":"from"}');await f.asset('two','{"__uuid__":"from"}');
  f.users.set('from',['one','two']);const r=createResources(f.context),plan=await r.dispatch('asset.replace.plan',{from:'from',to:'to',maxAssets:10});
  f.fail(n=>{if(n===2){require('fs').writeFileSync(one.file,'concurrent content');return true;}return false;});
  await assert.rejects(r.dispatch('asset.replace.apply',{planId:plan.planId}),/Concurrent source change prevents rollback/);
  assert.equal(await fs.readFile(one.file,'utf8'),'concurrent content');
});
test('replacement rejects stale sources, changed users and unsupported importer references before writing',async t=>{
  const f=await fixture(t);await f.asset('from','{}');await f.asset('to','{}');const one=await f.asset('one','{"__uuid__":"from"}');
  f.users.set('from',['one']);const r=createResources(f.context);
  let plan=await r.dispatch('asset.replace.plan',{from:'from',to:'to',maxAssets:10});
  await fs.writeFile(one.file,'{"__uuid__":"from","changed":true}');
  await assert.rejects(r.dispatch('asset.replace.apply',{planId:plan.planId}),/revision changed/);
  plan=await r.dispatch('asset.replace.plan',{from:'from',to:'to',maxAssets:10});f.users.set('from',[]);
  await assert.rejects(r.dispatch('asset.replace.apply',{planId:plan.planId}),/users changed/);
  await fs.writeFile(one.file,'dynamic string from');f.users.set('from',['one']);r.invalidate();
  plan=await r.dispatch('asset.replace.plan',{from:'from',to:'to',maxAssets:10});assert.equal(plan.blocked,true);
  await assert.rejects(r.dispatch('asset.replace.apply',{planId:plan.planId}),/blocked or empty/);
});
test('backup restoration rejects tampering and stale content, preserves meta and creates recovery backup',async t=>{
  const f=await fixture(t),a=await f.asset('one','before'),store=createStore(f.context);
  const backup=store.backup([{asset:a,data:Buffer.from('before'),expectedAfter:sha('after')}],'test');
  await assert.rejects(store.restore(backup.backupId,true),/revision changed/);
  await fs.writeFile(a.file,'after');const preview=await store.restore(backup.backupId,true);assert.equal(preview.dryRun,true);
  await fs.writeFile(path.join(backup.backupPath,'0.source'),'tampered');
  await assert.rejects(store.restore(backup.backupId,false),/hash mismatch/);
  await fs.writeFile(path.join(backup.backupPath,'0.source'),'before');
  const restored=await store.restore(backup.backupId,false);assert.notEqual(restored.backupId,backup.backupId);
  assert.equal(await fs.readFile(a.file,'utf8'),'before');assert.equal(await fs.readFile(a.file+'.meta','utf8'),'original meta one');
});
test('dependency cache invalidation during an in-flight read never caches an old generation as new',async t=>{
  const f=await fixture(t);await f.asset('root','{}');await f.asset('old','{}');await f.asset('new','{}');
  let release,calls=0;
  const r=createResources({...f.context,request:async(pkg,msg,...args)=>{
    if(msg==='query-asset-dependencies'){calls++;if(calls===1)return new Promise(resolve=>{release=()=>resolve(['old']);});return ['new'];}
    return f.request(pkg,msg,...args);
  }});
  const p={asset:'root',direction:'dependencies',depth:1,type:'all',maxNodes:10,maxEdges:10};
  const pending=r.dispatch('asset.graph',p);while(!release)await new Promise(resolve=>setImmediate(resolve));
  r.invalidate();release();assert.equal((await pending).changedDuringRead,true);
  const fresh=await r.dispatch('asset.graph',p);assert.ok(fresh.nodes.some(n=>n.uuid==='new'));assert.equal(calls,2);
  assert.equal((await r.dispatch('asset.graph',p)).cachedQueries,1);
});
test('animation validates sorted keys, duplicate targets, normalized quaternions and public paths',()=>{
  const track={type:'real',property:'speed',channels:{value:[{time:0,value:1},{time:1,value:2}]}};
  const spec={duration:1,tracks:[track]};assert.equal(validateSpec(spec).keyframes,2);
  assert.throws(()=>validateSpec({...spec,tracks:[track,track]}),/Duplicate/);
  assert.throws(()=>validateSpec({...spec,tracks:[{...track,property:'constructor.foo'}]}),/public property/);
  assert.throws(()=>validateSpec({...spec,tracks:[{...track,channels:{value:[{time:1,value:1},{time:0,value:2}]}}]}),/strictly increasing/);
  assert.throws(()=>validateSpec({...spec,tracks:[{type:'quat',property:'rotation',channels:{value:[{time:0,value:{x:0,y:0,z:0,w:2}}]}}]}),/normalized/);
  const patch=operations.get('animation.edit').schema.parse({asset:'clip',expectedRevision:'a'.repeat(64),spec:{speed:2}}).spec;
  assert.deepEqual(patch,{speed:2}); // Metadata-only edits must not default missing arrays to empty.
});
test('Spine binding removes only its newly added component after a property failure',async t=>{
  const f=await fixture(t);await f.asset('spine','{}','sp.SkeletonData');let component,removed;
  const request=async(pkg,msg,...args)=>{
    if(msg==='execute-scene-script')return {loaded:true,compatible:true,textures:[{uuid:'texture',width:16,height:16}],skins:['default'],animations:[{name:'idle'}]};
    if(msg==='query-node')return {__comps__:component?[{type:'sp.Skeleton',value:{uuid:{value:component}}}]:[]};
    return f.request(pkg,msg,...args);
  };
  const animation=createAnimation({...f.context,request,dispatch:async(action,p)=>{
    if(action==='node.resolve')return {uuid:'node'};
    if(action==='component.add'){component='new-component';return {__comps__:[{type:'sp.Skeleton',value:{uuid:{value:component}}}]};}
    if(action==='component.patch')throw Error('injected patch failure');
    if(action==='component.remove'){removed=p.uuid;component=undefined;return;}
    throw Error(action);
  }});
  await assert.rejects(animation.dispatch('spine.configure',{asset:'spine',node:'node',skin:'default',animation:'idle',loop:true,timeScale:1}),/new component removed and verified/);
  assert.equal(removed,'new-component');assert.equal(component,undefined);
  component='existing-component';removed=undefined;
  await assert.rejects(animation.dispatch('spine.configure',{asset:'spine',node:'node',skin:'default',animation:'idle',loop:true,timeScale:1}),/existing component/);
  assert.equal(removed,undefined);assert.equal(component,'existing-component');
});
test('native import readiness retries observations without replaying writes',async t=>{
  const f=await fixture(t),a=await f.asset('one','{}');let queries=0;
  const store=createStore({...f.context,request:async(pkg,msg,...args)=>{
    if(msg==='query-asset-info'){queries++;return {...a,imported:queries>=3};}
    throw Error(`Unexpected write: ${msg}`);
  }});
  assert.equal((await store.info('one')).uuid,'one');assert.equal(queries,3);
});

test('build correlates native identity, rejects early artifacts and serves only verified owned output',async t=>{
  const f=await fixture(t);let task,state='processing',opened;
  const b=createBuild({project:()=>f.project,openPreview:async url=>{opened=url.href;return {loaded:true};},request:async(pkg,msg,...args)=>{
    if(pkg==='scene')return false;
    if(msg==='query-ready')return true;
    if(msg==='query-asset-info')return {type:'cc.SceneAsset',url:'db://assets/Main.scene',uuid:'scene'};
    if(msg==='query-tasks-info')return {list:task?[{id:'native-1',state,progress:state==='success'?1:0.5,options:task}]:[]};
    if(msg==='add-task'){task=args[0];return 1;}
    throw Error(msg);
  }});
  t.after(()=>b.dispose());
  const start=await b.dispatch('build.start',{platform:'web-desktop',scenes:['main'],debug:true});
  assert.equal(start.taskId,'native-1');assert.equal(start.terminal,false);
  await assert.rejects(b.dispatch('build.artifacts',{runId:start.runId,limit:10}),/successful terminal/);
  await fs.mkdir(start.outputPath,{recursive:true});await fs.writeFile(path.join(start.outputPath,'index.html'),'<script src="game.js"></script>');await fs.writeFile(path.join(start.outputPath,'game.js'),'window.game=1;');
  state='success';const inventory=await b.dispatch('build.artifacts',{runId:start.runId,limit:1,hashes:true});assert.equal(inventory.fileCount,2);assert.equal(inventory.truncated,true);assert.match(inventory.files[0].sha256,/^[0-9a-f]{64}$/);
  await b.dispatch('build.preview',{runId:start.runId});assert.equal((await fetch(opened)).status,200);
  const raw=pathname=>new Promise((resolve,reject)=>{http.get(new URL(opened).origin+pathname,res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});
  assert.equal(await raw('/%2e%2e%2fsecret'),403);
  assert.equal((await fetch(opened,{method:'POST'})).status,405);
  const stopped=await b.dispatch('build.stopServer',{runId:start.runId});assert.equal(stopped.stopped,true);
  task=undefined;assert.equal((await b.dispatch('build.status',{runId:start.runId})).state,'unknown');
});
