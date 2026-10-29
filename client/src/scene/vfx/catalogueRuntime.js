import * as THREE from 'three';
import { getAbility } from '../../vendor/threejs-vfx/abilities/registry.js';
import { ParticleEngine } from '../../vendor/threejs-vfx/particles/ParticleEngine.js';
import { LightPool } from '../../vendor/threejs-vfx/effects/LightPool.js';
import { DecalSystem } from '../../vendor/threejs-vfx/effects/GroundDecals.js';
import { FissureSystem } from '../../vendor/threejs-vfx/effects/GroundFissures.js';
import { BurstSystem } from '../../vendor/threejs-vfx/effects/BurstSphere.js';
import { frame } from '../../vendor/threejs-vfx/core/FrameUniforms.js';
import { patchOnBeforeCompile } from '../../vendor/threejs-vfx/utils/shaderPatch.js';

/** One bounded, disposable renderer per viewport. Upstream code never changes combat. */
export class CatalogueRuntime {
  constructor(scene,camera) {
    this.root=new THREE.Group();scene.add(this.root);this.camera=camera;
    this.previousMask=camera.layers.mask;camera.layers.enable(1);
    this.alive=true;this.pending=[];this.active=[];this.time=0;this.idle=0;
    this.depth=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);this.depth.needsUpdate=true;
    this.particles=new ParticleEngine(this.root);this.lights=new LightPool(this.root);
    this.decals=new DecalSystem(this.root);this.fissures=new FissureSystem(this.root);this.bursts=new BurstSystem(this.root);
    this.context={scene:this.root,camera,particles:this.particles,lights:this.lights,decals:this.decals,fissures:this.fissures,bursts:this.bursts,
      environment:{registerShadowCaster:m=>m,registerShadowCasterWithPatch:patchOnBeforeCompile},
      shake:{add(){},rumble(){}},flash:{trigger(){}}};
  }
  async cast(request) {
    const descriptor=getAbility(request.id);if(!descriptor||!this.alive)return;
    const Type=await descriptor.load();if(!this.alive)return;
    this.pending.push({Type,request});
    if(this.pending.length>4)this.pending.shift();
  }
  update(dt,width,height) {
    this.time+=dt;
    frame.uTime.value=this.time;frame.uDelta.value=dt;frame.uResolution.value.set(width,height);
    frame.uCameraNear.value=this.camera.near;frame.uCameraFar.value=this.camera.far;frame.uSceneDepth.value=this.depth;
    if(dt===0)return;
    while(this.pending.length){
      const {Type,request}=this.pending.shift();
      if(this.active.length>=4)this.retire(0);
      const effect=new Type(this.context);this.root.add(effect.group);
      effect.spawn(request.origin,new THREE.Vector3(Math.sin(request.yaw),0,Math.cos(request.yaw)),Math.max(0.5,request.distance));
      this.active.push(effect);
    }
    for(let i=this.active.length-1;i>=0;i--){this.active[i].update(dt);if(this.active[i].isFinished)this.retire(i);}
    this.idle=this.active.length?0:this.idle+dt;
    // Particle emitters are shared during a cast, but must not accumulate across the entire catalogue.
    if(this.idle>4 && this.particles.systems.size)this.particles.dispose();
    this.particles.flush();this.decals.update(dt);this.fissures.update(dt);this.bursts.update(dt);this.lights.update(dt);
  }
  retire(i){const [a]=this.active.splice(i,1);a.destroy();a.dispose();this.root.remove(a.group);}
  dispose(){this.alive=false;this.pending.length=0;while(this.active.length)this.retire(0);this.particles.dispose();this.lights.dispose();this.decals.dispose();this.fissures.dispose();this.bursts.dispose();this.depth.dispose();this.root.removeFromParent();this.camera.layers.mask=this.previousMask;}
}
