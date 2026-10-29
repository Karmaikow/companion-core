/** Visual reference study. No combat rules or damage are inferred from video. */
import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { VfxStore, K } from './vfx/engine';
import { VfxLayer } from './vfx/VfxLayer';
import { beam, burst, missile } from './vfx/recipes';

const SPELLS = ['Barreira solar', 'Muralha glacial', 'Onda de estacas de gelo', 'Feixe elétrico', 'Bola de fogo', 'Feixe espiral', 'Tempestade violeta', 'Erupção glacial'] as const;
const v = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
function cast(s: VfxStore, id: number) {
  const from=v(-3,1,0), to=v(2,0.5,0);
  if (id===1 || id===2 || id===7) {
    const n=id===1?28:64;
    for(let i=0;i<n;i++) {
      const a=i*2.39996, r=Math.sqrt(i/n)*1.9;
      const at=id===1?v(1.7,0,(i%14-6.5)*0.24):id===2?v(-1.6+(i/n)*4,0,Math.sin(a)*0.8):v(2+Math.cos(a)*r,0,Math.sin(a)*r);
      s.after(id===2?i/n*0.9:0.2+i/n*0.25,()=>{
        s.crystal(at,'#b8f4ff',id===1?1.7+(i%4)*0.3:0.7+((i*17)%13)/8,2.5,a);
        s.emit({k:K.PUFF,pos:at,vel:v(0,0.2,0),life:1.1,size:0.3,size1:0.85,c1:'#d8faff',alpha:0.22});
      });
    }
  }
  if(id===4) missile(s,{style:'chamas',color:'#ff770e',from,to,duration:0.85,arc:0.5,size:0.85,onArrive:at=>{
    burst(s,'chamas',at,'#ff880e',1.8,0);
    for(let j=0;j<12;j++) {
      const a=j*Math.PI/6;
      s.line({pts:[at.clone(),at.clone().add(v(Math.cos(a)*2,0.02,Math.sin(a)*2))],w:0.055,color:'#ff650b',life:0.7});
    }
  }});
  if(id===3) {
    for(let i=0;i<12;i++) s.after(i*0.1,()=>beam(s,'raios',from,to,0.15,'#63bdff'));
    s.after(1.1,()=>burst(s,'raios',to,'#9bdcff',1,0));
  }
  if(id===5) {
    for(let j=0;j<5;j++) s.after(j*0.16,()=>{
      beam(s,'luz',from,to,0.3,'#fff1d5');
      const pts=Array.from({length:100},(_,i)=>{const u=i/99,a=u*Math.PI*12+j;return v(-3+u*5,1+Math.cos(a)*u*0.8,Math.sin(a)*u*0.8);});
      s.line({pts,w:0.055,color:j%2?'#aeefff':'#ffcd94',life:0.65});
    });
    s.after(0.9,()=>burst(s,'luz',to,'#d1f8ff',1.4,0));
  }
  if(id===6) {
    s.emit({k:K.RING,pos:v(2,0.04,0),flat:true,life:2,size:3,size1:3.4,c1:'#be78ff'});
    for(let j=0;j<18;j++) s.after(j*0.08,()=>{
      const a=j*2.4, p=v(2+Math.cos(a)*0.8,0.1,Math.sin(a)*0.8);
      beam(s,'raios',p.clone().add(v(0,4,0)),p,0.3,'#b977ff');
      s.emit({k:K.STAR,pos:p,life:0.35,size:0.9,c1:'#eedaff'});
    });
  }
}
function Scene({id,paused}:{id:number;paused:boolean}) {
  const s=useMemo(()=>new VfxStore(),[]), elapsed=useRef(4), dome=useRef<THREE.Mesh>(null);
  useFrame((_,dt)=>{
    if(paused)return;
    elapsed.current+=Math.min(dt,0.05);
    if(elapsed.current>=4){s.clear();cast(s,id);elapsed.current=0;}
    if(dome.current){dome.current.visible=id===0 && elapsed.current<2.8;dome.current.scale.setScalar(Math.min(1,elapsed.current*4));}
  });
  return <>
    <color attach="background" args={['#060e19']}/><hemisphereLight args={['#c6eaff','#112133',2]}/><directionalLight position={[2,7,4]} intensity={3}/>
    <mesh rotation={[-Math.PI/2,0,0]}><planeGeometry args={[25,25]}/><meshStandardMaterial color="#101f30" roughness={0.8}/></mesh>
    <gridHelper args={[20,20,'#243e50','#172c3e']} position={[0,0.005,0]}/>
    {[-3,2].map(x=><group key={x} position={[x,0,0]}><mesh position={[0,0.65,0]}><capsuleGeometry args={[0.22,0.85,4,8]}/><meshStandardMaterial color={x<0?'#66d3df':'#b8a48b'}/></mesh><mesh position={[0,1.35,0]}><sphereGeometry args={[0.22,16,12]}/><meshStandardMaterial color="#e1c7a1"/></mesh></group>)}
    <mesh ref={dome} position={[-3,0,0]}><sphereGeometry args={[1.65,32,20,0,Math.PI*2,0,Math.PI/2]}/><meshBasicMaterial color="#ffbe42" transparent opacity={0.34} side={THREE.DoubleSide} depthWrite={false} wireframe/></mesh>
    <VfxLayer store={s} timeScale={paused?0:1}/>
  </>;
}
export function ReferenceSkills(){
  const [open,setOpen]=useState(false),[id,setId]=useState(0),[run,setRun]=useState(0),[paused,setPaused]=useState(false);
  return <section style={{margin:'12px 0'}}><button type="button" onClick={()=>setOpen(!open)}>{open?'Fechar':'Abrir'} teste das habilidades do vídeo</button>{open&&<>
    <p>Estudo visual · oito efeitos · repetição a cada 4 segundos. Dano e movimentação de combate não estão conectados nesta galeria.</p>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>{SPELLS.map((name,i)=><button type="button" key={name} aria-pressed={id===i} onClick={()=>{setId(i);setPaused(false);}} style={{borderColor:id===i?'#67d9ff':undefined}}>{name}</button>)}</div>
    <div style={{height:360,borderRadius:12,overflow:'hidden'}}><Canvas dpr={[1,1.5]} camera={{position:[7,6,9],fov:43}} onCreated={({camera})=>camera.lookAt(0,0.7,0)}><Scene key={`${id}-${run}`} id={id} paused={paused}/></Canvas></div>
    <p><button type="button" onClick={()=>setPaused(!paused)}>{paused?'Continuar':'Pausar'}</button> <button type="button" onClick={()=>{setRun(run+1);setPaused(false);}}>Reiniciar</button></p>
  </>}</section>;
}
