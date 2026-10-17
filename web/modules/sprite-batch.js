import {ACTIONS,DIRECTIONS,spritePrompt,validateAtlas} from './sprite-atlas.js';
export function batchPlan(actions,directions,frames=4,cell=128){
 if(!Array.isArray(actions)||!actions.length||new Set(actions).size!==actions.length||actions.some(a=>!ACTIONS.includes(a))||!Array.isArray(directions)||!directions.length||new Set(directions).size!==directions.length||directions.some(d=>!DIRECTIONS.includes(d)))throw Error('Escolha ações e direções válidas.');
 if(!Number.isInteger(frames)||frames<2||frames>8||![128,256].includes(cell))throw Error('Use 2–8 quadros e células de 128 ou 256 pixels.');
 const total=actions.length*directions.length*frames,columns=8,rows=Math.ceil(total/columns);
 if(total>512||columns*rows*cell*cell>16777216)throw Error('O lote excede 512 quadros ou 16 milhões de pixels. Reduza ações, quadros ou resolução.');
 return {frames,cell,columns,rows,total,jobs:actions.flatMap(action=>directions.map(direction=>({action,direction,prompt:spritePrompt({action,direction,frames}),status:'pending'})))};
}
export async function runBatch(batch,{save,generate,paused=()=>false,progress=()=>{}}){
 for(const job of batch.jobs){
  if(paused())break;
  if(job.status!=='pending')continue;
  job.status='inflight';job.requestId=crypto.randomUUID();await save(batch);progress(job);
  try{job.blob=await generate(job,batch);job.status='ready';await save(batch);}
  catch(error){job.status='uncertain';job.error=error.message||'Pedido sem confirmação.';await save(batch);throw error;}
 }
 progress(null);
}
export function projectFromBatch(batch,ready){
 const clips={};let first=0;
 for(const job of ready){clips[job.action]??={};clips[job.action][job.direction]={frames:Array.from({length:batch.frames},(_,i)=>first+i),fps:job.action==='sleep'?3:6,loop:['idle','walk','fly','sleep','happy','defend'].includes(job.action)};first+=batch.frames;}
 const rows=Math.ceil(first/8),atlas={version:1,image:'atlas.png',columns:8,rows,frameWidth:batch.cell,frameHeight:batch.cell,pivot:{x:.5,y:.95},mirror:false,clips};
 return validateAtlas(atlas,8*batch.cell,rows*batch.cell);
}
