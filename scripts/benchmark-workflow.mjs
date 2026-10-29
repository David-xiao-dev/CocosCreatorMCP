import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {operations} from '../src/operations.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),project=path.join(root,'test-project');
const tasks=[
  {op:'spine.inspect',params:{asset:'db://assets/MCP_WorkflowAssets/robot.json'},fields:['/uuid','/loaded','/compatible']},
  {op:'animation.inspect',params:{asset:'db://assets/MCP_WorkflowAssets/Motion.anim'},fields:['/assetUuid','/duration','/speed']},
  {op:'asset.graph',params:{asset:'db://assets/MCP_WorkflowAssets/robot.json',depth:4},fields:['/nodeCount','/edgeCount','/missing']},
  {op:'component.properties',params:{node:'Canvas/WorkflowDemo/SpineActor',component:'sp.Skeleton',names:['skeletonData']},fields:['/type','/properties/skeletonData/value/uuid']},
];
const bytes=value=>Buffer.byteLength(JSON.stringify(value));
const select=(value,fields)=>Object.fromEntries(fields.map(field=>[field,field.slice(1).split('/').reduce((v,k)=>v[k],value)]));
const reports=[];
for(let round=0;round<3;round++){
  const outcomes={};
  for(const profile of round%2?['compact','legacy']:['legacy','compact']){
    const client=new Client({name:'workflow-benchmark',version:'1'});
    try{
      await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(root,'src/server.mjs'),'--project',project,'--tools',profile],stderr:'pipe'}));
      const stats={profile,round,taskCalls:0,taskRequestBytes:0,taskResponseBytes:0};
      const list=await client.listTools();stats.toolsListBytes=bytes(list);
      const invoke=async(name,args)=>{
        const request={name,arguments:args};stats.taskCalls++;stats.taskRequestBytes+=bytes(request);
        const response=await client.callTool(request);stats.taskResponseBytes+=bytes(response);
        if(response.isError)throw Error(response.content[0].text);return JSON.parse(response.content[0].text);
      };
      const start=performance.now();
      if(profile==='compact'){
        const schema=await client.callTool({name:'cocos_catalog',arguments:{ops:tasks.map(t=>t.op)}});
        assert.ok(!schema.isError);stats.schemaCalls=1;stats.schemaRequestBytes=bytes({name:'cocos_catalog',arguments:{ops:tasks.map(t=>t.op)}});stats.schemaResponseBytes=bytes(schema);
        const result=await invoke('cocos_execute',{steps:tasks.map((t,i)=>({...t,id:`read${i}`}))});
        outcomes[profile]=result.result.steps.map(s=>s.result);
      }else{
        stats.schemaCalls=0;stats.schemaRequestBytes=0;stats.schemaResponseBytes=0;outcomes[profile]=[];
        for(const task of tasks){const response=await invoke(operations.get(task.op).name,task.params);outcomes[profile].push(select(response.result,task.fields));}
      }
      stats.elapsedMs=Number((performance.now()-start).toFixed(2));reports.push(stats);
    }finally{await client.close();}
  }
  assert.deepEqual(outcomes.compact,outcomes.legacy);
}
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const summary=Object.fromEntries(['legacy','compact'].map(profile=>{const rows=reports.filter(r=>r.profile===profile);return [profile,Object.fromEntries(['taskCalls','taskRequestBytes','taskResponseBytes','toolsListBytes','schemaCalls','schemaRequestBytes','schemaResponseBytes','elapsedMs'].map(key=>[key,median(rows.map(r=>r[key]))]))];}));
const report={time:new Date().toISOString(),measurement:'Same four read tasks and asserted equal selected results via real MCP SDK. JSON payload bytes, excluding JSON-RPC framing, initialization and model messages. Compact cold schema discovery is counted separately; 3 alternating rounds on one local editor; no Pro or actual model-token measurement.',tasks,summary,rounds:reports};
await fs.writeFile(path.join(root,'artifacts/workflow-benchmark.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.summary,null,2));
