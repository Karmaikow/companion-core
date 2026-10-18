import {DIRECTIONS} from './sprite-atlas.js';

// Pixel descriptors deliberately carry no compass semantics. A silhouette alone
// cannot distinguish front/back reliably; only reviewed examples name a view.
export function describeFrame(data,width,height){
 if(data.length!==width*height*4||width<1||height<1)throw Error('Pixels inválidos.');
 const bins=new Float64Array(8*8*4);let mass=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const p=(y*width+x)*4,a=data[p+3]/255,b=(Math.min(7,Math.floor(y/height*8))*8+Math.min(7,Math.floor(x/width*8)))*4;
  mass+=a;for(let k=0;k<3;k++)bins[b+k]+=data[p+k]/255*a;bins[b+3]+=a;
 }
 const scale=64/(width*height);return {empty:mass<1,vector:Array.from(bins,n=>n*scale)};
}
export function distance(a,b){return a.vector.reduce((sum,n,i)=>sum+Math.abs(n-b.vector[i]),0)/a.vector.length;}
export function analyzeFrames(features,anchors={}){
 if(!Array.isArray(features)||!features.length||features.length>512)throw Error('Use de 1 a 512 quadros.');
 for(const [dir,indices]of Object.entries(anchors))if(!DIRECTIONS.includes(dir)||!Array.isArray(indices)||indices.some(i=>!Number.isInteger(i)||i<0||i>=features.length||features[i].empty))throw Error('Referência de direção inválida.');
 const used=new Set();for(const ids of Object.values(anchors))for(const i of ids){if(used.has(i))throw Error('Um quadro não pode confirmar duas direções.');used.add(i);}
 const frames=features.map((f,index)=>{
  const scores=DIRECTIONS.flatMap(direction=>{const refs=anchors[direction]||[];return refs.length?[{direction,cost:Math.min(...refs.map(i=>distance(f,features[i])))}]:[];}).sort((a,b)=>a.cost-b.cost);
  const exact=DIRECTIONS.find(d=>anchors[d]?.includes(index));
  const best=scores[0],margin=scores.length>1?(scores[1].cost-best.cost)/Math.max(.001,scores[1].cost):0;
  const confidence=exact?1:best?Math.max(0,Math.min(1,margin*(1-best.cost))):0;
  const direction=f.empty?null:exact||((confidence>=.25&&best.cost<.18)?best.direction:null);
  return {index,direction,confidence:f.empty?0:confidence,suggested:best?.direction??null,reviewed:Boolean(exact),continuity:index?1-Math.min(1,distance(f,features[index-1])*4):null,reason:f.empty?'empty':direction?'reference-match':'uncertain'};
 });
 // Temporal continuity is evidence, never permission to propagate compass labels.
 const groups=[];for(const f of frames){const last=groups.at(-1);if(!last||last.direction!==f.direction||f.continuity<.65)groups.push({direction:f.direction,frames:[f.index]});else last.frames.push(f.index);}
 const cycles=[];for(const group of groups){const ids=group.frames;if(!group.direction||ids.length<4)continue;const first=features[ids[0]];for(let j=3;j<ids.length;j++){const seam=distance(first,features[ids[j]]),movement=Math.max(...ids.slice(1,j).map(i=>distance(first,features[i])));if(seam<.025&&movement>.04)cycles.push({direction:group.direction,frames:ids.slice(0,j),confidence:Math.max(0,1-seam/.025),accepted:false});}}
 return {version:1,algorithm:'local-pixel-reference-v1',fps:10,anchors:structuredClone(anchors),frames,groups,cycles};
}
export function analyzeCanvas(canvas,layout,anchors={}){
 const c=canvas.getContext('2d',{willReadFrequently:true});const features=layout.rects.map((_,i)=>{
  // Bounded thumbnails keep analysis local and independent of original resolution.
  const small=document.createElement('canvas');small.width=small.height=32;const ctx=small.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,i%layout.columns*layout.frameWidth,Math.floor(i/layout.columns)*layout.frameHeight,layout.frameWidth,layout.frameHeight,0,0,32,32);return describeFrame(ctx.getImageData(0,0,32,32).data,32,32);
 });if(!c)throw Error('Canvas indisponível.');return analyzeFrames(features,anchors);
}

export function history(initial,limit=50){
 let current=structuredClone(initial),past=[],future=[];
 return {get value(){return structuredClone(current);},get canUndo(){return past.length>0;},get canRedo(){return future.length>0;},push(next){past.push(current);if(past.length>limit)past.shift();current=structuredClone(next);future=[];return this.value;},undo(){if(past.length){future.push(current);current=past.pop();}return this.value;},redo(){if(future.length){past.push(current);current=future.pop();}return this.value;}};
}
