import * as THREE from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {createMayuna} from '../scene/mayuna-rig.js';
import {DIRECTIONS,validateAtlas} from './sprite-atlas.js';
import {WORLD_VIEW,defaultWorld} from './world-rules.js';
import {WorldStage} from '../scene/world-stage.js';
import {localLibrary} from './asset-studio-store.js';
const $=id=>document.getElementById(id),size=256,frames=8,actions=['idle','walk','attack'];
const actor=createMayuna(),scene=new THREE.Scene();scene.add(actor.rig);
scene.add(new THREE.HemisphereLight('#e6f4ff','#506376',2.2));const light=new THREE.DirectionalLight('#fff0da',2.6);light.position.set(-3,6,5);scene.add(light);
const renderer=new THREE.WebGLRenderer({canvas:$('model'),alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(512,512,false);renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
const span=3.7,camera=new THREE.OrthographicCamera(-span/2,span/2,span/2,-span/2,.1,40);
// Match actual world elevation, rather than the older textual 35-degree prompt.
const elevation=Math.atan2(WORLD_VIEW.y,Math.hypot(WORLD_VIEW.x,WORLD_VIEW.z));
const target=new THREE.Vector3(0,1.10,0);camera.position.set(0,target.y+Math.sin(elevation)*10,Math.cos(elevation)*10);camera.lookAt(target);camera.updateMatrixWorld();
const foot=new THREE.Vector3(0,0,0).project(camera),pivot={x:(foot.x+1)/2,y:(1-foot.y)/2};
const helper=new THREE.SkeletonHelper(actor.rig);helper.visible=false;scene.add(helper);
for(const dir of DIRECTIONS)$('direction').add(new Option(dir,dir));$('direction').value='SE';
let capturing=false,result,world;const rotation=Object.fromEntries(DIRECTIONS.map((dir,i)=>{const a=-i*Math.PI/4;return [dir,Math.atan2(Math.sin(a),Math.cos(a)/Math.sin(elevation))];}));
function render(action,t,dir){actor.rig.rotation.y=rotation[dir];actor.pose(action,t);renderer.render(scene,camera);}
let lastFrame=0;function animate(time){if(!capturing&&!document.hidden&&time-lastFrame>80){render($('action').value,(time/1000)%1,$('direction').value);lastFrame=time;}requestAnimationFrame(animate);}requestAnimationFrame(animate);
$('bones').onclick=()=>{helper.visible=!helper.visible;$('bones').textContent=helper.visible?'Ocultar ossos':'Ver ossos';};
function download(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function png(canvas){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Falha ao exportar PNG.')),'image/png'));}
async function capture(){
 if(capturing)return;capturing=true;$('capture').disabled=true;const showBones=helper.visible;helper.visible=false;const atlasCanvas=document.createElement('canvas');atlasCanvas.width=size*8;atlasCanvas.height=size*24;const ctx=atlasCanvas.getContext('2d');const atlas={version:1,image:'mayuna-factory.png',frameWidth:size,frameHeight:size,columns:8,rows:24,pivot,mirror:false,draft:true,clips:{},provenance:{libraryVersion:actor.version,visualSeed:actor.seed,source:'authored-rig',cameraElevation:elevation,styleApproved:false}};
 try{
 renderer.setSize(size,size,false);let index=0,minAlpha=255,maxAlpha=0,clipped=0;const check=document.createElement('canvas');check.width=check.height=size;const cc=check.getContext('2d',{willReadFrequently:true});
 for(const action of actions){atlas.clips[action]={};for(const dir of DIRECTIONS){const clip={frames:[],fps:8,loop:action!=='attack'};atlas.clips[action][dir]=clip;for(let f=0;f<frames;f++){
  render(action,action==='attack'?f/(frames-1):f/frames,dir);ctx.drawImage(renderer.domElement,(index%8)*size,Math.floor(index/8)*size);clip.frames.push(index++);
  cc.clearRect(0,0,size,size);cc.drawImage(renderer.domElement,0,0);const data=cc.getImageData(0,0,size,size).data;let occupied=0;
  for(let p=3;p<data.length;p+=4){const a=data[p];minAlpha=Math.min(minAlpha,a);maxAlpha=Math.max(maxAlpha,a);if(a>16){occupied++;const n=(p-3)/4,x=n%size,y=Math.floor(n/size);if(x<2||y<2||x>=size-2||y>=size-2)clipped++;}}
  if(!occupied)throw Error(`Quadro vazio: ${action}/${dir}/${f}`);
 }
 $('status').textContent=`Capturando ${action} � ${dir} � ${index}/192`;await new Promise(resolve=>setTimeout(resolve,0));}}
 validateAtlas(atlas,atlasCanvas.width,atlasCanvas.height);if(minAlpha!==0||maxAlpha===0||clipped)throw Error('Transpar�ncia ou enquadramento inv�lido. Ajuste a c�mera antes de exportar.');
 const blob=await png(atlasCanvas);result={atlas,blob};const sheet=$('sheet'),sc=sheet.getContext('2d');sheet.width=size*4;sheet.height=size*2;for(let d=0;d<8;d++)sc.drawImage(atlasCanvas,0,d*size,size,size,d%4*size,Math.floor(d/4)*size,size,size);
 for(const id of ['png','json','save','attack'])$(id).disabled=false;
 world??=new WorldStage($('world'),data=>{$('worldStatus').textContent=data.clip+' � '+data.stats;});const recipe=defaultWorld();recipe.seed='mayuna-factory-review';recipe.sprite='factory-preview';recipe.biomes.forEach(b=>b.rules=b.rules.filter(r=>r.asset==='builtin:rock'));
 await world.enter(recipe,[{id:'factory-preview',metadata:{assetType:'sprite',atlas}}],{file:async()=>blob});world.camera.zoom=2.5;world.camera.updateProjectionMatrix();
 $('status').textContent='192 quadros capturados e validados. PNG transparente aplicado ao mundo abaixo.';
 window.factoryReview={atlas,boneCount:actor.bones.length,clipped,minAlpha,maxAlpha,world,blob};
 }catch(e){$('status').textContent=e.message;throw e;}finally{renderer.setSize(512,512,false);helper.visible=showBones;capturing=false;$('capture').disabled=false;}
}
$('capture').onclick=()=>capture().catch(console.error);
$('png').onclick=()=>download(result.blob,'mayuna-factory.png');$('json').onclick=()=>download(new Blob([JSON.stringify(result.atlas,null,2)],{type:'application/json'}),'mayuna-factory.json');
$('attack').onclick=()=>world.setAction('attack');
$('save').onclick=async()=>{try{await localLibrary.save({brief:{name:'Mayuna � base articulada 0.1',kind:'prop',prompt:'Estudo de p�ssaro 3D convertido em sprites; estilo n�o aprovado.',palette:'safira e creme'},prompt:'Estudo visual',image:result.blob,mimeType:'image/png',references:[],source:'import',metadata:{assetType:'sprite',atlas:result.atlas,role:'companion'}});$('status').textContent='Folha guardada na biblioteca local do Studio.';}catch(e){$('status').textContent=e.message;}};
window.captureFactory=capture;
async function exportModel(){if(capturing)throw Error('Aguarde a captura.');capturing=true;const originals=[];try{actor.rig.rotation.set(0,0,0);actor.pose('idle',0);actor.rig.traverse(o=>{if(o.isMesh){originals.push([o,o.material]);o.material=new THREE.MeshStandardMaterial({color:o.material.color,map:o.material.map,roughness:1});}});return await new GLTFExporter().parseAsync(actor.rig,{binary:true,animations:actor.clips});}finally{for(const [o,m]of originals){o.material.dispose();o.material=m;}capturing=false;}}
const glbButton=document.createElement('button');glbButton.textContent='Baixar base GLB animada';glbButton.id='glb';$('bones').parentElement.append(glbButton);glbButton.onclick=async()=>{try{download(new Blob([await exportModel()],{type:'model/gltf-binary'}),'mayuna-bird-study.glb');}catch(e){$('status').textContent=e.message;}};window.exportFactoryModel=exportModel;
