import * as THREE from 'three';
import { createGarden } from '../scene/refuge-garden.js';
import { findRoute, advanceRoute, facing } from './refuge-navigation.js';
import { api } from './api.js';

const $ = id => document.getElementById(id);
const world = $('world');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
world.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#b4c4ac');
scene.fog = new THREE.Fog('#b4c4ac', 42, 80);
const camera = new THREE.OrthographicCamera(-11, 11, 11, -11, .1, 100);
camera.position.set(18, 22, 25); camera.lookAt(0, 0, 1);
scene.add(new THREE.HemisphereLight('#fff3d7', '#62794f', 2.1));
const sun = new THREE.DirectionalLight('#fff1cc', 2.0); sun.position.set(-10, 22, 10); sun.castShadow = true; scene.add(sun);
const garden = createGarden(scene);
const ground = garden.ground;
const loader = new THREE.TextureLoader();
const texture = await new Promise((resolve,reject)=>loader.load('/assets/refuge/mayuna-reference.png',resolve,undefined,reject));
texture.colorSpace = THREE.SRGBColorSpace; texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
const bird = new THREE.Sprite(new THREE.SpriteMaterial({ map:texture,transparent:true,alphaTest:.08,depthWrite:false,toneMapped:false }));
bird.scale.set(3.2,3.2,1); bird.position.set(0,1.62,5); scene.add(bird);
const shadow = new THREE.Mesh(new THREE.CircleGeometry(.84,32),new THREE.MeshBasicMaterial({color:'#203b34',transparent:true,opacity:.3,depthWrite:false})); shadow.rotation.x=-Math.PI/2;shadow.position.set(0,.035,5);scene.add(shadow);
const marker = new THREE.Mesh(new THREE.RingGeometry(.22,.3,32),new THREE.MeshBasicMaterial({color:'#c4fff1',side:THREE.DoubleSide}));marker.rotation.x=-Math.PI/2;marker.position.y=.06;marker.visible=false;scene.add(marker);
const ray = new THREE.Raycaster(), pointer = new THREE.Vector2(), floor = new THREE.Plane(new THREE.Vector3(0,1,0),0);
let state=null, route=[], routePosition={x:0,z:5}, direction='SE', elapsed=0, last=performance.now(), dead=false, locked=false;

function resize(){const w=world.clientWidth,h=world.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);const aspect=w/h,span=aspect<1?27:22;camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(world);resize();
function status(text){$('status').textContent=text;}
function updateState(next){if(!next)return;state=next;$('name').textContent=next.identity?.name||'Mayuna';$('form').textContent=`${next.manifestation?.stageName||next.core?.evolutionStage||'Alma'} · ${next.manifestation?.stage||''}`;$('coreLevel').textContent=`Nv. ${next.core?.level??1}`;$('coreXp').textContent=`${next.core?.xp??0}/${next.core?.xpToNextLevel??100} XP`;$('combatLevel').textContent=`Nv. ${next.combat?.level??1}`;$('combatXp').textContent=`${next.combat?.xp??0}/${next.combat?.xpToNextLevel??100} XP`;$('bond').textContent=String(next.bond?.value??0);$('relationship').textContent=next.bond?.relationship||'início';$('memories').textContent=String((next.memories||[]).length);}
function addMessage(text,who){const p=document.createElement('p');p.className=who==='user'?'user-message':'mayuna-message';p.textContent=text;$('messages').append(p);$('messages').scrollTop=$('messages').scrollHeight;}
function projectCharacter(){const p=new THREE.Vector3(routePosition.x,1.0,routePosition.z).project(camera);const x=(p.x+1)*world.clientWidth/2,y=(1-p.y)*world.clientHeight/2;Object.assign($('mayunaHit').style,{left:`${x}px`,top:`${y}px`});const q=new THREE.Vector3(routePosition.x,0,routePosition.z).project(camera),foot=(1-q.y)*world.clientHeight/2;$('nameplate').style.left=`${x}px`;$('nameplate').style.top=`${foot+10}px`;}
function onGround(clientX,clientY){const rect=renderer.domElement.getBoundingClientRect();pointer.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);return ray.ray.intersectPlane(floor,new THREE.Vector3());}
let press=null;
renderer.domElement.addEventListener('pointerdown',e=>{press={x:e.clientX,y:e.clientY,id:e.pointerId};});
renderer.domElement.addEventListener('pointerup',e=>{const p=press;press=null;if(!p||p.id!==e.pointerId||Math.hypot(p.x-e.clientX,p.y-e.clientY)>8||e.button>0)return;const hit=onGround(e.clientX,e.clientY);if(!hit)return;if(Math.hypot(hit.x-routePosition.x,hit.z-routePosition.z)<1.5){void affection();return;}const next=findRoute(routePosition,{x:hit.x,z:hit.z},garden.obstacles);if(!next){status('Esse trecho está bloqueado. Escolha outro ponto da clareira.');return;}route=next;marker.position.set(hit.x,.06,hit.z);marker.visible=true;status('Mayuna está a caminho…');});
async function affection(){if(locked||!state)return;locked=true;status('Mayuna recebeu seu carinho.');try{const result=await api.affection(state.identity.id);if(result.state)updateState(result.state);status(result.awarded?'Mayuna adorou o carinho · vínculo registrado!':'Mayuna adorou o carinho · vínculo diário já está completo.');}catch(error){status(error.message||'Não foi possível registrar o carinho no Core.');}finally{locked=false;}}
$('mayunaHit').addEventListener('click',()=>void affection());
$('chatForm').addEventListener('submit',async e=>{e.preventDefault();const input=$('chatInput'),message=input.value.trim();if(!message||locked)return;input.value='';addMessage(message,'user');locked=true;$('send').disabled=true;$('chatNote').textContent='Mayuna está pensando…';try{const result=await api.chat(message);const reply=result.response||result.reply||result.message||'Mayuna recebeu sua mensagem.';addMessage(reply,'mayuna');if(result.state)updateState(result.state);$('chatNote').textContent=result.state?.identity?.id==='DEMO-SEM-CORE'?'Prévia demonstrativa: conversa não salva no Core.':'Conversa salva no Core.';}catch(error){$('chatNote').textContent=error.message||'O Core não respondeu. Tente novamente.';}finally{locked=false;$('send').disabled=false;input.focus();}});
$('mobileChat').addEventListener('click',()=>$('chatPanel').classList.toggle('open'));$('closeChat').addEventListener('click',()=>$('chatPanel').classList.remove('open'));
async function load(){try{updateState(await api.state());status('A clareira de Mayuna está pronta.');}catch(error){status(error.message||'Entre no Core local para carregar sua Companion.');}}
await load();
function frame(now){if(dead)return;const dt=Math.min(.065,Math.max(0,(now-last)/1000));last=now;elapsed+=dt;const moving=route.length>0;if(moving){const step=advanceRoute(routePosition,route,dt*2.6);routePosition=step.position;if(step.travelled){const yaw=Math.atan2(camera.position.x,camera.position.z-1);direction=facing(step.dx*Math.cos(yaw)-step.dz*Math.sin(yaw),step.dx*Math.sin(yaw)+step.dz*Math.cos(yaw));}if(!route.length){marker.visible=false;status('Mayuna está explorando a clareira.');}}
  bird.position.set(routePosition.x,1.62+(moving?Math.abs(Math.sin(elapsed*14))*.12:Math.sin(elapsed*2.2)*.035),routePosition.z);bird.material.rotation=(direction==='W'||direction==='NW'||direction==='SW')?Math.PI:0;shadow.position.set(routePosition.x,.035,routePosition.z);shadow.scale.setScalar(moving ? 0.8 : 1);garden.update(now,matchMedia('(prefers-reduced-motion: reduce)').matches);projectCharacter();renderer.render(scene,camera);requestAnimationFrame(frame);}
requestAnimationFrame(frame);
window.addEventListener('pagehide',()=>{dead=true;renderer.dispose();texture.dispose();},{once:true});
