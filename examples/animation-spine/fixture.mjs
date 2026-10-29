import {deflateSync} from 'node:zlib';
// Original test artwork/data under ../../LICENSE. No third-party Spine example content.
function crc32(data) { let c=0xffffffff;for(const byte of data){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0; }
function chunk(type,data){const t=Buffer.from(type),len=Buffer.alloc(4),crc=Buffer.alloc(4);len.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([len,t,data,crc]);}
export function robotPng(alternate=false){
  const n=16,raw=Buffer.alloc(n*(n*4+1));
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const body=x>=3&&x<=12&&y>=3&&y<=13,eye=y>=5&&y<=6&&(x===5||x===10),feet=y>=13&&(x>=3&&x<=5||x>=10&&x<=12),i=y*(n*4+1)+1+x*4;
    raw[i]=eye?20:alternate?255:92;raw[i+1]=eye?30:alternate?159:226;raw[i+2]=eye?50:alternate?117:209;raw[i+3]=body||feet?255:0;
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(n,0);header.writeUInt32BE(n,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
export const atlas='robot.png\nsize: 16,16\nformat: RGBA8888\nfilter: Nearest,Nearest\nrepeat: none\nrobot\n  rotate: false\n  xy: 0, 0\n  size: 16, 16\n  orig: 16, 16\n  offset: 0, 0\n  index: -1\n';
export const skeleton={skeleton:{hash:'original-mcp-fixture',spine:'3.8.99',x:-64,y:-64,width:128,height:128},bones:[{name:'root'},{name:'body',parent:'root'}],slots:[{name:'body-slot',bone:'body',attachment:'robot'}],skins:[{name:'default',attachments:{'body-slot':{robot:{type:'region',path:'robot',width:128,height:128}}}},{name:'warm',attachments:{'body-slot':{robot:{type:'region',path:'robot',color:'ffb080ff',width:128,height:128}}}}],events:{pulse:{int:1,string:'mcp'}},animations:{idle:{bones:{body:{rotate:[{time:0,angle:-15},{time:0.5,angle:15},{time:1,angle:-15}]}},events:[{time:0.5,name:'pulse',int:7,string:'idle'}]},hop:{bones:{body:{translate:[{time:0,x:0,y:0},{time:0.5,x:0,y:70},{time:1,x:0,y:0}]}},events:[{time:0.5,name:'pulse',string:'hop'}]}}};
export const motion={name:'MCP_Motion',duration:2,sample:60,speed:1,wrap:'Loop',tracks:[{type:'vector3',property:'position',channels:{x:[{time:0,value:-220},{time:1,value:-60},{time:2,value:-220}],y:[{time:0,value:0},{time:1,value:50,interpolation:'CUBIC',leftTangent:0,rightTangent:0},{time:2,value:0}]}},{type:'color',component:'cc.Sprite',property:'color',channels:{r:[{time:0,value:255},{time:1,value:120},{time:2,value:255}]}}],events:[{time:0.75,method:'onPulse',args:['motion']}]};
export const tree={name:'WorkflowDemo',size:{width:900,height:620},children:[{name:'Title',position:{x:0,y:245,z:0},size:{width:800,height:60},components:[{type:'cc.Label',properties:{string:'Animation + Spine · native assets',fontSize:30}}]},{name:'Subtitle',position:{x:0,y:185,z:0},size:{width:840,height:50},components:[{type:'cc.Label',properties:{string:'Saved scene → Web build → real runtime verification',fontSize:20}}]},{name:'MovingSprite',position:{x:-220,y:0,z:0},size:{width:128,height:128},components:[{type:'cc.Sprite'}]},{name:'SpineActor',position:{x:180,y:0,z:0},size:{width:128,height:128}},{name:'MotionLabel',position:{x:-180,y:-140,z:0},size:{width:360,height:80},components:[{type:'cc.Label',properties:{string:'cc.Animation · tracks / curves / events',fontSize:18}}]},{name:'SpineLabel',position:{x:180,y:-140,z:0},size:{width:360,height:80},components:[{type:'cc.Label',properties:{string:'Spine 3.8 · skin / mix / tracks',fontSize:18}}]},{name:'EventCount',position:{x:0,y:-240,z:0},size:{width:800,height:70},components:[{type:'cc.Label',properties:{string:'Events: waiting for runtime',fontSize:22}}]}]};
export const probeScript=`import { _decorator, Component, Label } from 'cc';
const {ccclass,property}=_decorator;
@ccclass('McpWorkflowProbe') export class McpWorkflowProbe extends Component {
 @property(Label) label:Label|null=null;
 private pulses=0;
 onPulse(source:string) { if(this.label)this.label.string='Animation events: '+(++this.pulses)+' · '+source; }
}`;
