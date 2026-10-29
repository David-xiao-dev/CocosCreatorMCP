import {deflateSync} from 'node:zlib';
// Original 5x7 glyph artwork; generator, example font and PNG follow ../../LICENSE.
const glyphs={
 ' ':['00000','00000','00000','00000','00000','00000','00000'],
 A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],C:['01111','10000','10000','10000','10000','10000','01111'],
 0:['01110','10001','10011','10101','11001','10001','01110'],1:['00100','01100','00100','00100','00100','00100','01110'],2:['01110','10001','00001','00010','00100','01000','11111'],3:['11110','00001','00001','01110','00001','00001','11110'],4:['00010','00110','01010','10010','11111','00010','00010'],5:['11111','10000','10000','11110','00001','00001','11110'],6:['01110','10000','10000','11110','10001','10001','01110'],7:['11111','00001','00010','00100','01000','01000','01000'],8:['01110','10001','10001','01110','10001','10001','01110'],9:['01110','10001','10001','01111','00001','00001','01110']
};
const entries=Object.entries(glyphs);
const crc32=data=>{let c=0xffffffff;for(const b of data){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
const chunk=(type,data)=>{const t=Buffer.from(type),n=Buffer.alloc(4),crc=Buffer.alloc(4);n.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([n,t,data,crc]);};
export function bitmapPng(){
 const width=128,height=8,raw=Buffer.alloc((width*4+1)*height);
 entries.forEach(([,rows],i)=>rows.forEach((row,y)=>[...row].forEach((pixel,x)=>{const at=y*(width*4+1)+1+(i*6+x)*4;raw[at]=raw[at+1]=raw[at+2]=255;raw[at+3]=pixel==='1'?255:0;})));
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
export const bitmapFnt=`info face="McpPixel" size=8 bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=0 aa=1 padding=0,0,0,0 spacing=1,1 outline=0
common lineHeight=8 base=7 scaleW=128 scaleH=8 pages=1 packed=0
page id=0 file="pixel-font.png"
chars count=${entries.length}
${entries.map(([ch],i)=>`char id=${ch.codePointAt(0)} x=${i*6} y=0 width=5 height=7 xoffset=0 yoffset=0 xadvance=6 page=0 chnl=15`).join('\n')}
kernings count=0
`;
const label=(name,text,x,y,width=1000,height=60)=>({name,position:{x,y,z:0},size:{width,height},components:[{type:'cc.Label',properties:{string:text,fontSize:26}}]});
export const tree={name:'TypographyDemo',size:{width:1100,height:660},children:[
 label('Title','Typography + layout · native editor workflow',0,285),
 label('SystemText','系统字体 · 多语言文字 · English 0123',0,215),
 label('ImportedText','Imported TTF · persistent asset binding',0,145),
 label('BitmapText','ABC 0123456789',0,70),
 {name:'RichText',position:{x:0,y:-15,z:0},size:{width:900,height:70},components:[{type:'cc.RichText'}]},
 label('ShrinkText','Constrained Label: the renderer chooses a smaller actual font size',0,-110,500,50),
 label('WrapText','Wrapped layout uses a fixed width and grows its height.\nSecond line verifies saved text content.',0,-210,650,90),
 {name:'GeometryBox',position:{x:-450,y:0,z:0},size:{width:100,height:40}},
 {name:'OutsideProbe',position:{x:800,y:0,z:0},size:{width:100,height:40}}
]};
