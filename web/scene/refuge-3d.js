import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { manifestationStatus } from '../modules/manifestation-rules.js';
import { request } from '../modules/http.js';
import { findRoute, advanceRoute, facing } from '../modules/refuge-navigation.js';
import { validateAtlas, selectClip, frameRect } from '../modules/sprite-atlas.js';
import { readSprite, spriteKey, watchSprites } from '../modules/sprite-store.js';

const ASSET='/assets/refuge/';
const placements=[
  {asset:'temple',x:0,z:-7,width:7,solid:true},
  {asset:'pond',x:6,z:1,width:5.5,solid:true},
  ...[[-8,-6],[-6,0],[-8,6],[8,-6],[8,7]].map(([x,z])=>({asset:'tree',x,z,width:3.6,solid:true})),
  ...[-3,0,3,6,9].map(z=>({asset:'path',x:0,z,width:2.6,solid:false}))
];
export class Refuge3DRenderer {
  constructor(){this.width=1;this.height=1;this.position={x:0,z:5};this.route=[];this.presence='idle';this.direction='SE';this.animTime=0;this.generation=0;this.dead=false;this.obstacles=[];this.body={available:false};}
  mount(host){
    this.host=host;this.world=host.closest('#worldFrame')||host;
    this.gl=new THREE.WebGLRenderer({alpha:false,antialias:true,powerPreference:'low-power'});
    this.canvas=this.gl.domElement;this.canvas.id='worldCanvas';this.canvas.setAttribute('aria-label','Refúgio 3D. Toque no chão para caminhar.');
    this.canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;';host.append(this.canvas);
    this.gl.outputColorSpace=THREE.SRGBColorSpace;this.gl.toneMapping=THREE.ACESFilmicToneMapping;this.gl.toneMappingExposure=1.15;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#101e3c');this.scene.fog=new THREE.Fog('#101e3c',35,70);
    const pmrem=new THREE.PMREMGenerator(this.gl),room=new RoomEnvironment();this.environment=pmrem.fromScene(room,.04);this.scene.environment=this.environment.texture;room.dispose();pmrem.dispose();
    this.camera=new THREE.PerspectiveCamera(42,1,.1,100);this.camera.position.set(0,22,27);this.camera.lookAt(0,0,0);
    this.scene.add(new THREE.HemisphereLight('#cde9ff','#35535e',2.1));
    const moon=new THREE.DirectionalLight('#d9e9ff',2.6);moon.position.set(-10,20,8);this.scene.add(moon);
    this.ground=new THREE.Mesh(new THREE.CircleGeometry(18,64),new THREE.MeshStandardMaterial({color:'#294c60',roughness:.95}));this.ground.rotation.x=-Math.PI/2;this.scene.add(this.ground);
    const soil=document.createElement('canvas');soil.width=512;soil.height=512;const paint=soil.getContext('2d');paint.fillStyle='#789395';paint.fillRect(0,0,512,512);
    for(let i=0;i<10000;i++){const x=(i*173.31)%512,y=(i*79.71)%512;paint.fillStyle=i%3?'#58787755':'#afc6b844';paint.fillRect(x,y,1+(i%3),1+(i%2));}
    const soilMap=new THREE.CanvasTexture(soil);soilMap.colorSpace=THREE.SRGBColorSpace;soilMap.wrapS=soilMap.wrapT=THREE.RepeatWrapping;soilMap.repeat.set(7,7);this.ground.material.map=soilMap;
    this.surfaces=[this.ground];this.heightRay=new THREE.Raycaster();
    const rim=new THREE.Mesh(new THREE.CylinderGeometry(18,18.4,.7,64),new THREE.MeshStandardMaterial({color:'#1b314a',roughness:.8}));rim.position.y=-.4;this.scene.add(rim);
    const stars=new Float32Array(90*3);for(let i=0;i<90;i++){const t=i*2.39996,r=20+(i%9)*2;stars[i*3]=Math.cos(t)*r;stars[i*3+1]=10+(i%13)*1.3;stars[i*3+2]=Math.sin(t)*r-15;}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(stars,3));this.scene.add(new THREE.Points(geometry,new THREE.PointsMaterial({color:'#d9f5ff',size:.07})));
    this.sprite=new THREE.Sprite(new THREE.SpriteMaterial({transparent:true,alphaTest:.12,depthWrite:false,toneMapped:false}));this.sprite.visible=false;this.scene.add(this.sprite);
    const sc=document.createElement('canvas');sc.width=128;sc.height=128;const ctx=sc.getContext('2d'),gradient=ctx.createRadialGradient(64,64,4,64,64,64);gradient.addColorStop(0,'rgba(0,8,20,.45)');gradient.addColorStop(1,'rgba(0,8,20,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
    this.shadow=new THREE.Mesh(new THREE.PlaneGeometry(2.1,1.35),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(sc),transparent:true,depthWrite:false}));this.shadow.rotation.x=-Math.PI/2;this.shadow.position.y=.035;this.scene.add(this.shadow);
    this.soul=new THREE.Mesh(new THREE.IcosahedronGeometry(.38,2),new THREE.MeshBasicMaterial({color:'#8fcfff',wireframe:true}));this.scene.add(this.soul);
    this.marker=new THREE.Mesh(new THREE.RingGeometry(.23,.30,32),new THREE.MeshBasicMaterial({color:'#9dffe2',side:THREE.DoubleSide}));this.marker.rotation.x=-Math.PI/2;this.marker.position.y=.055;this.marker.visible=false;this.scene.add(this.marker);
    this.target=document.querySelector('.entity-target');this.nameplate=document.querySelector('.entity-nameplate');
    this.notice=document.createElement('span');this.notice.className='refuge-reaction';this.notice.setAttribute('role','status');this.notice.style.cssText='position:absolute;bottom:60px;left:50%;transform:translateX(-50%);z-index:4;padding:8px 14px;border-radius:12px;background:#071629cf;color:#deefff;pointer-events:none;';host.append(this.notice);this.message('Carregando o refúgio…',0);
    this.motion=matchMedia('(prefers-reduced-motion: reduce)');this.ray=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.floor=new THREE.Plane(new THREE.Vector3(0,1,0),0);
    this.pet=()=>{if(!this.state||document.body.classList.contains('is-locked'))return;this.react('affection');host.dispatchEvent(new CustomEvent('companion:affection',{bubbles:true,detail:{id:this.state.identity.id}}));};
    this.target?.addEventListener('click',this.pet);
    this.down=e=>{this.press={x:e.clientX,y:e.clientY,id:e.pointerId};};
    this.up=e=>{const p=this.press;this.press=null;if(!p||p.id!==e.pointerId||Math.hypot(p.x-e.clientX,p.y-e.clientY)>8||e.button>0)return;this.move(e);};
    this.cancel=()=>{this.press=null;};
    this.world.addEventListener('pointerdown',this.down);this.world.addEventListener('pointerup',this.up);this.world.addEventListener('pointercancel',this.cancel);
    this.onLost=e=>{e.preventDefault();this.host.dispatchEvent(new Event('refuge:context-lost'));};this.canvas.addEventListener('webglcontextlost',this.onLost);
    this.unwatch=watchSprites(({key})=>{if(key===this.key)void this.loadBody();});
    this.loadModels();
  }
  async loadModels(){
    const loader=new GLTFLoader();let failures=0;
    await Promise.all(['temple','tree','pond','path'].map(async name=>{
      try{
        const {scene:model}=await loader.loadAsync(ASSET+name+'.glb');
        if(this.dead){this.disposeObject(model);return;}
        const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
        model.traverse(o=>{for(const m of [o.material].flat().filter(Boolean)){if('metalness'in m)m.metalness=Math.min(m.metalness,.55);if('roughness'in m)m.roughness=Math.max(m.roughness,.4);m.envMapIntensity=.8;}});
        for(const p of placements.filter(p=>p.asset===name)){
          const copy=model.clone(true),group=new THREE.Group(),s=p.width/Math.max(size.x,size.z,.001);
          copy.position.set(-center.x,-box.min.y,-center.z);group.add(copy);group.scale.setScalar(s);group.position.set(p.x,p.solid?0:.015,p.z);this.scene.add(group);
          if(!p.solid)this.surfaces.push(group);
          if(p.solid){const w=name==='tree'?.8:size.x*s,d=name==='tree'?.8:size.z*s;this.obstacles.push({x:p.x,z:p.z,w,d});}
        }
      }catch(error){failures++;console.warn('Asset do refúgio indisponível:',name,error);}
    }));
    if(this.dead)return;this.ready=true;this.host.dataset.refugeReady='true';this.message(failures?'Alguns modelos não carregaram. Reabra o refúgio para tentar novamente.':'Clique ou toque no chão para explorar.',failures?0:4500);this.render(performance.now());
  }
  disposeObject(object){object.traverse(o=>{o.geometry?.dispose();for(const m of [o.material].flat().filter(Boolean)){for(const value of Object.values(m))if(value?.isTexture)value.dispose();m.dispose();}});}
  setTheme(){} // Sapphire refuge lighting is separate from the interface accent.
  setState(state){
    const changed=this.state?.identity?.id!==state.identity?.id;this.state=state;
    if(changed){this.position={x:0,z:5};this.route=[];this.preview=false;}
    this.formStatus=state.manifestation||manifestationStatus(state);this.generation=this.formStatus.generation??0;
    if(this.formStatus.hasBody)this.preview=false;
    this.updateBody();
  }
  setFormPreview(value){this.preview=!!value&&!this.formStatus?.hasBody;this.updateBody();}
  updateBody(){
    this.bodyActive=!!(this.formStatus?.hasBody||this.preview);
    if(!this.bodyActive){this.route=[];this.marker.visible=false;this.position={x:0,z:5};}
    const signature=JSON.stringify([this.state?.identity?.id,this.generation,this.state?.artwork,this.bodyActive]);
    if(signature!==this.signature){this.signature=signature;void this.loadBody();}
  }
  async loadBody(){
    const epoch=this.loadEpoch=(this.loadEpoch||0)+1;this.body.available=false;this.sprite.visible=false;
    this.key=spriteKey(this.state?.identity?.id,this.generation);
    if(!this.bodyActive){this.statusArt();return;}
    try{
      let saved=null;try{saved=await readSprite(this.key);}catch{ /* Private browsing may disable IndexedDB. */ }
      let blob,atlas;
      if(saved){blob=saved.blob;atlas=saved.atlas;}
      else if(this.state.artwork){
        const {id,frames=1,fps=6}=this.state.artwork;
        const response=await request(`/api/companion/art/${this.state.identity.id}/${id}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
        if(!response.ok)throw Error('Arte não disponível');blob=await response.blob();atlas={legacy:true,frames,fps};
      }else if(this.state.identity.name?.toLowerCase()==='mayuna'&&this.generation<=1){
        const [png,json]=await Promise.all([fetch(ASSET+'mayuna-walk.png'),fetch(ASSET+'mayuna-walk.json')]);if(!png.ok||!json.ok)throw Error('Sprite não disponível');blob=await png.blob();atlas=await json.json();
      }else{this.statusArt();return;}
      const image=await createImageBitmap(blob);
      if(this.dead||epoch!==this.loadEpoch){image.close();return;}
      if(atlas.legacy)atlas={version:1,frameWidth:image.width/atlas.frames,frameHeight:image.height,columns:atlas.frames,rows:1,pivot:{x:.5,y:.94},clips:{idle:{S:{frames:Array.from({length:atlas.frames},(_,i)=>i),fps:atlas.fps}}}};
      this.atlas=validateAtlas(atlas,image.width,image.height);
      this.sprite.material.map?.dispose();this.bitmap?.close();this.bitmap=image;
      // Canvas textures avoid ImageBitmap flipY differences between WebGL implementations.
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);
      this.texture=new THREE.CanvasTexture(canvas);this.texture.colorSpace=THREE.SRGBColorSpace;this.texture.minFilter=THREE.LinearFilter;this.texture.magFilter=THREE.LinearFilter;this.texture.generateMipmaps=false;
      this.sprite.material.map=this.texture;this.sprite.material.needsUpdate=true;
      this.body.available=true;this.animTime=0;this.statusArt();this.render(performance.now());
    }catch(e){if(epoch===this.loadEpoch&&!this.dead){this.message('Não foi possível abrir o sprite. Importe a arte no Estúdio.',6000);this.statusArt();console.warn(e);}}
  }
  statusArt(){this.host.dataset.bodyRenderer=this.body.available?'sprite2d':'awaiting-art';this.host.dispatchEvent(new Event('companion-art-status'));}
  message(text,duration=2600){if(!this.notice)return;this.notice.textContent=text;this.notice.hidden=!text;this.noticeUntil=duration?performance.now()+duration:Infinity;}
  react(kind){this.effect={kind,time:performance.now()};this.message(({affection:'♥ Carinho',bond:'Vínculo fortalecido',level:'Novo nível!',xp:'Experiência recebida',reply:'Estou aqui!'})[kind]||'');this.render(performance.now());}
  setPresence(status){this.presence=status;}
  move(e){
    if(!this.ready||!this.bodyActive||!this.body.available||!this.state||document.body.classList.contains('is-locked')||e.target.closest('button,a,input,textarea,select,.hud-panel,.world-topline,.entity-nameplate,.form-preview-banner'))return;
    const rect=this.host.getBoundingClientRect();this.pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);this.ray.setFromCamera(this.pointer,this.camera);
    const hit=this.ray.ray.intersectPlane(this.floor,new THREE.Vector3());if(!hit)return;
    const goal={x:hit.x,z:hit.z},route=findRoute(this.position,goal,this.obstacles);
    if(!route){this.message('Escolha um trecho livre do chão.');return;}
    this.route=route;this.marker.position.set(goal.x,.06,goal.z);this.marker.visible=true;this.render(performance.now());
  }
  resize(w,h,dpr){this.width=Math.max(1,w);this.height=Math.max(1,h);this.gl.setPixelRatio(Math.min(dpr||1,1.5));this.gl.setSize(this.width,this.height,false);this.camera.aspect=this.width/this.height;this.camera.position.set(0,this.width<this.height?30:22,this.width<this.height?36:27);this.camera.lookAt(0,0,0);this.camera.updateProjectionMatrix();}
  render(time=0){
    if(this.dead||!this.gl)return;
    const dt=time&&this.lastTime?Math.min(.065,Math.max(0,(time-this.lastTime)/1000)):0;if(time)this.lastTime=time;
    const moving=this.bodyActive&&this.body.available&&this.route.length>0;
    if(moving){const step=advanceRoute(this.position,this.route,dt*2.4);this.position=step.position;if(step.travelled){this.direction=facing(step.dx,step.dz);this.animTime+=step.travelled/2.4;}if(!this.route.length)this.marker.visible=false;}
    else this.animTime=0;
    this.sprite.visible=!!(this.bodyActive&&this.body.available);this.soul.visible=!this.sprite.visible;
    this.scene.updateMatrixWorld();this.heightRay.set(new THREE.Vector3(this.position.x,8,this.position.z),new THREE.Vector3(0,-1,0));const groundY=this.heightRay.intersectObjects(this.surfaces,true)[0]?.point.y||0;
    this.shadow.position.set(this.position.x,groundY+.035,this.position.z);this.soul.position.set(this.position.x,1.2,this.position.z);
    if(!this.motion.matches){this.soul.rotation.y=time*.0003;this.soul.rotation.z=time*.00015;}
    if(this.sprite.visible){
      const {clip,flip}=selectClip(this.atlas,moving?'walk':'idle',this.direction),t=moving?this.animTime:time/1000;
      const index=clip.frames[this.motion.matches?0:Math.floor(t*clip.fps)%clip.frames.length],r=frameRect(this.atlas,index),a=this.atlas;
      this.texture.repeat.set((flip?-1:1)/a.columns,1/a.rows);this.texture.offset.set((r.x/a.frameWidth+(flip?1:0))/a.columns,1-(r.y/a.frameHeight+1)/a.rows);
      this.sprite.center.set(flip?1-a.pivot.x:a.pivot.x,1-a.pivot.y);this.sprite.scale.set(2.3*a.frameWidth/a.frameHeight,2.3,1);this.sprite.position.set(this.position.x,groundY+.06,this.position.z);
    }
    const projected=new THREE.Vector3(this.position.x,1.15,this.position.z).project(this.camera),foot=new THREE.Vector3(this.position.x,0,this.position.z).project(this.camera);
    const x=(projected.x+1)*this.width/2,y=(1-projected.y)*this.height/2,fy=(1-foot.y)*this.height/2;
    if(this.target)Object.assign(this.target.style,{left:x+'px',top:y+'px',width:'74px',height:'100px',transform:'translate(-50%,-50%)'});
    if(this.nameplate)Object.assign(this.nameplate.style,{left:x+'px',top:(fy+8)+'px',transform:'translateX(-50%)'});
    const hint=document.getElementById('refugeMoveHint');if(hint)hint.hidden=!this.sprite.visible;
    if(this.noticeUntil<performance.now())this.notice.hidden=true;
    this.gl.render(this.scene,this.camera);
  }
  destroy(){this.dead=true;this.loadEpoch=(this.loadEpoch||0)+1;this.unwatch?.();this.world?.removeEventListener('pointerdown',this.down);this.world?.removeEventListener('pointerup',this.up);this.world?.removeEventListener('pointercancel',this.cancel);this.target?.removeEventListener('click',this.pet);this.canvas?.removeEventListener('webglcontextlost',this.onLost);this.scene&&this.disposeObject(this.scene);this.environment?.dispose();this.bitmap?.close();this.gl?.dispose();this.canvas?.remove();this.notice?.remove();}
}
