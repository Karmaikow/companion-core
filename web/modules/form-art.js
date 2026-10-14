import { mode } from './runtime-mode.js';
import { MAX_IMPORT_BYTES, decodeArtImage, normalizeArtImage } from './art-image.js';

export function initFormArt(applyState) {
  const el=id=>document.getElementById(id);
  let context=null,pending=null,image=null,originalImage=null,busy=false,epoch=0,raf=0;
  const status=text=>{el('artStatus').textContent=text;};
  async function api(suffix='',body) {
    const response=await fetch('/api/companion/art'+suffix,{method:body?'POST':'GET',cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(195_000)});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível abrir a arte.');return data;
  }
  function clearPreview(){pending=null;image=null;originalImage=null;el('artPreview').hidden=true;el('artPendingDownload').hidden=true;el('artPendingDownload').removeAttribute('href');el('artApply').disabled=true;cancelAnimationFrame(raf);}
  function invalidate(){epoch++;context=null;clearPreview();el('artEditor').hidden=true;el('artKey').value='';}
  async function action(work) {
    if(busy)return;
    busy=true;for(const id of ['artOpen','artGenerate','artApply','artSaveKey','artFile','artFrames','artFps'])el(id).disabled=true;
    try{await work();}catch(e){status(e.message||'Não foi possível concluir.');}
    finally{busy=false;for(const id of ['artOpen','artGenerate','artSaveKey','artFile','artFrames','artFps'])el(id).disabled=false;el('artApply').disabled=!pending;}
  }
  function renderPreview(time) {
    if(!image || !pending)return;
    const c=el('artPreview').getContext('2d'),size=360;
    c.clearRect(0,0,size,size);
    const frames=Math.max(1,Math.min(8,Number(el('artFrames').value)||1));
    const fps=Math.max(1,Math.min(12,Number(el('artFps').value)||6));
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sw=image.naturalWidth/frames,sh=image.naturalHeight,s=Math.min(324/sw,324/sh);
    const frame=reduced?0:Math.floor(time*fps/1000)%frames;
    c.save();c.translate(180,180+(reduced?0:Math.sin(time*.0018)*3));c.scale(1,reduced?1:1+Math.sin(time*.002)*.012);c.drawImage(image,frame*sw,0,sw,sh,-sw*s/2,-sh*s/2,sw*s,sh*s);c.restore();
    raf=requestAnimationFrame(renderPreview);
  }
  function dimensionsNotice(art) {
    return art.width!==art.originalWidth||art.height!==art.originalHeight?` Dimensões ajustadas automaticamente: ${art.originalWidth} × ${art.originalHeight} → ${art.width} × ${art.height}.`:'';
  }
  async function preview(input,stamp,source='import') {
    const original=await decodeArtImage(input);
    const prepared=await normalizeArtImage(original,Number(el('artFrames').value));
    const loaded=await decodeArtImage(prepared.dataUrl);
    if(stamp!==epoch)throw Error('A Companion mudou. Prepare a arte novamente.');
    clearPreview();originalImage=original;image=loaded;pending={...context,image:prepared.dataUrl,source};el('artPreview').hidden=false;el('artPendingDownload').href=prepared.dataUrl;el('artPendingDownload').hidden=false;el('artApply').disabled=false;raf=requestAnimationFrame(renderPreview);
    status('Prévia pronta. Confira o recorte e os movimentos antes de aplicar.'+dimensionsNotice(prepared));
  }
  function linkFor(art,text) {
    const link=document.createElement('a');link.textContent=text;link.href=`/api/companion/art/${context.id}/${art.id}`;link.download=`forma-${art.generation||'previa'}.png`;return link;
  }
  async function open() {
    if(mode!=='local'){status('Abra o Core local para gerar ou importar a arte.');return;}
    const stamp=++epoch;clearPreview();status('Preparando o pedido…');
    const next=await api();if(stamp!==epoch)return;context=next;
    el('artPrompt').value=context.prompt;el('artEditor').hidden=false;
    el('artCycle').textContent=context.generation?`Forma ${context.generation} · a imagem anterior é preservada até você aplicar outra.`:'Estudo visual: a arte só aparece como corpo após cumprir as missões. Use a prévia 2D para experimentar.';
    const download=el('artDownload');download.hidden=!context.artwork;
    if(context.artwork)download.href=`/api/companion/art/${context.id}/${context.artwork.id}`;
    const stateResponse=await fetch('/api/companion/state',{cache:'no-store'});if(!stateResponse.ok)throw Error('Não foi possível carregar o histórico.');const state=await stateResponse.json();if(stamp!==epoch)return;
    el('artHistory').replaceChildren();
    for(const art of [...(state.artworkHistory||[])].reverse())el('artHistory').append(linkFor(art,`Forma ${art.generation||'prévia'} · ${new Date(art.createdAt).toLocaleDateString('pt-BR')} ↓`));
    if(!state.artworkHistory?.length)el('artHistory').textContent='Suas imagens anteriores aparecerão aqui.';
    status(context.provider.configured?'API de imagens configurada. Você também pode importar um PNG.':'Pronto para copiar o pedido e importar o PNG. A geração direta é opcional.');
  }
  el('artOpen').onclick=()=>action(open);
  el('artCopy').onclick=async()=>{try{await navigator.clipboard.writeText(el('artPrompt').value);status('Pedido copiado. Anexe a imagem atual no ChatGPT para preservar a identidade.');}catch{el('artPrompt').focus();el('artPrompt').select();status('Selecione e copie o pedido acima.');}};
  el('artFile').onchange=()=>action(async()=>{
    const file=el('artFile').files?.[0];if(!file||!context)return;const stamp=epoch;
    clearPreview();
    try {
      if(file.size>MAX_IMPORT_BYTES)throw Error('Escolha uma imagem de até 32 MB. O Core reduz as dimensões automaticamente.');
      if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Escolha uma imagem PNG, JPEG ou WebP.');
      status('Preparando a imagem e ajustando as dimensões…');
      await preview(file,stamp);
    } finally {el('artFile').value='';}
  });
  el('artSaveKey').onclick=()=>action(async()=>{await api('/settings',{key:el('artKey').value});el('artKey').value='';status('Configuração de imagens salva neste dispositivo.');});
  el('artGenerate').onclick=()=>action(async()=>{
    if(!context)throw Error('Prepare a arte primeiro.');
    if(!el('artPaid').checked)throw Error('Marque a confirmação de créditos para gerar, ou importe seu PNG.');
    const stamp=epoch;status('Gerando a imagem… Pode levar alguns minutos.');
    const data=await api('/generate',{id:context.id,generation:context.generation,paidConsent:true});
    el('artFrames').value='1';el('artFps').value='6';await preview(data.image,stamp,'openai');el('artPaid').checked=false;
  });
  el('artApply').onclick=()=>action(async()=>{
    if(!pending)return;const stamp=epoch;
    const frames=Number(el('artFrames').value),fps=Number(el('artFps').value);
    if(!Number.isInteger(frames)||frames<1||frames>8)throw Error('Use de 1 a 8 quadros na faixa horizontal.');
    if(!Number.isInteger(fps)||fps<1||fps>12)throw Error('Use de 1 a 12 quadros por segundo.');
    const selected=pending,original=originalImage;
    status('Preparando a arte para salvar…');
    const prepared=await normalizeArtImage(original,frames);
    if(stamp!==epoch)throw Error('A Companion mudou. Prepare a arte novamente.');
    const state=await api('/apply',{id:selected.id,generation:selected.generation,image:prepared.dataUrl,source:selected.source,frames,fps});
    if(stamp!==epoch)return;applyState(state);clearPreview();await open();status('Arte aplicada e guardada. Os níveis e as memórias continuam os mesmos.'+dimensionsNotice(prepared));
  });
  window.addEventListener('companion:state',event=>{if(context&&(event.detail.id!==context.id||event.detail.generation!==context.generation)){invalidate();status('A forma mudou. Prepare o próximo pedido de arte.');}});
  window.addEventListener('mayuna:unauthorized',invalidate);
  new MutationObserver(()=>{if(document.body.classList.contains('is-locked'))invalidate();}).observe(document.body,{attributes:true,attributeFilter:['class']});
  window.addEventListener('pagehide',()=>cancelAnimationFrame(raf));
}
