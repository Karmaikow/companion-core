import {ACTIONS,DIRECTIONS} from './sprite-atlas.js';

export const ACTION_LABELS={idle:'Parada',walk:'Caminhada',fly:'Voo',attack:'Ataque',hurt:'Receber golpe',faint:'Desmaio',pet:'Carinho',sleep:'Dormir',happy:'Alegria',defend:'Defesa'};
export const DIRECTION_LABELS={N:'Norte',NE:'Nordeste',E:'Leste',SE:'Sudeste',S:'Sul',SW:'Sudoeste',W:'Oeste',NW:'Noroeste'};
export const frameCount=atlas=>atlas.frameCount??atlas.columns*atlas.rows;
export const reviewedCount=(atlas,action)=>DIRECTIONS.filter(d=>atlas?.studio?.reviewed?.[action]?.[d]).length;
export function nextDirection(atlas,action,current){
 const first=DIRECTIONS.indexOf(current);
 for(let i=1;i<=8;i++){const d=DIRECTIONS[(first+i)%8];if(!atlas?.studio?.reviewed?.[action]?.[d])return d;}
 return null;
}
export function withDirection(atlas,action,direction,clip){
 if(!ACTIONS.includes(action)||!DIRECTIONS.includes(direction))throw Error('Ação ou direção inválida.');
 const next=structuredClone(atlas);next.clips[action]??={};next.clips[action][direction]=structuredClone(clip);
 next.studio??={};next.studio.reviewed??={};next.studio.reviewed[action]??={};next.studio.reviewed[action][direction]=true;
 return next;
}

/** Append a new source once, or reuse its frame indices when mapping another action. */
export function mergeProjects(base,incoming,sourceId){
 if(typeof sourceId!=='string'||!sourceId||sourceId.length>100)throw Error('Fonte da folha inválida.');
 const count=frameCount(incoming),record=base?.studio?.imports?.[sourceId];
 if(record&&record.count!==count)throw Error('A fonte mudou. Recorte novamente antes de importar.');
 const offset=record?.offset??(base?frameCount(base):0),total=base?(record?frameCount(base):offset+count):count;
 if(total>512)throw Error('O projeto combinado ultrapassa 512 quadros. Use um trecho menor do vídeo ou menos quadros por ação.');
 const next=structuredClone(base||incoming);
 if(base&&!record)next.rows=Math.ceil(total/next.columns);
 if(next.columns*next.rows>512||next.columns*next.rows*next.frameWidth*next.frameHeight>16777216)throw Error('A folha combinada excede o limite de imagem. Use células menores.');
 next.frameCount=total;next.studio??={};next.studio.imports??={};next.studio.reviewed??={};next.studio.classifications??={};
 next.studio.imports[sourceId]={offset,count};
 for(const [action,dirs]of Object.entries(incoming.clips)){
  next.clips[action]??={};next.studio.reviewed[action]??={};
  for(const [direction,clip]of Object.entries(dirs)){
   next.clips[action][direction]={...structuredClone(clip),frames:clip.frames.map(i=>i+offset)};
   delete next.studio.reviewed[action][direction];
  }
  if(incoming.source?.classification)next.studio.classifications[action]=structuredClone(incoming.source.classification);
 }
 return{atlas:next,offset,replace:!base,reuse:Boolean(record)};
}
