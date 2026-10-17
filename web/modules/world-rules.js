export const CHUNK_SIZE=16;
export function hash(value){let h=2166136261;for(const c of String(value)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
export function rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=Math.imul(a^a>>>15,1|a);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};}
export const defaultWorld=()=>({version:1,seed:'mayuna-jardim-01',radius:1,biomes:[{name:'Bosque de safira',color:'#789878',density:.55,rules:[{asset:'builtin:tree',weight:3,height:3.4,radius:.6},{asset:'builtin:rock',weight:1,height:.8,radius:.6}]},{name:'Clareira rosada',color:'#a1a47d',density:.4,rules:[{asset:'builtin:pink',weight:2,height:3,radius:.6},{asset:'builtin:rock',weight:1,height:1,radius:.7}]}],sprite:null,monster:null});
export function validateWorld(input){
  if(!input||input.version!==1||typeof input.seed!=='string'||!input.seed.trim()||input.seed.length>80||![1,2].includes(input.radius)||!Array.isArray(input.biomes)||input.biomes.length<1||input.biomes.length>6)throw Error('Mundo inválido: use seed, 1–6 biomas e raio 1 ou 2.');
  const w=structuredClone(input);
  for(const b of w.biomes){if(typeof b.name!=='string'||!b.name.trim()||b.name.length>80||!/^#[0-9a-f]{6}$/i.test(b.color)||!Number.isFinite(b.density)||b.density<0||b.density>1||!Array.isArray(b.rules)||b.rules.length>12)throw Error('Bioma inválido.');for(const r of b.rules){if(typeof r.asset!=='string'||r.asset.length>100||!Number.isFinite(r.weight)||r.weight<=0||r.weight>100||!Number.isFinite(r.height)||r.height<.2||r.height>6||!Number.isFinite(r.radius)||r.radius<0||r.radius>1.3)throw Error('Regra inválida: altura 0,2–6; colisão 0–1,3; peso 1–100.');}}
  if(w.monster!=null&&(typeof w.monster!=='string'||w.monster.length>100))throw Error('Monstro inválido.');
  if(w.sprite!==null&&(typeof w.sprite!=='string'||w.sprite.length>100))throw Error('Sprite inválido.');return w;
}
export function chunkAt(p){return{x:Math.floor(p.x/CHUNK_SIZE),z:Math.floor(p.z/CHUNK_SIZE)};}
export function chunkKeys(p,radius=1){const c=chunkAt(p),out=[];for(let x=c.x-radius;x<=c.x+radius;x++)for(let z=c.z-radius;z<=c.z+radius;z++)out.push(`${x},${z}`);return out;}
export function generateChunk(world,x,z){
  const random=rng(hash(`${world.seed}|${x}|${z}`)),biomeIndex=Math.floor(random()*world.biomes.length),biome=world.biomes[biomeIndex],items=[];
  const total=biome.rules.reduce((sum,r)=>sum+r.weight,0);
  // Four-unit cells leave connected corridors across every boundary. Spawn is clear.
  for(let gx=0;gx<4;gx++)for(let gz=0;gz<4;gz++){
    const roll=random(),px=x*16+gx*4+2+(random()-.5)*.5,pz=z*16+gz*4+2+(random()-.5)*.5,pick=random()*total,rotation=random()*Math.PI*2,scale=.88+random()*.24;
    if(roll>biome.density||!total||Math.hypot(px,pz)<3)continue;
    let sum=0,rule;for(const r of biome.rules){sum+=r.weight;if(pick<sum){rule=r;break;}}if(rule)items.push({asset:rule.asset,x:px,z:pz,rotation,height:rule.height*scale,radius:rule.radius});
  }return{x,z,biomeIndex,color:biome.color,items};
}
export function walkable(p,obstacles,bounds){return Number.isFinite(p.x)&&Number.isFinite(p.z)&&p.x>=bounds.minX&&p.x<=bounds.maxX&&p.z>=bounds.minZ&&p.z<=bounds.maxZ&&!obstacles.some(o=>Math.hypot(p.x-o.x,p.z-o.z)<o.radius+.28);}
export function clearSegment(a,b,obstacles,bounds){const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.12));for(let i=0;i<=n;i++)if(!walkable({x:a.x+(b.x-a.x)*i/n,z:a.z+(b.z-a.z)*i/n},obstacles,bounds))return false;return true;}
export function routeTo(start,goal,obstacles,bounds){
  if(!walkable(start,obstacles,bounds)||!walkable(goal,obstacles,bounds)||Math.hypot(start.x-goal.x,start.z-goal.z)>24)return null;
  if(clearSegment(start,goal,obstacles,bounds))return[{...goal}];
  const step=.5,key=p=>`${Math.round(p.x/step)},${Math.round(p.z/step)}`,snap=p=>({x:Math.round(p.x/step)*step,z:Math.round(p.z/step)*step}),origin=snap(start),end=snap(goal);
  if(!clearSegment(start,origin,obstacles,bounds)||!clearSegment(end,goal,obstacles,bounds))return null;
  const open=[{...origin,g:0,f:0,parent:null}],best=new Map([[key(origin),0]]),closed=new Set();
  while(open.length&&closed.size<6000){open.sort((a,b)=>b.f-a.f);const n=open.pop(),id=key(n);if(closed.has(id))continue;closed.add(id);if(id===key(end)){const out=[{...goal}];for(let p=n;p;p=p.parent)out.unshift({x:p.x,z:p.z});return out;}
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){if(!dx&&!dz)continue;const p={x:n.x+dx*step,z:n.z+dz*step},k=key(p),g=n.g+Math.hypot(dx,dz)*step;if(closed.has(k)||g>=(best.get(k)??Infinity)||!clearSegment(n,p,obstacles,bounds))continue;best.set(k,g);open.push({...p,g,f:g+Math.hypot(p.x-end.x,p.z-end.z),parent:n});}}
  return null;
}
