import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { PostProcessing } from '../../vendor/threejs-vfx/postprocessing/PostProcessing.js';
import { Color } from 'three';
/** The Forge owns this compositor; the world keeps its existing postprocessing. */
export function CataloguePost({timeScale=1}:{timeScale?:number}){
 const {gl,scene,camera,size}=useThree();
 const post=useRef<PostProcessing|null>(null);
 const elapsed=useRef(0);
 const flash=useRef({strength:0,color:new Color('white')});
 useEffect(()=>{let alive=true;
  import('../../vendor/threejs-vfx/postprocessing/PostProcessing.js').then(({PostProcessing})=>{if(alive)post.current=new PostProcessing({gl},scene,camera);}).catch(error=>console.error("Falha no pós-processamento VFX",error));
  return()=>{alive=false;post.current?.dispose();post.current=null;};
 },[gl,scene,camera]);
 useEffect(()=>{post.current?.setSize(size.width,size.height,gl.getPixelRatio());},[size.width,size.height,gl]);
 useFrame((_,dt)=>{elapsed.current+=Math.min(dt,0.05)*timeScale;if(post.current){post.current.sync(elapsed.current,flash.current);post.current.render();}else gl.render(scene,camera);},1);
 return null;
}
