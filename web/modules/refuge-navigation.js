// Coordinates are world X/Z; obstacles include the companion's clearance radius.
export const WORLD_LIMIT = 12;
export const STEP = 0.4;
export function walkable(p, obstacles = [], clearance = 0.35) {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || Math.abs(p.x) > WORLD_LIMIT || Math.abs(p.z) > WORLD_LIMIT) return false;
  return !obstacles.some(o => Math.abs(p.x-o.x) <= o.w/2+clearance && Math.abs(p.z-o.z) <= o.d/2+clearance);
}
export function clearSegment(a,b,obstacles) {
  const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/(STEP/4)));
  for(let i=0;i<=n;i++) if(!walkable({x:a.x+(b.x-a.x)*i/n,z:a.z+(b.z-a.z)*i/n},obstacles))return false;
  return true;
}
/** Bounded A*, with diagonal corner clipping prevented and line-of-sight smoothing. */
export function findRoute(start,goal,obstacles=[]) {
  if(!walkable(start,obstacles)||!walkable(goal,obstacles))return null;
  if(clearSegment(start,goal,obstacles))return [{...goal}];
  const snap=p=>({x:Math.round(p.x/STEP)*STEP,z:Math.round(p.z/STEP)*STEP});
  const key=p=>`${Math.round(p.x/STEP)},${Math.round(p.z/STEP)}`;
  const origin=snap(start),end=snap(goal);
  if(!clearSegment(start,origin,obstacles)||!clearSegment(end,goal,obstacles))return null;
  const open=[{...origin,g:0,f:0,parent:null}],best=new Map([[key(origin),0]]),closed=new Set();
  const heuristic=p=>Math.hypot(p.x-end.x,p.z-end.z);
  while(open.length&&closed.size<4000){
    open.sort((a,b)=>b.f-a.f);const n=open.pop(),id=key(n);
    if(closed.has(id))continue;closed.add(id);
    if(id===key(end)){
      const raw=[{...goal}];for(let p=n;p;p=p.parent)raw.unshift({x:p.x,z:p.z});raw.unshift({...start});
      const path=[];let a=0;
      while(a<raw.length-1){let b=raw.length-1;while(b>a+1&&!clearSegment(raw[a],raw[b],obstacles))b--;path.push(raw[b]);a=b;}
      return path;
    }
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
      if(!dx&&!dz)continue;
      const p={x:n.x+dx*STEP,z:n.z+dz*STEP},k=key(p);
      if(closed.has(k)||!clearSegment(n,p,obstacles))continue;
      const g=n.g+Math.hypot(dx,dz)*STEP;
      if(g>=(best.get(k)??Infinity))continue;
      best.set(k,g);open.push({...p,g,f:g+heuristic(p),parent:n});
    }
  }
  return null;
}
export function advanceRoute(position,route,distance){
  const p={...position};let travelled=0,dx=0,dz=0;
  while(route.length&&distance>0){
    const t=route[0],x=t.x-p.x,z=t.z-p.z,len=Math.hypot(x,z);
    if(len<1e-6){route.shift();continue;}
    const step=Math.min(distance,len);dx=x/len;dz=z/len;p.x+=dx*step;p.z+=dz*step;distance-=step;travelled+=step;
    if(step>=len-1e-6)route.shift();
  }
  return {position:p,travelled,dx,dz};
}
export function facing(dx,dz){
  if(Math.hypot(dx,dz)<1e-6)return 'S';
  return ['E','SE','S','SW','W','NW','N','NE'][(Math.round(Math.atan2(dz,dx)/(Math.PI/4))+8)%8];
}
