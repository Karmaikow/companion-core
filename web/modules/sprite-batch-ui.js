import {ACTIONS,DIRECTIONS} from './sprite-atlas.js';
import {batchPlan,runBatch,projectFromBatch} from './sprite-batch.js';
import {checkpoint} from './sprite-batch-store.js';
import {decodeArtImage} from './art-image.js';
import {studioCloudRequest} from './cloud-vault.js';
import {createCloudLibrary} from './asset-studio-store.js';
const labels={idle:'Respirar / parada',walk:'Andar',fly:'Voar',attack:'Atacar',hurt:'Receber golpe',faint:'Desmaiar',pet:'Carinho',sleep:'Dormir',happy:'Alegria',defend:'Defender'};
const dataURL=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Falha ao ler referência.'));r.readAsDataURL(blob);});
const toPNG=canvas=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Falha ao montar PNG.')),'image/png'));
async function referencePNG(file){
 if(!file||file.size>16000000||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Use PNG, JPEG ou WebP de até 16 MB.');
 const image=await decodeArtImage(file);if(image.naturalWidth*image.naturalHeight>16777216)throw Error('Referência muito grande.');
 const c=document.createElement('canvas');let scale=Math.min(1,512/image.naturalWidth,512/image.naturalHeight);
 for(let i=0;i<8;i++){c.width=Math.max(1,Math.round(image.naturalWidth*scale));c.height=Math.max(1,Math.round(image.naturalHeight*scale));c.getContext('2d').drawImage(image,0,0,c.width,c.height);const blob=await toPNG(c);if(blob.size<=850000)return blob;scale*=.75;}
 throw Error('Reduza o tamanho da referência.');
}
export async function assembleBatch(batch){
 const ready=batch.jobs.filter(j=>j.status==='ready');if(!ready.length)throw Error('Nenhuma sequência pronta.');
 const project=projectFromBatch(batch,ready),canvas=document.createElement('canvas');canvas.width=project.columns*batch.cell;canvas.height=project.rows*batch.cell;const ctx=canvas.getContext('2d');
 const cells=[];let globalScale=Infinity;
 for(const job of ready){
  const image=await decodeArtImage(job.blob);if(image.naturalWidth%batch.frames)throw Error('A largura da sequência não é divisível pelos quadros.');
  const sw=image.naturalWidth/batch.frames,sh=image.naturalHeight,source=document.createElement('canvas');source.width=image.naturalWidth;source.height=sh;const c=source.getContext('2d',{willReadFrequently:true});c.drawImage(image,0,0);
  for(let i=0;i<batch.frames;i++){
   const pixels=c.getImageData(i*sw,0,sw,sh).data;let minX=sw,minY=sh,maxX=-1,maxY=-1,transparent=0;
   for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){const alpha=pixels[(y*sw+x)*4+3];if(alpha<24)transparent++;if(alpha>24){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}
   if(maxX<0||transparent<sw*sh*.01)throw Error(job.action+'/'+job.direction+': quadro vazio ou sem transparência real. Importe/corrija a sequência antes de montar.');
   const w=maxX-minX+1,h=maxY-minY+1;globalScale=Math.min(globalScale,batch.cell*.88/w,batch.cell*.88/h);cells.push({x:i*sw+minX,y:minY,w,h});
  }
  source.width=source.height=1;
 }
 let index=0;
 for(const job of ready){const image=await decodeArtImage(job.blob);for(let f=0;f<batch.frames;f++){const i=index++,c=cells[i],w=c.w*globalScale,h=c.h*globalScale;ctx.drawImage(image,c.x,c.y,c.w,c.h,(i%8)*batch.cell+(batch.cell-w)/2,Math.floor(i/8)*batch.cell+batch.cell*.95-h,w,h);}}
 return {blob:await toPNG(canvas),atlas:project};
}
export async function mountSpriteBatch(root,{id,generation,cloud,onAssemble}){
 const key=id+':'+generation+':'+(cloud?'cloud':'local');let batch,running=false,pause=false;
 root.innerHTML='<h2>05 / Geração automática</h2><p>Uma referência → sequências próprias de cada ação e direção → atlas para revisão.</p><label>Imagem do personagem<input data-field="reference" type="file" accept="image/png,image/jpeg,image/webp"></label><fieldset><legend>Ações</legend><div data-field="actions"></div></fieldset><fieldset><legend>Direções</legend><div data-field="directions"></div></fieldset><label>Quadros por sequência<input data-field="frames" type="number" min="2" max="8" value="4"></label><label>Quadro final<select data-field="cell"><option value="128">128 × 128</option><option value="256">256 × 256</option></select></label><button data-field="plan">Preparar lote sem cobrar</button><p data-field="summary" role="status"></p><label class="check"><input data-field="consent" type="checkbox"> Autorizo as chamadas pagas restantes deste lote na API de imagens configurada (não usa créditos Tripo).</label><button data-field="run">Gerar / retomar restantes</button><button data-field="pause">Pausar após chamada atual</button><button data-field="assemble">Montar atlas para revisão</button><details><summary>Progresso por sequência</summary><pre data-field="jobs" style="white-space:pre-wrap"></pre></details><p class="small">Mantenha esta página aberta. Resultados ficam neste navegador e não são aplicados ao mundo automaticamente. Uma falha ou interrupção não é repetida: confira o pedido no provedor ou na biblioteca. Retomar processa apenas os pedidos ainda não enviados. A montagem não certifica anatomia nem direção; revise a cobertura antes de aplicar.</p>';
 const $=name=>root.querySelector('[data-field="'+name+'"]');
 for(const [field,values]of [['actions',ACTIONS],['directions',DIRECTIONS]])for(const value of values){const label=document.createElement('label');label.className='check';const box=document.createElement('input');box.type='checkbox';box.value=value;box.checked=field==='directions'||['idle','walk','attack','sleep','happy','defend'].includes(value);label.append(box,document.createTextNode(labels[value]||value));$(field).append(label);}
 const note=text=>{$('summary').textContent=text;};
 function render(){
  const jobs=batch?.jobs||[],ready=jobs.filter(j=>j.status==='ready').length,pending=jobs.filter(j=>j.status==='pending').length,uncertain=jobs.filter(j=>['inflight','uncertain'].includes(j.status)).length;
  $('jobs').textContent=jobs.map(j=>j.action+' / '+j.direction+' · '+j.status+(j.requestId?' · '+j.requestId:'')+(j.error?' · '+j.error:'')).join('\n');
  for(const el of root.querySelectorAll('input,select'))el.disabled=running;
  $('plan').disabled=running;$('run').disabled=running||!pending;$('pause').disabled=!running;$('assemble').disabled=running||!ready;
  if(batch)note(jobs.length+' chamadas planejadas · '+ready+' prontas · '+pending+' não enviadas · '+uncertain+' sem confirmação. '+batch.total+' quadros previstos. Custo por imagem conforme modelo da API; nenhuma chamada ao preparar.');
 }
 try{batch=await checkpoint(key);if(batch){for(const j of batch.jobs)if(j.status==='inflight')j.status='uncertain';await checkpoint(key,batch);}}catch(e){note('Não foi possível abrir os checkpoints: '+e.message);}
 render();
 $('plan').onclick=async()=>{
  try{if(batch&&!confirm('Criar um novo lote? O checkpoint anterior neste navegador será substituído. Exporte/guarde o atlas anterior antes de continuar.'))return;
   const actions=[...$('actions').querySelectorAll('input:checked')].map(x=>x.value),dirs=[...$('directions').querySelectorAll('input:checked')].map(x=>x.value),next=batchPlan(actions,dirs,Number($('frames').value),Number($('cell').value));
   next.reference=await referencePNG($('reference').files[0]);next.createdAt=Date.now();await checkpoint(key,next);batch=next;$('consent').checked=false;render();
  }catch(e){note(e.message);}
 };
 $('pause').onclick=()=>{pause=true;note('Pausa solicitada. A chamada atual será concluída e salva; nenhuma nova será iniciada.');};
 $('run').onclick=async()=>{
  if(running)return;if(!$('consent').checked){note('Confirme o custo das chamadas restantes antes de iniciar.');return;}
  if(!navigator.locks){note('Este navegador não oferece o bloqueio necessário para evitar lotes simultâneos. Use Chrome/Edge em HTTPS ou localhost.');return;}
  try{await navigator.locks.request('companion-sprite-batch:'+key,{ifAvailable:true},async lock=>{
   if(!lock)throw Error('Este lote está aberto para geração em outra aba.');
   batch=await checkpoint(key);if(!batch)throw Error('Prepare um lote primeiro.');
   // An interrupted request is never automatically resubmitted.
   for(const j of batch.jobs)if(j.status==='inflight')j.status='uncertain';
   const localReference=await dataURL(batch.reference),library=createCloudLibrary();
   if(cloud){const response=await studioCloudRequest('/api/studio');const info=await response.json();if(!response.ok||!info.configured)throw Error(info.error||'Configure a API de imagens no servidor e entre com uma conta autorizada.');}
   running=true;pause=false;render();
   await runBatch(batch,{save:b=>checkpoint(key,b),paused:()=>pause,progress:render,generate:async job=>{
    const body=cloud?{sprite:true,brief:{name:'Sprite '+job.action+' '+job.direction,kind:'prop',prompt:job.prompt,palette:''},references:[{name:'character.png',image:localReference}],paidConsent:true,requestId:job.requestId}:{id,generation,prompt:job.prompt,reference:localReference,paidConsent:true};
    const init={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(195000)};
    const response=await(cloud?studioCloudRequest('/api/studio',init):fetch('/api/companion/art/sprite',init));
    if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Geração indisponível neste ambiente.');
    const result=await response.json();if(!response.ok)throw Error(result.error||'Pedido sem confirmação.');
    let blob;if(cloud){job.assetId=result.asset?.id;blob=await library.file(result.asset);}else{if(typeof result.image!=='string'||!result.image.startsWith('data:image/png;base64,'))throw Error('PNG não retornado.');blob=await fetch(result.image).then(r=>r.blob());}
    if(!(blob instanceof Blob)||blob.size>4000000)throw Error('Resultado ausente ou maior que 4 MB.');await decodeArtImage(blob);return blob;
   }});
  });}catch(e){note(e.message+' Nenhum pedido com falha será repetido automaticamente.');}
  finally{const message=$('summary').textContent;running=false;$('consent').checked=false;render();if(message.includes('Nenhum pedido'))note(message);}
 };
 $('assemble').onclick=async()=>{try{if(running)return;running=true;render();const result=await assembleBatch(batch);await onAssemble(result.blob,result.atlas);note('Atlas montado no editor. Revise, guarde na biblioteca e selecione-o no mundo.');}catch(e){note(e.message);}finally{const message=$('summary').textContent;running=false;render();note(message);}};
 return {refresh:render};
}
