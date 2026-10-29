import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {serialized,assetUrl,revision}=require('../extension/prefab-model.cjs');
const {createPrefabs}=require('../extension/prefab.cjs');
const content=name=>JSON.stringify([{__type__:'cc.Prefab',data:{__id__:1}},{__type__:'cc.Node',_name:name,_children:[],_components:[]}]);
test('prefab serialization rejects broken links, invalid root and traversal URLs, retains asset/script identities',()=>{
  const data=JSON.parse(content('Test'));
  data[1]._components=[{__id__:2}];data.push({__type__:'custom-script-id',frame:{__uuid__:'texture@frame'},node:{__id__:1}});
  const result=serialized(JSON.stringify(data));assert.deepEqual(result.assets,['texture@frame']);assert.ok(result.types.includes('custom-script-id'));assert.equal(result.nodes,1);
  data[2].node.__id__=20;assert.throws(()=>serialized(JSON.stringify(data)),/Broken serialized/);
  assert.throws(()=>serialized('[{}]'),/Expected Creator/);
  for(const url of ['db://assets/../outside.prefab','db://internal/a.prefab','db://assets/%2e/a.prefab','db://assets/a\\b.prefab','db://assets/a.prefab?x','db://assets/a//b.prefab']) assert.throws(()=>assetUrl(url));
  assert.equal(assetUrl('db://assets/菜单/界面.prefab'),'db://assets/菜单/界面.prefab');
});
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'cocos-prefab-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'assets'));
  const asset={uuid:'asset',url:'db://assets/Test.prefab',importer:'prefab',imported:true,file:path.join(root,'assets','Test.prefab')};
  await fs.writeFile(asset.file,content('Before'));
  const calls=[], audit={nodes:1,components:0,external:[],incoming:[],scripts:[],assets:[],assetUuid:'asset',instanceRoot:'node'};
  const tree={uuid:'scene',children:[{uuid:'node',name:'Test',parent:'scene',prefab:{isUnwrappable:true,assetUuid:'asset'}}]};
  let apply=false,dirty=false;
  const request=async(pkg,message,...args)=>{
    calls.push({message,args});
    if(message==='query-node-tree')return tree;
    if(message==='query-asset-info')return args[0]==='asset'||args[0]===asset.url?asset:null;
    if(message==='execute-scene-script')return args[0].method==='prefabAudit'?audit:{missingTypes:[]};
    if(message==='query-dirty')return dirty;
    if(message==='apply-prefab') {if(apply)await fs.writeFile(asset.file,content('Applied'));return false;}
    if(message==='save-asset'){await fs.writeFile(asset.file,args[1]);return asset;}
    throw Error(`Unexpected mutation: ${message}`);
  };
  return {api:createPrefabs({request,project:()=>root}),root,asset,calls,audit,enableApply:()=>{apply=true;},dirty:()=>{dirty=true;}};
}
test('stale prefab revision and external references reject before backups or native writes',async t=>{
  const f=await fixture(t);
  await assert.rejects(f.api.dispatch('prefab.apply',{node:'node',expectedRevision:'0'.repeat(64)}),/revision changed/);
  f.audit.external=[{path:'Test.target',target:'external'}];
  await assert.rejects(f.api.dispatch('prefab.apply',{node:'node',expectedRevision:revision(content('Before'))}),/external Node\/Component/);
  assert.ok(!f.calls.some(c=>c.message==='apply-prefab'));
  await assert.rejects(fs.access(path.join(f.root,'local')));
});
test('native false apply is accepted only with persisted readback; backup restores exact original',async t=>{
  const f=await fixture(t);f.enableApply();
  const before=revision(content('Before'));
  const applied=await f.api.dispatch('prefab.apply',{node:'node',expectedRevision:before});
  assert.equal(applied.nativeResult,false);assert.equal(await fs.readFile(applied.backupPath,'utf8'),content('Before'));
  assert.equal(applied.revision,revision(content('Applied')));
  const restored=await f.api.dispatch('prefab.restore',{asset:'asset',backupId:applied.backupId,expectedRevision:applied.revision});
  assert.equal(restored.revision,before);assert.equal(await fs.readFile(restored.backupPath,'utf8'),content('Applied'));
  assert.equal(f.calls.filter(c=>c.message==='save-asset').length,1);
});
test('native false apply without persisted changes reports uncertainty and retains backup',async t=>{
  const f=await fixture(t);
  await assert.rejects(f.api.dispatch('prefab.apply',{node:'node',expectedRevision:revision(content('Before'))}),/did not confirm a persisted change.*Backup/);
  const backups=await fs.readdir(path.join(f.root,'local/cocos-mcp/prefab-backups'));assert.equal(backups.length,2);
});
test('backup tampering and dirty contexts cannot restore shared assets',async t=>{
  const f=await fixture(t);f.enableApply();
  const applied=await f.api.dispatch('prefab.apply',{node:'node',expectedRevision:revision(content('Before'))});
  await fs.writeFile(applied.backupPath,content('Tampered'));
  const params={asset:'asset',backupId:applied.backupId,expectedRevision:applied.revision};
  await assert.rejects(f.api.dispatch('prefab.restore',params),/identity\/content verification/);
  f.dirty();await assert.rejects(f.api.dispatch('prefab.restore',params),/unsaved/);
  assert.ok(!f.calls.some(c=>c.message==='save-asset'));
});
