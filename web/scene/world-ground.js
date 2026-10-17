import {generateChunk,hash} from '../modules/world-rules.js';

// CPU diffuse texture: no external images, downloads, shader hooks or paid generation.
const smooth=t=>t*t*(3-2*t);
const mix=(a,b,t)=>a+(b-a)*t;
function noise(x,z,seed){
 const ix=Math.floor(x),iz=Math.floor(z),fx=smooth(x-ix),fz=smooth(z-iz);
 const n=(a,b)=>{let v=Math.imul(a,374761393)^Math.imul(b,668265263)^seed;v=Math.imul(v^(v>>>13),1274126177);return((v^(v>>>16))>>>0)/4294967295;};
 return mix(mix(n(ix,iz),n(ix+1,iz),fx),mix(n(ix,iz+1),n(ix+1,iz+1),fx),fz);
}
const ramp=(a,b,v)=>smooth(Math.max(0,Math.min(1,(v-a)/(b-a))));
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
export function createGroundSampler(world){
 const seed=hash(world.seed+'|ground-v1'),cache=new Map();
 const biome=(x,z)=>{const key=x+','+z;if(!cache.has(key))cache.set(key,rgb(generateChunk(world,x,z).color));return cache.get(key);};
 return (x,z)=>{
  // Interpolate colors between biome centers, including negative chunks.
  const gx=(x-8)/16,gz=(z-8)/16,ix=Math.floor(gx),iz=Math.floor(gz),tx=smooth(gx-ix),tz=smooth(gz-iz);
  const a=biome(ix,iz),b=biome(ix+1,iz),c=biome(ix,iz+1),d=biome(ix+1,iz+1);
  const earth=ramp(.52,.73,noise(x*.21,z*.21,seed)),stone=ramp(.76,.88,noise(x*.37+91,z*.37-17,seed^771));
  const grain=noise(x*9,z*9,seed^992)*.16+.9,blades=noise(x*18,z*3,seed^37)*.13+.93;
  return a.map((v,i)=>{
   const grass=mix(mix(v,b[i],tx),mix(c[i],d[i],tx),tz)*blades;
   return Math.round(Math.max(0,Math.min(255,mix(mix(grass,[139,116,88][i],earth),[142,145,136][i],stone)*grain)));
  });
 };
}
export function groundPixels(sample,cx,cz,size=128){
 const pixels=new Uint8ClampedArray(size*size*4);
 for(let row=0;row<size;row++)for(let col=0;col<size;col++){
  const color=sample(cx*16+(col+.5)*16/size,cz*16+(row+.5)*16/size),i=(row*size+col)*4;
  pixels[i]=color[0];pixels[i+1]=color[1];pixels[i+2]=color[2];pixels[i+3]=255;
 }
 return pixels;
}
