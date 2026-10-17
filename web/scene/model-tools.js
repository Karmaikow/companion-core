import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
export async function readGLB(blob){
  if(!(blob instanceof Blob)||blob.size>20_000_000)throw Error('Use GLB autocontido de até 20 MB.');
  const buffer=await blob.arrayBuffer(),v=new DataView(buffer);if(buffer.byteLength<20||v.getUint32(0,true)!==0x46546c67||v.getUint32(4,true)!==2||v.getUint32(8,true)!==buffer.byteLength)throw Error('GLB 2 inválido.');
  const length=v.getUint32(12,true);if(v.getUint32(16,true)!==0x4e4f534a||length>buffer.byteLength-20)throw Error('Cabeçalho GLB inválido.');
  const json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,length)));
  if([...(json.buffers||[]),...(json.images||[])].some(x=>x.uri&&!x.uri.startsWith('data:')))throw Error('O GLB usa arquivos externos. Exporte com texturas e buffers incorporados.');
  if((json.extensionsRequired||[]).some(x=>['KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_texture_basisu'].includes(x)))throw Error('GLB comprimido exige decodificador não incluído. Exporte sem Draco/Meshopt/KTX2.');
  const vertices=(json.meshes||[]).flatMap(m=>m.primitives||[]).reduce((n,p)=>n+(json.accessors?.[p.attributes?.POSITION]?.count||0),0);if(vertices>600000)throw Error('Reduza o modelo a até 600 mil vértices.');
  // Block requests even for unexpected extension resources. Embedded images use blob URLs.
  const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(!url.startsWith('blob:')&&!url.startsWith('data:'))throw Error('Recurso externo não permitido.');return url;});
  const gltf=await new GLTFLoader(manager).parseAsync(buffer,'');const box=new THREE.Box3().setFromObject(gltf.scene),size=box.getSize(new THREE.Vector3());if(!Number.isFinite(size.length())||size.y<=.00001)throw Error('O modelo não tem geometria visível.');
  gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});return gltf;
}
export function disposeObject(root,{geometry=true,textures=true}={}){const gs=new Set(),ms=new Set(),ts=new Set();root?.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of [].concat(o.material||[])){ms.add(m);if(textures)for(const value of Object.values(m))if(value?.isTexture)ts.add(value);}});if(geometry)gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());}
export function validateVariant(v={}){const out={tint:v.tint??'#ffffff',saturation:v.saturation??1};if(!/^#[a-f\d]{6}$/i.test(out.tint)||!Number.isFinite(out.saturation)||out.saturation<0||out.saturation>2)throw Error('Variante inválida.');return out;}
export function variantScene(original,settings){
  const v=validateVariant(settings),scene=clone(original),tint=new THREE.Color(v.tint),maps=new Map(),materials=new Map();let pixels=0;
  try{scene.traverse(o=>{if(!o.isMesh)return;const change=base=>{if(materials.has(base))return materials.get(base);const m=base.clone();materials.set(base,m);
    if(m.color){const hsl={};m.color.getHSL(hsl);m.color.setHSL(hsl.h,Math.min(1,hsl.s*v.saturation),hsl.l).multiply(tint);}
    if(m.map&&v.saturation!==1){if(!maps.has(m.map)){const image=m.map.image,w=image?.width,h=image?.height;if(!w||!h||w>4096||h>4096||(pixels+=w*h)>16777216)throw Error('Texturas excedem o limite de edição (4096 px / 16 MP). Original preservado.');const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,w,h);for(let i=0;i<data.data.length;i+=4){const a=data.data,y=.2126*a[i]+.7152*a[i+1]+.0722*a[i+2];for(let k=0;k<3;k++)a[i+k]=Math.max(0,Math.min(255,y+(a[i+k]-y)*v.saturation));}ctx.putImageData(data,0,0);const map=m.map.clone();map.source=new THREE.Source(c);map.needsUpdate=true;maps.set(m.map,map);}m.map=maps.get(m.map);}return m;};o.material=Array.isArray(o.material)?o.material.map(change):change(o.material);});return scene;
  }catch(e){materials.forEach(m=>m.dispose());maps.forEach(t=>t.dispose());throw e;}
}
export function releaseVariant(root){const ms=new Set(),maps=new Set();root?.traverse(o=>{for(const m of [].concat(o.material||[])){ms.add(m);if(m.map?.image instanceof HTMLCanvasElement)maps.add(m.map);}});ms.forEach(m=>m.dispose());maps.forEach(t=>t.dispose());}
export function fitModel(root,height=3){const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),group=new THREE.Group();root.position.sub(new THREE.Vector3(center.x,box.min.y,center.z));group.add(root);group.scale.setScalar(height/size.y);return group;}
export async function exportGLB(scene,animations=[]){const buffer=await new GLTFExporter().parseAsync(scene,{binary:true,animations,onlyVisible:false,maxTextureSize:4096});return new Blob([buffer],{type:'model/gltf-binary'});}
