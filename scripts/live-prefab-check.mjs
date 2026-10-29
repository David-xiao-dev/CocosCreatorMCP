import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {BridgeClient} from '../src/client.mjs';
import {emptyScene} from './lib/empty-scene.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))), project=path.join(root,'test-project');
const c=new BridgeClient(project), call=async(a,p={})=>(await c.call(a,p)).result;
const req=(message,...args)=>call('editor.request',{package:'scene',message,args});
const db=(message,...args)=>call('editor.request',{package:'asset-db',message,args});
const id=randomUUID().replaceAll('-',''), prefix=`db://assets/MCP_Prefab_${id}`, className=`McpPrefab${id}`;
const urls={scene:`${prefix}.scene`,script:`${prefix}.ts`,prefab:`${prefix}.prefab`,nested:`${prefix}_Nested.prefab`};
const owned=[], checks=[]; let original, passed=false;
const pass=name=>{checks.push(name);console.log(`PASS ${name}`);};
const prop=async(node,component,name)=>(await call('component.properties',{node,component,names:[name]})).properties[name].value;
const patch=(node,component,properties)=>call('component.patch',{node,component,properties});
const find=(t,name)=>t.name===name?t:(t.children||[]).map(c=>find(c,name)).find(Boolean);
async function fidelity(node) {
  const tree=await call('scene.tree'), subtree=find(tree,node) || find(tree,'Fixture');
  const content=subtree || await req('query-node-tree',node);
  const label=find(content,'Text'), image=find(content,'Image'), button=find(content,'Button');
  assert.ok(label && image && button);
  const comp=(await call('node.resolve',{target:label.uuid})).components.find(c=>c.type==='cc.Label').value;
  assert.equal((await prop(node,className,'label')).uuid,comp);
  assert.equal((await prop(node,className,'target')).uuid,label.uuid);
  assert.deepEqual((await prop(node,className,'targets')).map(v=>v.uuid),[label.uuid,button.uuid]);
  assert.equal((await prop(image.uuid,'cc.Sprite','spriteFrame')).uuid,frame.uuid);
  assert.equal((await prop(node,className,'frame')).uuid,frame.uuid);
  const events=await prop(button.uuid,'cc.Button','clickEvents');
  assert.equal(events.length,1);assert.equal(events[0].target.uuid,node);assert.equal(events[0].handler,'onClick');assert.ok(events[0]._componentId);
}
let frame;
try {
  const status=await call('status');assert.equal(status.editorVersion,'3.8.8');assert.equal(path.resolve(status.project),project);
  if(await req('query-dirty')) throw Error('Save current scene first; test will not save unrelated edits.');
  original=await req('query-current-scene');const info=await db('query-asset-info',original);
  await call('asset.write',{url:urls.scene,content:emptyScene(await fs.readFile(info.file,'utf8'),'MCP_Prefab_Regression')});owned.push(urls.scene);
  await call('scene.open',{asset:urls.scene});
  await call('asset.write',{url:urls.script,content:`import { _decorator, Component, Node, Label, SpriteFrame } from 'cc';
const {ccclass,property}=_decorator;
@ccclass('${className}') export class ${className} extends Component {
 @property(Node) target: Node | null = null;
 @property(Label) label: Label | null = null;
 @property([Node]) targets: Node[] = [];
 @property(SpriteFrame) frame: SpriteFrame | null = null;
 onClick() { if(this.label) this.label.string='Clicked'; }
}`});owned.push(urls.script);
  frame=(await db('query-assets',{pattern:'db://internal/default_ui/**'})).find(a=>a.type==='cc.SpriteFrame');assert.ok(frame);
  const deadline=Date.now()+25000;
  while(!(await call('script.status',{className,asset:urls.script})).registered) {
    if(Date.now()>deadline) throw Error('Fixture script did not register; inspect compilation logs.');
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  const built=await call('ui.build',{tree:{name:'Fixture',size:{width:500,height:400},children:[{name:'Text',components:[{type:'cc.Label',properties:{string:'Original'}}]},{name:'Image',components:[{type:'cc.Sprite'}]},{name:'Button',components:[{type:'cc.Button'}]}]}});
  let node=built.root;
  await call('script.attach',{node,className,asset:urls.script,requiredMethods:['onClick'],timeoutMs:25000});
  const text=await call('node.resolve',{target:'Canvas/Fixture/Text'}), button=await call('node.resolve',{target:'Canvas/Fixture/Button'});
  const external=await call('node.create',{name:'External'});
  await patch(node,className,{target:{$node:external},label:{$component:{node:text.uuid,type:'cc.Label'}},targets:[{$node:text.uuid},{$node:button.uuid}],frame:{$asset:frame.uuid}});
  await patch('Canvas/Fixture/Image','cc.Sprite',{spriteFrame:{$asset:frame.uuid}});
  await call('button.events',{node:button.uuid,mode:'replace',events:[{target:node,component:className,handler:'onClick'}]});
  await assert.rejects(call('prefab.create',{node,url:urls.prefab}),/external Node\/Component references/);
  assert.equal(await db('query-asset-info',urls.prefab),null);
  await patch(node,className,{target:{$node:text.uuid}});
  await call('script.attach',{node:external,className,asset:urls.script,timeoutMs:0});
  await patch(external,className,{target:{$node:text.uuid}});
  await assert.rejects(call('prefab.create',{node,url:urls.prefab}),/Other scene components reference/);
  await patch(external,className,{target:null});
  assert.equal((await call('prefab.create',{node,url:urls.prefab,dryRun:true})).dryRun,true);
  assert.equal(await db('query-asset-info',urls.prefab),null);
  pass('external reference loss is blocked and dry-run creates no prefab');
  const nested=await call('node.create',{name:'Nested'});
  await call('component.add',{uuid:nested,component:'cc.Label'});
  owned.push(urls.nested);const nestedCreated=await call('prefab.create',{node:nested,url:urls.nested});
  await call('node.remove',{uuids:[nestedCreated.node]});
  const nestedInstance=await call('prefab.instantiate',{asset:urls.nested,parent:node,name:'Nested'});
  owned.push(urls.prefab);const created=await call('prefab.create',{node,url:urls.prefab});node=created.node;
  assert.equal(created.valid,true);await fidelity(node);
  await assert.rejects(call('prefab.create',{node,url:urls.prefab}),/already exists/);
  pass('native prefab creation preserves custom script, node/component arrays, SpriteFrame and Button events');
  await call('scene.save');
  await call('scene.open',{asset:original});await call('scene.open',{asset:urls.scene});
  node=(await call('node.resolve',{target:`Canvas/${created.rootName}`})).uuid;await fidelity(node);
  const instance=await call('prefab.instantiate',{asset:urls.prefab,parent:'Canvas',name:'Instance'});await fidelity(instance.node);
  assert.equal(find(await req('query-node-tree',instance.node),'Nested').prefab.assetUuid,nestedCreated.assetUuid);
  pass('save/reopen and second instantiation preserve internal identity and nested links');
  const aText=find(await req('query-node-tree',instance.node),'Text').uuid;
  await assert.rejects(call('prefab.apply',{node:instance.node,expectedRevision:'0'.repeat(64)}),/revision changed/);
  await patch(aText,'cc.Label',{string:'Applied'});
  const before=await call('prefab.validate',{asset:urls.prefab});
  assert.equal((await call('prefab.apply',{node:instance.node,expectedRevision:before.revision,dryRun:true})).dryRun,true);
  const applied=await call('prefab.apply',{node:instance.node,expectedRevision:before.revision});assert.notEqual(applied.revision,before.revision);assert.ok(applied.backupId);
  const newInstance=await call('prefab.instantiate',{asset:urls.prefab,parent:'Canvas',name:'AppliedInstance'});
  assert.equal(await prop(find(await req('query-node-tree',newInstance.node),'Text').uuid,'cc.Label','string'),'Applied');
  await patch(aText,'cc.Label',{string:'LocalOverride'});
  await call('prefab.revert',{node:instance.node});
  assert.equal(await prop(find(await req('query-node-tree',instance.node),'Text').uuid,'cc.Label','string'),'Applied');
  await fidelity(instance.node);
  pass('revision conflict blocks writes; apply updates new instances; revert restores overrides without losing references');
  await call('prefab.unlink',{node:newInstance.node});
  const unlinked=await call('prefab.inspect',{node:newInstance.node});assert.equal(unlinked.assetUuid,null);
  assert.equal(find(await req('query-node-tree',newInstance.node),'Nested').prefab.assetUuid,nestedCreated.assetUuid);
  await req('undo');assert.equal((await call('prefab.inspect',{node:newInstance.node})).assetUuid,created.assetUuid);
  await call('prefab.unlink',{node:newInstance.node,recursive:true});
  assert.equal(find(await req('query-node-tree',newInstance.node),'Nested').prefab.assetUuid,'');
  await fidelity(newInstance.node);
  pass('unlink preserves content, native undo restores link, recursive flag controls nested prefab links');
  await assert.rejects(call('prefab.open',{asset:urls.prefab}),/unsaved/);
  await call('scene.save');
  const opened=await call('prefab.open',{asset:urls.prefab});await fidelity(opened.root);
  const editText=find(await req('query-node-tree',opened.root),'Text').uuid;
  await patch(editText,'cc.Label',{string:'EditedInPrefab'});
  await assert.rejects(call('prefab.close',{returnAsset:opened.returnAsset}),/unsaved/);
  const saved=await call('prefab.save',{expectedRevision:opened.revision});assert.equal(saved.saved,true);
  await call('prefab.close',{returnAsset:opened.returnAsset});
  const reopen=await call('prefab.open',{asset:urls.prefab});await fidelity(reopen.root);
  assert.equal(await prop(find(await req('query-node-tree',reopen.root),'Text').uuid,'cc.Label','string'),'EditedInPrefab');
  await call('prefab.close',{returnAsset:reopen.returnAsset});
  pass('native prefab editing/save/reopen persists changes; dirty switching/closing is rejected');
  const assetInfo=await db('query-asset-info',urls.prefab), meta=await fs.readFile(`${assetInfo.file}.meta`,'utf8');
  const latest=await call('prefab.validate',{asset:urls.prefab});
  const restored=await call('prefab.restore',{asset:urls.prefab,backupId:applied.backupId,expectedRevision:latest.revision});
  assert.equal(restored.revision,before.revision);assert.equal(await fs.readFile(`${assetInfo.file}.meta`,'utf8'),meta);
  const restoredOpen=await call('prefab.open',{asset:urls.prefab});await fidelity(restoredOpen.root);
  assert.equal(await prop(find(await req('query-node-tree',restoredOpen.root),'Text').uuid,'cc.Label','string'),'Original');
  await call('prefab.close',{returnAsset:restoredOpen.returnAsset});
  pass('backup restore through AssetDB restores exact content, preserves meta UUID and survives reopen');
  passed=true;
} finally {
  // Only disposable test content is saved, never the original scene.
  if(original) {
    if(await req('query-dirty')) {
      const current=await req('query-current-scene'), own=await db('query-asset-info',current);
      if(owned.includes(own?.url)) await req('save-scene');
    }
    if(!await req('query-dirty')) await call('scene.open',{asset:original});
  }
  if(!await req('query-dirty') && await req('query-current-scene')===original) {
    for(const url of owned.reverse()) await db('delete-asset',url);
  }
  await fs.writeFile(path.join(root,'artifacts/live-prefab-check.json'),JSON.stringify({passed,time:new Date().toISOString(),project,checks},null,2));
  if(!passed) process.exitCode=1;
}
