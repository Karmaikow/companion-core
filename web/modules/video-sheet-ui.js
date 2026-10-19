import {openVideo,extractVideo,videoPlan} from './video-sheet.js';
export function mountVideoImport(root,{onExtract}){
 root.innerHTML='<details><summary>Criar mega folha a partir de vídeo</summary><p>Envie o vídeo do Gemini. O Studio extrai os quadros neste navegador e prepara a folha para revisão.</p><label>Vídeo MP4 ou WebM<input id="videoFile" type="file" accept="video/mp4,video/webm,.mp4,.webm"></label><div class="pair"><label>Início (s)<input id="videoStart" type="number" min="0" step=".1" value="0"></label><label>Fim (s)<input id="videoEnd" type="number" min="0" step=".1" value="0"></label></div><div class="pair"><label>Quadros por segundo<input id="videoFps" type="number" min="1" max="30" value="10"></label><label>Tamanho máximo da célula<select id="videoSize"><option>128</option><option selected>256</option><option>512</option></select></label></div><label class="check"><input id="videoKey" type="checkbox"> Remover fundo de cor uniforme</label><div class="pair"><label>Cor do fundo<input id="videoColor" type="color" value="#00ff00"></label><label>Tolerância<input id="videoTolerance" type="number" min="0" max="255" value="40"></label></div><p class="small">MP4 normalmente não tem transparência. A remoção de cor funciona com fundo uniforme; cenários e movimentos de câmera continuam nos quadros.</p><button id="videoExtract" disabled>Extrair quadros e montar folha</button><button id="videoCancel" hidden>Cancelar extração</button><progress id="videoProgress" max="1" value="0" aria-label="Extração de quadros"></progress><p id="videoStatus" role="status"></p></details>';
 const $=id=>root.querySelector('#'+id);let opened,controller,epoch=0,working=false;
 const status=text=>$('videoStatus').textContent=text;
 const inputs=[...root.querySelectorAll('input,select')];
 function close(){opened?.dispose();opened=null;}
 function estimate(){if(!opened)return;try{const p=videoPlan({duration:opened.video.duration,start:Number($('videoStart').value),end:Number($('videoEnd').value),fps:Number($('videoFps').value),cellSize:Number($('videoSize').value)});status(p.count+' quadros · células '+p.frameWidth+' × '+p.frameHeight+' px · extração local.');$('videoExtract').disabled=false;}catch(e){status(e.message);$('videoExtract').disabled=true;}}
 $('videoFile').onchange=async()=>{const ticket=++epoch;controller?.abort();close();$('videoExtract').disabled=true;const file=$('videoFile').files[0];if(!file)return;controller=new AbortController();status('Abrindo vídeo…');try{const next=await openVideo(file,controller.signal);if(ticket!==epoch){next.dispose();return;}opened=next;$('videoStart').value=0;$('videoEnd').value=String(next.video.duration);estimate();}catch(e){if(ticket===epoch)status(e.message);}};
 for(const id of ['videoStart','videoEnd','videoFps','videoSize'])$(id).onchange=estimate;
 $('videoCancel').onclick=()=>controller?.abort();
 $('videoExtract').onclick=async()=>{
  if(!opened||working)return;working=true;controller=new AbortController();inputs.forEach(i=>i.disabled=true);$('videoExtract').disabled=true;$('videoCancel').hidden=false;
  try{
   const result=await extractVideo(opened.video,{start:Number($('videoStart').value),end:Number($('videoEnd').value),fps:Number($('videoFps').value),cellSize:Number($('videoSize').value),keyColor:$('videoKey').checked?$('videoColor').value:null,tolerance:Number($('videoTolerance').value)},{signal:controller.signal,onProgress:(n,total)=>{$('videoProgress').max=total;$('videoProgress').value=n;status('Extraindo '+n+' de '+total+' quadros…');}});
   await onExtract(result.canvas,result.plan);status(result.plan.count+' quadros extraídos. A folha está pronta para revisar e salvar no Studio.');
  }catch(e){status(e.message||'Não foi possível extrair o vídeo.');}finally{working=false;inputs.forEach(i=>i.disabled=false);$('videoCancel').hidden=true;$('videoExtract').disabled=!opened;}
 };
 window.addEventListener('pagehide',()=>{controller?.abort();close();},{once:true});
 return{get working(){return working;}};
}
