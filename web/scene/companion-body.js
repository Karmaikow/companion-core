import { request } from '../modules/http.js';
/** Transparent 2D illustration or horizontal sprite strip; no GPU or WebGL required. */
export class CompanionBodyRenderer {
  mount(host) {
    this.host=host;this.canvas=document.createElement('canvas');this.canvas.className='companion-body-canvas';
    this.canvas.setAttribute('role','img');this.canvas.setAttribute('aria-label','Forma ilustrada da Companion');
    this.canvas.style.cssText='position:absolute;pointer-events:none;z-index:1;';
    host.append(this.canvas);this.ctx=this.canvas.getContext('2d');this.available=false;
    this.motion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  }
  setRecipe(recipe, artwork, companionId) {
    const signature=JSON.stringify([artwork,companionId]);if(signature===this.signature)return;
    this.signature=signature;this.available=false;this.image=null;this.ctx?.clearRect(0,0,this.canvas.width,this.canvas.height);
    this.host.dataset.bodyRenderer='awaiting-art';
    if(!artwork || !/^[a-f0-9]{64}$/.test(artwork.id) || !/^MC-[A-Z0-9-]+$/.test(companionId||''))return;
    const image=new Image();
    image.onload=()=>{if(this.signature!==signature)return;this.image=image;this.frames=Math.max(1,Math.min(8,artwork.frames||1));this.fps=Math.max(1,Math.min(12,artwork.fps||6));this.available=!!this.ctx;this.host.dataset.bodyRenderer='sprite2d';this.onChange?.();};
    image.onerror=()=>{if(this.signature===signature){this.available=false;this.host.dataset.bodyRenderer='missing-art';this.onChange?.();}};
    void (async()=>{
      try {
        const response=await request(`/api/companion/art/${companionId}/${artwork.id}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
        if(!response.ok)throw Error('Arte indisponível');
        const blob=await response.blob();
        const src=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
        if(this.signature===signature)image.src=src;
      }catch{image.onerror();}
    })();
  }
  resize(width,height,dpr,x,y) {
    const size=Math.round(Math.min(380,Math.max(180,width*.72),height*.62));
    const ratio=Math.min(dpr||1,2);
    if(this.size!==size||this.ratio!==ratio){this.size=size;this.ratio=ratio;this.canvas.width=Math.round(size*ratio);this.canvas.height=Math.round(size*ratio);}
    Object.assign(this.canvas.style,{width:size+'px',height:size+'px',left:(x-size/2)+'px',top:(y-size/2)+'px'});
  }
  render(time,hover,thinking) {
    if(!this.available||!this.image)return;
    const c=this.ctx,size=this.size,reduced=this.motion?.matches;
    const frame=reduced?0:Math.floor(time*this.fps/1000)%this.frames;
    const sw=this.image.naturalWidth/this.frames,sh=this.image.naturalHeight;
    const scale=Math.min(size*.9/sw,size*.9/sh),w=sw*scale,h=sh*scale;
    c.setTransform(this.ratio,0,0,this.ratio,0,0);c.clearRect(0,0,size,size);c.save();
    c.translate(size/2,size/2+(reduced?0:Math.sin(time*.0018)*3));
    const breath=reduced?1:1+Math.sin(time*.002)*.012;
    c.scale(1+(reduced?0:hover*.025),breath);c.rotate(reduced?0:Math.sin(time*(thinking ? .003 : .001))*.012);
    c.drawImage(this.image,frame*sw,0,sw,sh,-w/2,-h/2,w,h);c.restore();
  }
  destroy(){this.signature=null;this.image=null;this.canvas?.remove();this.available=false;}
}
