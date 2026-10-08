export function bindHudEffects(){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');let raf=0,target,x=0,y=0;
 document.addEventListener('pointermove',event=>{
  if(reduced.matches||event.pointerType==='touch')return;target=event.target.closest('.hud-panel');if(!target)return;
  const box=target.getBoundingClientRect();x=event.clientX-box.left;y=event.clientY-box.top;
  if(!raf)raf=requestAnimationFrame(()=>{raf=0;if(target){target.style.setProperty('--mx',`${x}px`);target.style.setProperty('--my',`${y}px`);}});
 },{passive:true});
}
