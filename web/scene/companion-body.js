import { request } from '../modules/http.js';
import {readSprite,spriteKey,watchSprites} from '../modules/sprite-store.js';
import {decodeArtImage} from '../modules/art-image.js';
import {validateAtlas,selectClip,frameRect} from '../modules/sprite-atlas.js';
import {clipFrame} from '../modules/sprite-sheet-import.js';
/** Transparent 2D illustration or horizontal sprite strip; no GPU or WebGL required. */
export class CompanionBodyRenderer {
  mount(host) {
    this.host=host;this.canvas=document.createElement('canvas');this.canvas.className='companion-body-canvas';
    this.canvas.setAttribute('role','img');this.canvas.setAttribute('aria-label','Forma ilustrada da Companion');
    this.canvas.style.cssText='position:absolute;pointer-events:none;z-index:1;';
    host.append(this.canvas);this.ctx=this.canvas.getContext('2d');this.available=false;
    this.motion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.direction='SE';this.action='idle';this.started=0;this.epoch=0;
    this.unwatch=watchSprites(({key})=>{if(key===this.key&&this.recipeArgs){this.signature=null;this.setRecipe(...this.recipeArgs);}});
  }
  setRecipe(recipe, artwork, companionId,generation=0) {
    this.recipeArgs=[recipe,artwork,companionId,generation];this.key=spriteKey(companionId,generation);
    const signature=JSON.stringify([artwork,companionId,generation]);if(signature===this.signature)return;
    const epoch=++this.epoch;
    this.signature=signature;this.available=false;this.image=null;this.ctx?.clearRect(0,0,this.canvas.width,this.canvas.height);
    this.host.dataset.bodyRenderer='awaiting-art';
    if(!/^MC-[A-Z0-9-]+$/.test(companionId||''))return;
    this.atlas=null;
    void (async()=>{let saved;try{saved=await readSprite(this.key);}catch{}if(epoch!==this.epoch)return;
      if(saved){try{const image=await decodeArtImage(saved.blob),atlas=validateAtlas(saved.atlas,image.naturalWidth,image.naturalHeight);if(epoch!==this.epoch)return;this.image=image;this.atlas=atlas;this.available=!!this.ctx;this.started=null;this.host.dataset.bodyRenderer='sprite2d';this.onChange?.();}catch{if(epoch===this.epoch){this.host.dataset.bodyRenderer='missing-art';this.onChange?.();}}return;}
      if(epoch===this.epoch)this.loadLegacy(artwork,companionId,signature,epoch);
    })();
  }
  loadLegacy(artwork,companionId,signature,epoch){
    if(!artwork || !/^[a-f0-9]{64}$/.test(artwork.id))return;
    const image=new Image();
    image.onload=()=>{if(this.epoch!==epoch)return;this.image=image;this.frames=Math.max(1,Math.min(8,artwork.frames||1));this.fps=Math.max(1,Math.min(12,artwork.fps||6));this.available=!!this.ctx;this.host.dataset.bodyRenderer='sprite2d';this.onChange?.();};
    image.onerror=()=>{if(this.epoch===epoch){this.available=false;this.host.dataset.bodyRenderer='missing-art';this.onChange?.();}};
    void (async()=>{
      try {
        const response=await request(`/api/companion/art/${companionId}/${artwork.id}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
        if(!response.ok)throw Error('Arte indisponível');
        const blob=await response.blob();
        const src=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
        if(this.epoch===epoch)image.src=src;
      }catch{image.onerror();}
    })();
  }
  setMovement(dx,dy,time){const action=Math.hypot(dx,dy)>.00001?'walk':'idle';let direction=this.direction;if(action==='walk')direction=['E','SE','S','SW','W','NW','N','NE'][(Math.round(Math.atan2(dy,dx)/(Math.PI/4))+8)%8];if(action!==this.action||direction!==this.direction)this.started=time;this.action=action;this.direction=direction;}
  resize(width,height,dpr,x,y) {
    const size=Math.round(Math.min(380,Math.max(180,width*.72),height*.62));
    const ratio=Math.min(dpr||1,2);
    if(this.size!==size||this.ratio!==ratio){this.size=size;this.ratio=ratio;this.canvas.width=Math.round(size*ratio);this.canvas.height=Math.round(size*ratio);}
    Object.assign(this.canvas.style,{width:size+'px',height:size+'px',left:(x-size/2)+'px',top:(y-size/2)+'px'});
  }
  render(time,hover,thinking,effect) {
    if(!this.available||!this.image)return;
    const c=this.ctx,size=this.size,reduced=this.motion?.matches;
    if(this.atlas){this.started??=time;const {clip,flip,exact}=selectClip(this.atlas,this.action,this.direction),frame=clipFrame(clip,Math.max(0,time-this.started)/1000,reduced),r=frameRect(this.atlas,frame),scale=Math.min(size*.9/r.w,size*.9/r.h);c.setTransform(this.ratio,0,0,this.ratio,0,0);c.clearRect(0,0,size,size);c.save();c.translate(size/2,size*.92);if(flip)c.scale(-1,1);c.drawImage(this.image,r.x,r.y,r.w,r.h,-r.w*scale*this.atlas.pivot.x,-r.h*scale*this.atlas.pivot.y,r.w*scale,r.h*scale);c.restore();this.canvas.dataset.spriteFrame=String(frame);this.canvas.dataset.spriteDirection=this.direction;this.canvas.dataset.spriteExact=String(exact);return;}
    const frame=reduced?0:Math.floor(time*this.fps/1000)%this.frames;
    const sw=this.image.naturalWidth/this.frames,sh=this.image.naturalHeight;
    const scale=Math.min(size*.9/sw,size*.9/sh),w=sw*scale,h=sh*scale;
    c.setTransform(this.ratio,0,0,this.ratio,0,0);c.clearRect(0,0,size,size);c.save();
    const elapsed=effect?(performance.now()-effect.started)/1000:10;
    const leap=!reduced&&['level','affection','bond','reply'].includes(effect?.kind)&&elapsed<1?Math.sin(elapsed*Math.PI)*8:0;
    c.translate(size/2,size/2-leap);
    if(thinking&&!reduced){c.shadowColor='#8cbaff';c.shadowBlur=8+Math.sin(time*.004)*4;}
    if(effect?.kind==='level'&&!reduced){c.shadowColor='#ffe7a8';c.shadowBlur=18;}

    c.drawImage(this.image,frame*sw,0,sw,sh,-w/2,-h/2,w,h);c.restore();
    if(effect&&!reduced&&elapsed<2.8){
      c.save();c.globalAlpha=Math.max(0,1-elapsed/2.8);c.fillStyle=effect.kind==='level'?'#ffe4a0':'#b8d9ff';c.font='18px sans-serif';
      for(let i=0;i<3;i++){const x=size/2+Math.sin(i*2.1)*w*.38,y=size/2-h*.30-elapsed*18-i*9;c.fillText(effect.kind==='idle'?'z':effect.kind==='affection'||effect.kind==='bond'?'♡':'✧',x,y);}
      c.restore();
    }
  }
  destroy(){this.epoch++;this.unwatch?.();this.signature=null;this.image=null;this.canvas?.remove();this.available=false;}
}

