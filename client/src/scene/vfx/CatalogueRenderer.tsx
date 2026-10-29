import { Html } from '@react-three/drei';
import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { VfxStore } from './engine';
import type { CatalogueRuntime } from './catalogueRuntime.js';
export function CatalogueRenderer({store,timeScale=1}:{store:VfxStore;timeScale?:number}){
  const {scene,camera,gl}=useThree();
  const [error,setError]=useState('');
  const runtime=useRef<CatalogueRuntime|null>(null), loading=useRef(false);
  useEffect(()=>()=>{runtime.current?.dispose();runtime.current=null;},[scene,camera]);
  useEffect(()=>{let alive=true;
    store.loadCatalogue=()=>{
      if(loading.current||runtime.current)return;
      loading.current=true;
      import('./catalogueRuntime.js').then(({CatalogueRuntime})=>{if(alive)runtime.current=new CatalogueRuntime(scene,camera);}).catch(e=>{console.error('Falha ao carregar catálogo VFX',e);if(alive)setError('Não foi possível carregar o efeito. Selecione novamente para tentar.');loading.current=false;});
    };
    return()=>{alive=false;loading.current=false;store.loadCatalogue=undefined;};
  },[store,scene,camera]);
  useFrame((_,dt)=>{
    if(store.catalogueQueue.length)store.loadCatalogue?.();
    if(!runtime.current)return;
    if(timeScale>0)for(const request of store.catalogueQueue.splice(0))void runtime.current.cast(request).catch(e=>{console.error('Falha no efeito VFX',request.id,e);setError('Falha ao preparar o efeito '+request.id);});
    runtime.current.update(Math.min(dt,0.05)*timeScale,gl.domElement.width,gl.domElement.height);
  });
  return error ? <Html center><p role="alert" style={{background:"#291c28",padding:12,color:"white",width:240}}>{error}</p></Html> : null;
}
