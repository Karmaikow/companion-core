export function videoPlan({duration,start=0,end=duration,fps=10,cellSize=256}){
 if(![duration,start,end,fps,cellSize].every(Number.isFinite)||duration<=0||start<0||end>duration+.001||end<=start||fps<1||fps>30||!Number.isInteger(cellSize)||cellSize<32||cellSize>512)throw Error('Confira o trecho, FPS e tamanho dos quadros.');
 const count=Math.ceil((end-start)*fps-1e-8);
 if(count>512)throw Error('O trecho gera mais de 512 quadros. Reduza o FPS ou selecione um trecho menor.');
 const columns=Math.ceil(Math.sqrt(count)),rows=Math.ceil(count/columns);
 const size=Math.min(cellSize,Math.floor(Math.sqrt(16777216/(columns*rows))));
 return{count,columns,rows,frameWidth:size,frameHeight:size,width:columns*size,height:rows*size,times:Array.from({length:count},(_,i)=>Math.min(start+i/fps,end-.0001)),fps};
}
export function removeColor(data,color,tolerance){
 const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
 if(!/^#[0-9a-f]{6}$/i.test(color)||!Number.isFinite(tolerance)||tolerance<0||tolerance>255)throw Error('Cor de fundo inválida.');
 for(let i=0;i<data.length;i+=4)if(Math.max(Math.abs(data[i]-rgb[0]),Math.abs(data[i+1]-rgb[1]),Math.abs(data[i+2]-rgb[2]))<=tolerance)data[i+3]=0;
}
function waitFor(video,event,signal,ready,begin){
 return new Promise((resolve,reject)=>{
  let timer;
  const cleanup=()=>{clearTimeout(timer);video.removeEventListener(event,done);video.removeEventListener('error',fail);signal?.removeEventListener('abort',abort);};
  const done=()=>{cleanup();resolve();},fail=()=>{cleanup();reject(Error('Não foi possível decodificar o vídeo. Experimente MP4 H.264 ou WebM.'));};
  const abort=()=>{cleanup();reject(new DOMException('Extração cancelada.','AbortError'));};
  if(signal?.aborted)return abort();
  video.addEventListener(event,done,{once:true});video.addEventListener('error',fail,{once:true});signal?.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>{cleanup();reject(Error('O vídeo demorou para responder. Tente um trecho menor.'));},15000);
  try{if(ready?.())done();else begin?.();}catch(e){cleanup();reject(e);}
 });
}
export async function openVideo(file,signal){
 if(!(file instanceof Blob)||file.size>256000000)throw Error('Escolha um vídeo de até 256 MB.');
 const url=URL.createObjectURL(file),video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';
 const dispose=()=>{video.removeAttribute('src');video.load();URL.revokeObjectURL(url);};
 try{
  await waitFor(video,'loadedmetadata',signal,null,()=>{video.src=url;video.load();});
  if(!Number.isFinite(video.duration)||video.duration<=0||!video.videoWidth||!video.videoHeight)throw Error('O vídeo não tem duração ou dimensões válidas.');
  return{video,dispose};
 }catch(e){dispose();throw e;}
}
export async function extractVideo(video,options,{signal,onProgress=()=>{}}={}){
 const plan=videoPlan({duration:video.duration,...options});
 const canvas=document.createElement('canvas');canvas.width=plan.width;canvas.height=plan.height;
 const ctx=canvas.getContext('2d',{willReadFrequently:Boolean(options.keyColor)});if(!ctx)throw Error('Canvas indisponível.');
 const scale=Math.min(plan.frameWidth/video.videoWidth,plan.frameHeight/video.videoHeight),w=video.videoWidth*scale,h=video.videoHeight*scale;
 for(let i=0;i<plan.count;i++){
  if(signal?.aborted)throw new DOMException('Extração cancelada.','AbortError');
  const time=plan.times[i];
  await waitFor(video,'seeked',signal,()=>Math.abs(video.currentTime-time)<.00001&&video.readyState>=2,()=>{video.currentTime=time;});
  const x=i%plan.columns*plan.frameWidth,y=Math.floor(i/plan.columns)*plan.frameHeight;
  ctx.drawImage(video,x+(plan.frameWidth-w)/2,y+(plan.frameHeight-h)/2,w,h);
  if(options.keyColor){const pixels=ctx.getImageData(x,y,plan.frameWidth,plan.frameHeight);removeColor(pixels.data,options.keyColor,options.tolerance??40);ctx.putImageData(pixels,x,y);}
  onProgress(i+1,plan.count);
 }
 return{canvas,plan};
}
