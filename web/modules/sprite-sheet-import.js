import {ACTIONS,DIRECTIONS,validateAtlas} from './sprite-atlas.js';
export const MAYUNA_VIDEO_LAYOUT=Object.freeze({columns:12,rows:20,frameWidth:256,frameHeight:256,gapX:5,gapY:5,marginX:0,marginY:0});
export function sheetLayout(input,width,height,allowScaled=false){
 const l={...input};for(const k of ['columns','rows','frameWidth','frameHeight','gapX','gapY','marginX','marginY']){if(!Number.isInteger(l[k])||l[k]<(['columns','rows','frameWidth','frameHeight'].includes(k)?1:0))throw Error('Grade inválida: use medidas inteiras não negativas.');}
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>16777216||l.columns*l.rows>512)throw Error('Use até 512 quadros e 16 milhões de pixels.');
 const expectedWidth=2*l.marginX+l.columns*l.frameWidth+(l.columns-1)*l.gapX,expectedHeight=2*l.marginY+l.rows*l.frameHeight+(l.rows-1)*l.gapY;
 const sx=width/expectedWidth,sy=height/expectedHeight,scaled=width!==expectedWidth||height!==expectedHeight;
 if(scaled&&(!allowScaled||Math.abs(sx/sy-1)>.01))throw Error(`A grade espera ${expectedWidth} × ${expectedHeight} px. Confira as medidas ou habilite folha redimensionada proporcionalmente.`);
 const frameWidth=Math.max(1,Math.round(l.frameWidth*sx)),frameHeight=Math.max(1,Math.round(l.frameHeight*sy));
 if(frameWidth*l.columns*frameHeight*l.rows>16777216)throw Error('Folha normalizada maior que 16 milhões de pixels.');
 const rects=Array.from({length:l.columns*l.rows},(_,i)=>{const x0=(l.marginX+(i%l.columns)*(l.frameWidth+l.gapX))*sx,y0=(l.marginY+Math.floor(i/l.columns)*(l.frameHeight+l.gapY))*sy;const x=Math.round(x0),y=Math.round(y0),w=Math.round(x0+l.frameWidth*sx)-x,h=Math.round(y0+l.frameHeight*sy)-y;if(w<1||h<1||x+w>width||y+h>height)throw Error('Uma célula está fora da imagem.');return{x,y,w,h};});
 return{...l,frameWidth,frameHeight,rects,scaled,sourceWidth:width,sourceHeight:height,sourceLayout:{...input}};
}
export function frameSelection(text,count){
 if(typeof text!=='string'||text.length>5000||!Number.isInteger(count)||count<1||count>512)throw Error('Seleção inválida.');const out=[];
 if(!text.trim())return out;
 for(const item of text.split(',')){const m=/^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(item);if(!m)throw Error('Use quadros como 0-15,20,22-25.');const a=Number(m[1]),b=Number(m[2]??m[1]);if(a>b||b>=count||out.length+b-a+1>512)throw Error(`Use quadros entre 0 e ${count-1}, em ordem crescente por intervalo.`);for(let i=a;i<=b;i++)out.push(i);}
 return out;
}
/** Map an ordered turntable/video sheet into eight contiguous direction sectors. */
export function classifyOrderedTurn(count,{anchor='S',clockwise=true}={}){
 if(!Number.isInteger(count)||count<1||count>512||!DIRECTIONS.includes(anchor)||typeof clockwise!=='boolean')throw Error('Parâmetros do AutoMap inválidos.');
 const first=DIRECTIONS.indexOf(anchor),framesByDirection=Object.fromEntries(DIRECTIONS.map(d=>[d,[]]));
 for(let frame=0;frame<count;frame++){
  const sector=Math.min(7,Math.floor(frame*8/count));
  const direction=(first+(clockwise?sector:-sector)+8)%8;
  framesByDirection[DIRECTIONS[direction]].push(frame);
 }
 return{framesByDirection,classification:{method:'ordered-turn-v1',anchor,clockwise,frameCount:count,reviewed:false}};
}
export function mappedAtlas(layout,action,ranges,fps,loop,classification=null){
 if(!ACTIONS.includes(action)||!Number.isFinite(fps)||fps<1||fps>30||typeof loop!=='boolean')throw Error('Ação, FPS ou repetição inválidos.');
 const dirs={};for(const dir of DIRECTIONS){const frames=frameSelection(ranges[dir]??'',layout.rects.length);if(frames.length)dirs[dir]={frames,fps,loop};}
 if(!Object.keys(dirs).length)throw Error('Marque os quadros de pelo menos uma direção antes de enviar ao Studio.');
 return validateAtlas({version:1,image:'atlas.png',frameWidth:layout.frameWidth,frameHeight:layout.frameHeight,columns:layout.columns,rows:layout.rows,pivot:{x:.5,y:.95},mirror:false,draft:true,clips:{[action]:dirs},source:{kind:'sheet-import',layout:layout.sourceLayout,width:layout.sourceWidth,height:layout.sourceHeight,scaled:layout.scaled,...(classification?{classification:{...classification}}:{})}},layout.columns*layout.frameWidth,layout.rows*layout.frameHeight);
}
export function clipFrame(clip,elapsedSeconds,reduced=false){const index=Math.max(0,Math.floor(elapsedSeconds*clip.fps));return clip.frames[reduced?0:clip.loop===false?Math.min(clip.frames.length-1,index):index%clip.frames.length];}
export function cropSheet(image,layout){const canvas=document.createElement('canvas');canvas.width=layout.columns*layout.frameWidth;canvas.height=layout.rows*layout.frameHeight;const c=canvas.getContext('2d');if(!c)throw Error('Canvas indisponível.');layout.rects.forEach((r,i)=>c.drawImage(image,r.x,r.y,r.w,r.h,(i%layout.columns)*layout.frameWidth,Math.floor(i/layout.columns)*layout.frameHeight,layout.frameWidth,layout.frameHeight));return canvas;}
