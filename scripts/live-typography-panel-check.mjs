import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {BridgeClient} from '../src/client.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),project=path.join(root,'test-project'),client=new BridgeClient(project);
const call=async(action,params={})=>(await client.call(action,params)).result;
const checks=[],pass=s=>{checks.push(s);console.log('PASS '+s);};let passed=false,windowId;
// Inspect our own panel DOM; all user interactions go through real editor.input events.
async function dom(expression){
 const source=`(()=>{function find(r){const a=r.querySelector('#app');if(a)return a;for(const e of r.querySelectorAll('*'))if(e.shadowRoot){const a=find(e.shadowRoot);if(a)return a;}}const root=find(document);if(!root)return null;return (${expression});})()`;
 return call('editor.script',{context:'main',code:`return require('electron').BrowserWindow.fromId(${windowId}).webContents.executeJavaScript(${JSON.stringify(source)});`});
}
const input=params=>call('editor.input',{windowId,...params});
async function shot(name){const s=await call('editor.screenshot',{windowId});await fs.writeFile(path.join(root,`artifacts/typography-panel-${name}.png`),Buffer.from(s.data,'base64'));return s;}
async function waitFor(expression){const deadline=Date.now()+10000;do{if(await dom(expression))return;await new Promise(r=>setTimeout(r,100));}while(Date.now()<deadline);throw Error('Panel readback timeout: '+expression);}
async function click(selector){
 for(let i=0;i<12;i++){
  const position=await dom(`(()=>{const e=root.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Panel control not found');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,height:innerHeight,disabled:e.disabled};})()`);
  assert.equal(position.disabled,false,'Control is disabled');
  await shot('before-action');
  if(position.y<35||position.y>position.height-25){await input({events:[{type:'mouseWheel',x:900,y:400,deltaY:position.y<35?500:-500,deltaX:0}]});await new Promise(r=>setTimeout(r,300));continue;}
  const x=Math.round(position.x),y=Math.round(position.y);await input({events:[{type:'mouseDown',x,y,button:'left'},{type:'mouseUp',x,y,button:'left'}]});return;
 }throw Error('Control could not be scrolled into view');
}
async function fill(selector,value){await click(selector);await input({events:[{type:'keyDown',keyCode:'A',modifiers:['control']},{type:'keyUp',keyCode:'A',modifiers:['control']}]});await input({text:String(value)});assert.equal(await dom(`root.querySelector(${JSON.stringify(selector)}).value`),String(value));}
async function action(selector,expected){await click(selector);await waitFor(`!root.querySelector(${JSON.stringify(selector)}).disabled && (${expected})`);}
try{
 assert.equal(path.resolve((await call('status')).project),project);assert.equal((await call('scene.tree')).name,'MCP_TypographyDemo');
 assert.equal(await call('editor.request',{package:'scene',message:'query-dirty',args:[]}),false);
 await call('editor.panel',{name:'cocos-codex-bridge'});
 for(const w of (await call('editor.windows')).filter(w=>w.visible&&!w.minimized)){windowId=w.id;if(await dom('!!root.querySelector("#typography")'))break;windowId=undefined;}
 assert.ok(windowId,'MCP panel window not found');await shot('initial');await click('[data-page="typography"]');
 await fill('#text-node','Canvas/TypographyDemo/SystemText');
 await action('[data-typography="text.inspect"]',`root.querySelector('#typography-result').textContent.includes('Microsoft YaHei')`);
 await action('[data-typography="ui.measure"]',`root.querySelector('#typography-result').textContent.includes('"detail": "compact"')`);
 pass('real panel input reads text and compact geometry');
 const before=await call('text.inspect',{node:'Canvas/TypographyDemo/SystemText'});
 await fill('#text-size',before.fontSize+1);
 await action('[data-typography="text.configure"][data-dry]',`root.querySelector('#typography-result').textContent.includes('"dryRun": true')`);
 assert.equal((await call('text.inspect',{node:'Canvas/TypographyDemo/SystemText'})).fontSize,before.fontSize);
 await action('[data-typography="text.configure"]:not([data-dry])',`root.querySelector('#typography-result').textContent.includes('inspector readback')`);
 assert.equal((await call('text.inspect',{node:'Canvas/TypographyDemo/SystemText'})).fontSize,before.fontSize+1);
 await fill('#text-size',before.fontSize);
 await action('[data-typography="text.configure"]:not([data-dry])',`root.querySelector('#typography-result').textContent.includes('inspector readback')`);
 assert.equal((await call('text.inspect',{node:'Canvas/TypographyDemo/SystemText'})).fontSize,before.fontSize);
 pass('real panel dry-run is read-only; apply and restore pass inspector readback');
 const bitmap='Canvas/TypographyDemo/BitmapText',previous=await call('text.inspect',{node:bitmap,includeText:true});
 await call('text.configure',{node:bitmap,text:'A?'});
 try{
  await fill('#text-node',bitmap);
  await action('[data-typography="ui.validate"]',`root.querySelector('#typography-issues').textContent.includes('text.missing-bitmap-glyphs')`);
  await click('#typography-issues button');
  const selected=await call('selection');assert.deepEqual(selected.uuids,[(await call('node.resolve',{target:bitmap})).uuid]);
  pass('real diagnostic button detects missing glyph and selects the project node');
 }finally{await call('text.configure',{node:bitmap,text:previous.text});}
 await action('[data-typography="ui.validate"]',`!root.querySelector('#typography-issues').textContent.includes('text.missing-bitmap-glyphs')`);
 await call('scene.save');await shot('verified');passed=true;
}finally{
 await fs.writeFile(path.join(root,'artifacts/live-typography-panel-check.json'),JSON.stringify({passed,time:new Date().toISOString(),checks},null,2));if(!passed)process.exitCode=1;
}
