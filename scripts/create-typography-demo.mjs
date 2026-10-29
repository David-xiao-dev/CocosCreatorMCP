import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {BridgeClient} from '../src/client.mjs';
import {emptyScene} from './lib/empty-scene.mjs';
import {bitmapPng,bitmapFnt,tree} from '../examples/typography/fixture.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),project=path.join(root,'test-project'),c=new BridgeClient(project);
const call=async(a,p={})=>(await c.call(a,p)).result,db=(message,...args)=>call('editor.request',{package:'asset-db',message,args});
const req=(message,...args)=>call('editor.request',{package:'scene',message,args});
const folder='db://assets/MCP_TypographyAssets',url='db://assets/MCP_TypographyDemo.scene',base='Canvas/TypographyDemo';
const checks=[];let passed=false;const pass=s=>{checks.push(s);console.log('PASS '+s);};
try{
 assert.equal(path.resolve((await call('status')).project),project);
 assert.equal(await req('query-dirty'),false,'Save current scene first; no unrelated changes are saved.');
 const current=await req('query-current-scene'),existing=await db('query-asset-info',url),resume=process.argv.includes('--resume');
 if(existing&&(!resume||existing.uuid!==current))throw Error('Demo already exists; open and save it, then use --resume.');
 if(!await db('query-asset-info',folder)){
  const dir=path.join(root,'artifacts/typography-fixture');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'pixel-font.png'),bitmapPng());await fs.writeFile(path.join(dir,'pixel-font.fnt'),bitmapFnt);await call('asset.import',{source:dir,url:folder});
 }
 const font=await call('font.inspect',{asset:folder+'/pixel-font.fnt',text:'ABC 0123456789?'});
 assert.equal(font.kind,'bitmap');assert.equal(font.texture.width,128);assert.deepEqual(font.missingGlyphs,['?']);pass('original bitmap font imported, texture resolved, missing glyph sample detected');
 const fontArg=process.argv.indexOf('--font'),fontFile=fontArg>=0?process.argv[fontArg+1]:process.platform==='win32'?'C:/Windows/Fonts/arial.ttf':null;
 let ttf;
 if(fontFile){if(!await db('query-asset-info',folder+'/TestFont.ttf'))await call('asset.import',{source:path.resolve(fontFile),url:folder+'/TestFont.ttf'});ttf=await call('font.inspect',{asset:folder+'/TestFont.ttf'});assert.equal(ttf.kind,'ttf');}
 if(!existing){const source=await db('query-asset-info',current);await call('asset.write',{url,content:emptyScene(await fs.readFile(source.file,'utf8'),'MCP_TypographyDemo')});await call('scene.open',{asset:url});await call('ui.build',{tree});}
 const configure=(name,p)=>call('text.configure',{node:base+'/'+name,...p});
 await configure('SystemText',{font:{system:'Microsoft YaHei'},fontSize:30,lineHeight:42,color:{r:130,g:225,b:203,a:255},horizontalAlign:'CENTER',overflow:'CLAMP',wrap:true});
 if(ttf)await configure('ImportedText',{font:{asset:ttf.uuid},fontSize:28,horizontalAlign:'CENTER',overflow:'CLAMP'});
 await configure('BitmapText',{font:{asset:font.uuid},fontSize:40,lineHeight:48,horizontalAlign:'CENTER',overflow:'CLAMP'});
 for(const [name,width,height] of [['SystemText',1000,65],['ImportedText',1000,60],['BitmapText',900,70]])await call('component.patch',{node:base+'/'+name,component:'cc.UITransform',properties:{contentSize:{width,height}}});
 await configure('BitmapText',{wrap:false});
 await configure('RichText',{component:'cc.RichText',text:'<color=#83e1c9><b>RichText</b></color>  ·  <i>native font + styled segments</i>',font:ttf?{asset:ttf.uuid}:{system:'Arial'},fontSize:28,lineHeight:38,maxWidth:900,horizontalAlign:'CENTER'});
 await configure('ShrinkText',{fontSize:38,lineHeight:44,overflow:'SHRINK',wrap:false});
 await call('component.patch',{node:base+'/ShrinkText',component:'cc.UITransform',properties:{contentSize:{width:500,height:50}}});
 await configure('WrapText',{fontSize:24,lineHeight:32,overflow:'CLAMP',wrap:true,horizontalAlign:'LEFT'});
 await call('component.patch',{node:base+'/WrapText',component:'cc.UITransform',properties:{contentSize:{width:650,height:90}}});
 await configure('WrapText',{overflow:'RESIZE_HEIGHT'});
 pass('system/TTF/bitmap fonts, RichText, shrink and resize-height configured via typed native edits');
 if(existing){
  const scene=await call('scene.tree');const contains=n=>n.name==='OutsideProbe'||(n.children||[]).some(contains);
  if(!contains(scene)){const parent=await call('node.resolve',{target:base});await call('ui.build',{parent:parent.uuid,tree:{name:'OutsideProbe',position:{x:800,y:0,z:0},size:{width:100,height:40}}});}
 }
 const out=await call('ui.validate',{node:base});assert.ok(out.issues.some(i=>i.rule==='ui.outside-canvas'&&i.path.endsWith('/OutsideProbe')));
 const probe=await call('node.resolve',{target:base+'/OutsideProbe'});await call('node.remove',{uuids:[probe.uuid]});
 await call('scene.save');
 const other=current!==(existing?.uuid||'')?current:(await db('query-assets',{pattern:'db://assets/**/*.scene'})).find(a=>a.uuid!==current)?.uuid;
 assert.ok(other,'A second scene is needed to verify save/reopen.');
 await call('scene.open',{asset:other});await call('scene.open',{asset:url});
 const bitmap=await call('text.inspect',{node:base+'/BitmapText',includeText:true});assert.equal(bitmap.font,font.uuid);assert.equal(bitmap.text,'ABC 0123456789');assert.deepEqual(bitmap.missingGlyphs,[]);
 if(ttf)assert.equal((await call('text.inspect',{node:base+'/ImportedText'})).font,ttf.uuid);
 const rich=await call('text.inspect',{node:base+'/RichText',component:'cc.RichText',includeText:true});assert.ok(rich.text.includes('<color='));assert.equal(rich.maxWidth,900);
 const shrunk=await call('text.inspect',{node:base+'/ShrinkText'});assert.ok(shrunk.actualFontSize>0&&shrunk.actualFontSize<shrunk.fontSize,JSON.stringify(shrunk));
 pass('out-of-Canvas probe diagnosed; save/reopen preserves fonts, markup and observed actual shrink size');
 passed=true;
}finally{
 await fs.writeFile(path.join(root,'artifacts/typography-demo.json'),JSON.stringify({passed,time:new Date().toISOString(),scene:url,checks,note:'Local TTF test resource is never bundled in source release; original bitmap fixture follows the project LICENSE.'},null,2));if(!passed)process.exitCode=1;
}
