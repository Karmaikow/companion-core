import { mode, cloudConfig } from './runtime-mode.js';
import { studioCloudRequest } from './cloud-vault.js';
import { decodeArtImage } from './art-image.js';
import { assetPrompt, validateBrief } from './asset-direction.js';
import { localLibrary, createCloudLibrary } from './asset-studio-store.js';

const $ = id => document.getElementById(id), cloud = Boolean(cloudConfig?.url);
const accountLibrary = createCloudLibrary();
let library = localLibrary, canWrite = true, busy = false, configured = false;
let refs = [], candidates = [], selected = null, drawing = null, rows = [], scopeEpoch = 0;
let refUrls = [], candidateUrls = [], libraryUrls = [], observer;
const canvas = $('preview'), ctx = canvas.getContext('2d');
const feedback = (text, error = false) => { $('feedback').textContent = text; $('feedback').classList.toggle('error', error); };
const brief = () => validateBrief({ name:$('assetName').value, kind:$('kind').value, prompt:$('description').value, palette:$('palette').value });
function updatePrompt() { try { $('compiledPrompt').value = assetPrompt(brief()); } catch { $('compiledPrompt').value = 'Preencha o nome e a descrição para preparar o pedido.'; } }
function buttons() {
  $('generate').disabled = busy || !configured || !canWrite || (cloud && $('storage').value !== 'cloud');
  $('save').disabled = busy || !canWrite;
  $('download').disabled = busy || !selected;
  for(const id of ['assetFile','libraryFile','exportLibrary','newDraft','refresh','storage','referenceFiles']) $(id).disabled = busy;
  for(const node of $('briefForm').querySelectorAll('input,select,textarea,button')) node.disabled = busy;
  $('generate').disabled = busy || !configured || !canWrite || (cloud && $('storage').value !== 'cloud');
}
async function work(fn) {
  if(busy) return;
  busy = true; buttons();
  try { await fn(); } catch(error) { feedback(error.message || 'Não foi possível concluir.', true); }
  finally { busy = false; buttons(); }
}
function toDataURL(blob) { return new Promise((resolve,reject) => { const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Falha ao ler a imagem.'));r.readAsDataURL(blob); }); }
function pngBlob(value) {
  if(typeof value!=='string'||value.length>5_400_000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw Error('PNG da biblioteca inválido.');
  const bytes=Uint8Array.from(atob(value.slice(22)),c=>c.charCodeAt(0));
  return new Blob([bytes],{type:'image/png'});
}
async function prepare(input, maxSide=2048, maxBytes=4_000_000) {
  if (!(input instanceof Blob) || input.size>16_000_000 || !['image/png','image/jpeg','image/webp'].includes(input.type)) throw Error('Escolha PNG, JPEG ou WebP de até 16 MB.');
  const image=await decodeArtImage(input);
  if(image.naturalWidth*image.naturalHeight>40_000_000) throw Error('Use uma imagem com até 40 milhões de pixels.');
  let scale=Math.min(1,maxSide/image.naturalWidth,maxSide/image.naturalHeight),blob;
  const c=document.createElement('canvas');
  try {
    for(let i=0;i<12;i++) {
      c.width=Math.max(1,Math.floor(image.naturalWidth*scale));c.height=Math.max(1,Math.floor(image.naturalHeight*scale));
      c.getContext('2d').drawImage(image,0,0,c.width,c.height);
      blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
      if(blob && blob.size<=maxBytes) {
        const sample=document.createElement('canvas');sample.width=sample.height=128;
        const sc=sample.getContext('2d',{willReadFrequently:true});sc.drawImage(c,0,0,128,128);
        const pixels=sc.getImageData(0,0,128,128).data;
        let alpha=false;for(let n=3;n<pixels.length;n+=4)if(pixels[n]<250){alpha=true;break;}
        return {blob,width:c.width,height:c.height,alpha};
      }
      scale*=.75;
    }
    throw Error('A imagem não coube no limite. Reduza suas dimensões.');
  } finally {c.width=c.height=1;}
}
function renderRefs() {
  refUrls.forEach(URL.revokeObjectURL);refUrls=[];$('referenceList').replaceChildren();
  refs.forEach((r,i)=>{
    const wrap=document.createElement('div');wrap.className='ref';const img=new Image();img.src=URL.createObjectURL(r.blob);refUrls.push(img.src);img.alt=r.name;
    const name=document.createElement('small');name.textContent=r.name;
    const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Remover '+r.name);remove.disabled=busy;
    remove.onclick=()=>{if(!busy){refs.splice(i,1);renderRefs();}};wrap.append(img,remove,name);$('referenceList').append(wrap);
  });$('referenceCount').textContent=refs.length+' / 3';
}
async function select(candidate) {
  const image=await decodeArtImage(candidate.blob);selected=candidate;drawing=image;
  $('imageBadge').textContent=candidate.source==='openai'?'GERADA · RASCUNHO':'IMPORTADA';
  $('previewEmpty').hidden=true;
  $('imageInfo').textContent=`${candidate.width} × ${candidate.height} · PNG · ${candidate.alpha?'Transparência detectada.':'Imagem com fundo opaco; o Studio preserva o fundo original.'} Sombra de contato da prévia não é gravada no PNG.`;
  draw();renderOptions();buttons();
}
function renderOptions() {
  candidateUrls.forEach(URL.revokeObjectURL);candidateUrls=[];$('options').replaceChildren();
  if(!candidates.length){const p=document.createElement('p');p.className='fine-print';p.textContent='As opções geradas ou importadas aparecerão aqui.';$('options').append(p);}
  candidates.forEach((candidate,i)=>{const b=document.createElement('button');b.className='option';b.type='button';b.setAttribute('aria-pressed',String(selected===candidate));b.setAttribute('aria-label','Abrir opção '+(i+1));const img=new Image();img.src=URL.createObjectURL(candidate.blob);candidateUrls.push(img.src);img.alt='Opção '+(i+1);b.append(img,document.createTextNode(`Opção ${i+1}`));b.onclick=()=>void work(()=>select(candidate));$('options').append(b);});
}
function addCandidate(value){candidates.push(value);if(candidates.length>8)candidates.shift();return select(value);}
function draw() {
  const w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);
  if($('previewMode').value==='alpha'){
    for(let x=0;x<w;x+=24)for(let y=0;y<h;y+=24){ctx.fillStyle=((x+y)/24)%2?'#314137':'#24352c';ctx.fillRect(x,y,24,24);}
  }else{
    ctx.fillStyle='#839b64';ctx.fillRect(0,0,w,h);
    for(let i=0;i<260;i++){const x=(i*127)%w,y=(i*83)%h;ctx.fillStyle=['#93aa7044','#b5bd7e44','#5c804b44'][i%3];ctx.beginPath();ctx.ellipse(x,y,17+i%25,5+i%7,-.5,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#b6a17e';ctx.beginPath();ctx.moveTo(-20,450);ctx.bezierCurveTo(300,350,540,610,920,390);ctx.lineTo(920,545);ctx.bezierCurveTo(510,760,300,500,-20,620);ctx.closePath();ctx.fill();
    for(let i=0;i<15;i++){let x=i*69-30,y=510+Math.sin(i*.6)*51;ctx.fillStyle=i%2?'#d0bfa0':'#c2b18f';ctx.strokeStyle='#8f9272';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y,33,15,-.2,0,Math.PI*2);ctx.fill();ctx.stroke();}
    ctx.fillStyle='#598a83';ctx.beginPath();ctx.ellipse(820,100,205,105,-.2,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#a1c6b0';ctx.lineWidth=4;ctx.stroke();
    for(const [x,y,r] of [[60,160,42],[115,193,28],[775,610,43],[830,596,31]]){ctx.fillStyle='#5e7958';ctx.beginPath();ctx.ellipse(x+10,y+12,r,17,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#9ca88a';ctx.strokeStyle='#50655a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-r,y);ctx.lineTo(x-r*.6,y-r*.7);ctx.lineTo(x+r*.5,y-r*.9);ctx.lineTo(x+r,y-r*.2);ctx.lineTo(x+r*.5,y+13);ctx.lineTo(x-r*.6,y+15);ctx.closePath();ctx.fill();ctx.stroke();}
    const vignette=ctx.createRadialGradient(450,340,100,450,340,600);vignette.addColorStop(0,'#10291f00');vignette.addColorStop(1,'#10291f55');ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);
    if(drawing){ctx.fillStyle='#183d2c44';ctx.beginPath();ctx.ellipse(450,565,100,27,0,0,Math.PI*2);ctx.fill();}
  }
  if(drawing){const scale=Number($('previewScale').value)/100;const s=Math.min(650/drawing.naturalWidth,560/drawing.naturalHeight)*scale;const iw=drawing.naturalWidth*s,ih=drawing.naturalHeight*s;ctx.drawImage(drawing,450-iw/2,565-ih,iw,ih);}
}
async function generationStatus() {
  configured=false;
  if(cloud && $('storage').value!=='cloud'){$('generationStatus').textContent='Para gerar online, selecione a biblioteca da sua conta.';buttons();return;}
  try{
    const response=await (cloud?studioCloudRequest('/api/studio'):fetch('/api/studio',{cache:'no-store'}));
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error||'O serviço de geração não está disponível neste ambiente.');
    configured=data.configured===true;
    $('generationStatus').textContent=configured?`Provedor configurado · ${data.model}. Uma opção por pedido.`:'Geração indisponível: falta configurar a credencial de imagens no servidor. Você pode preparar o pedido, importar arte e usar a biblioteca.';
  }catch(error){$('generationStatus').textContent=error.message||'Geração indisponível. Importe uma arte para continuar.';}
  buttons();
}
async function refreshLibrary() {
  const epoch=scopeEpoch;const result=await library.list();if(epoch!==scopeEpoch)return;rows=result;renderLibrary();
}
function renderLibrary() {
  observer?.disconnect();libraryUrls.forEach(URL.revokeObjectURL);libraryUrls=[];$('library').replaceChildren();
  const q=$('search').value.toLocaleLowerCase('pt-BR'),found=rows.filter(r=>r.name?.toLocaleLowerCase('pt-BR').includes(q)).slice(0,24),currentLibrary=library,epoch=scopeEpoch;
  if(!found.length){const p=document.createElement('p');p.className='fine-print';p.textContent='Nenhum rascunho por aqui. Guarde um pedido com suas referências para começar.';$('library').append(p);return;}
  observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){observer.unobserve(e.target);const row=found.find(r=>r.id===e.target.dataset.id);if(!row||row.metadata?.generation?.state==='generating')continue;void currentLibrary.image(row).then(blob=>{if(!blob||epoch!==scopeEpoch)return;const img=new Image();img.src=URL.createObjectURL(blob);libraryUrls.push(img.src);img.alt=row.name;e.target.querySelector('.draft-mark')?.replaceWith(img);}).catch(()=>{});}}, {rootMargin:'120px'});
  for(const row of found){const b=document.createElement('button');b.type='button';b.className='asset-tile';b.dataset.id=row.id;const mark=document.createElement('div');mark.className='draft-mark';mark.textContent=row.metadata?.generation?.state==='generating'?'Gerando…':'◇ Briefing';const title=document.createElement('strong');title.textContent=row.name;const note=document.createElement('small');const state=row.metadata?.generation?.state;note.textContent=`${state==='failed'?'Pedido não confirmado':row.status==='published'?'Publicado · abrir como cópia':'Rascunho privado'} · ${new Date(row.created_at).toLocaleDateString('pt-BR')}`;b.append(mark,title,note);b.onclick=()=>void work(()=>openRow(row));$('library').append(b);observer.observe(b);}
  $('libraryNote').textContent=`${found.length} peças exibidas (até 24 por busca, entre as 100 mais recentes). Rascunhos privados; guardar não publica no jogo.`;
}
async function openRow(row) {
  const nextRefs=canWrite?await library.references(row):[],blob=await library.image(row);
  const b=row.metadata?.brief||{name:row.name,kind:'prop',prompt:row.prompt||'Objeto de fantasia ilustrado',palette:''};
  $('assetName').value=b.name;$('kind').value=b.kind;$('description').value=b.prompt;$('palette').value=b.palette;
  refs=nextRefs;renderRefs();updatePrompt();
  if(blob){const p=await prepare(blob);await addCandidate({...p,source:row.metadata?.source||'import',savedId:row.id});}else{selected=null;drawing=null;$('previewEmpty').hidden=false;$('imageBadge').textContent='BRIEFING';draw();}
  feedback('Rascunho aberto. Alterações serão guardadas como uma nova versão.');
}
async function changeScope() {
  scopeEpoch++;canWrite=false;buttons();library=$('storage').value==='cloud'?accountLibrary:localLibrary;
  try{const access=await library.access();canWrite=access.canWrite;$('accountStatus').textContent=access.label;await refreshLibrary();}catch(error){rows=[];renderLibrary();$('accountStatus').textContent=error.message;feedback(error.message,true);}
  await generationStatus();buttons();
}
$('briefForm').addEventListener('input',updatePrompt);
$('previewMode').onchange=draw;$('previewScale').oninput=draw;
$('referenceFiles').onchange=()=>void work(async()=>{const files=[...$('referenceFiles').files];try{if(refs.length+files.length>3)throw Error('Use no máximo três referências; remova uma antes de acrescentar outra.');const prepared=[];for(const f of files){const p=await prepare(f,768,900_000);prepared.push({name:f.name.slice(0,160),blob:p.blob});}refs.push(...prepared);renderRefs();feedback('Referências prontas. Elas só serão enviadas ao provedor quando você gerar uma opção.');}finally{$('referenceFiles').value='';}});
$('assetFile').onchange=()=>void work(async()=>{try{const f=$('assetFile').files[0];if(!f)return;const p=await prepare(f);await addCandidate({...p,source:'import'});feedback('Arte importada para revisão. Guarde um rascunho para persistir.');}finally{$('assetFile').value='';}});
$('briefForm').onsubmit=event=>{event.preventDefault();void work(async()=>{
  if(!configured||!canWrite)throw Error('A geração não está habilitada para este ambiente ou conta.');
  if(!$('paidConsent').checked)throw Error('Confirme o envio das referências e o uso da API paga.');
  const body={brief:brief(),references:await Promise.all(refs.map(async r=>({name:r.name,image:await toDataURL(r.blob)}))),paidConsent:true,requestId:crypto.randomUUID()};
  feedback('Gerando uma opção… O pedido pode levar alguns minutos. Não feche esta página.');
  try{
    const init={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(195_000)};
    const response=await (cloud?studioCloudRequest('/api/studio',init):fetch('/api/studio',init)),data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error||'A geração não foi confirmada. Confira a biblioteca e o provedor antes de repetir.');
    let blob;if(data.asset){blob=await accountLibrary.image(data.asset);if(!blob)throw Error('O rascunho foi criado, mas a imagem ainda não pôde ser baixada. Atualize a biblioteca.');}
    else if(typeof data.image==='string'&&data.image.startsWith('data:image/png;base64,'))blob=pngBlob(data.image);
    else throw Error('O serviço não retornou uma imagem. Nenhum resultado foi simulado.');
    const p=await prepare(blob);await addCandidate({...p,source:'openai',savedId:data.asset?.id});
    feedback(data.asset?'Opção gerada e guardada como rascunho privado na sua conta.':'Opção gerada. Revise e guarde na biblioteca.');
  }catch(error){if(cloud)await refreshLibrary().catch(()=>{});throw error;}
  finally{$('paidConsent').checked=false;if(cloud)await refreshLibrary().catch(()=>{});}
});};
$('save').onclick=()=>void work(async()=>{const b=brief();const row=await library.save({brief:b,prompt:assetPrompt(b),image:selected?.blob,alpha:selected?.alpha??null,references:refs,source:selected?.source||'brief'});feedback(`“${row.name}” guardado ${$('storage').value==='cloud'?'na sua conta':'neste navegador'}.`);await refreshLibrary();});
$('storage').onchange=()=>void work(changeScope);$('refresh').onclick=()=>void work(refreshLibrary);$('search').oninput=renderLibrary;
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
$('download').onclick=()=>{if(selected)download(selected.blob,'companion-asset.png');};
$('copyPrompt').onclick=()=>void work(async()=>{const text=assetPrompt(brief());try{await navigator.clipboard.writeText(text);feedback('Pedido copiado. Anexe suas referências no serviço escolhido.');}catch{$('compiledPrompt').focus();$('compiledPrompt').select();feedback('Selecione e copie o pedido completo.');}});
$('newDraft').onclick=()=>{if(busy)return;refs=[];candidates=[];selected=null;drawing=null;renderRefs();renderOptions();$('assetName').value='Novo elemento';$('description').value='';$('palette').value='Verde-musgo, azul-safira e rosa suave';$('previewEmpty').hidden=false;$('imageBadge').textContent='SEM ASSET';$('paidConsent').checked=false;updatePrompt();draw();buttons();feedback('Novo rascunho. As peças guardadas continuam na biblioteca.');};
$('exportLibrary').onclick=()=>void work(async()=>{
  if(rows.length>30)throw Error('A exportação aceita até 30 peças. Baixe as artes individuais para bibliotecas maiores.');
  const assets=[];let total=0;
  for(const row of rows){const image=await library.image(row),references=canWrite?await library.references(row):[];const item={brief:row.metadata?.brief||{name:row.name,kind:'prop',prompt:row.prompt||'Objeto de fantasia ilustrado',palette:''},image:image?await toDataURL(image):null,references:await Promise.all(references.map(async r=>({name:r.name,image:await toDataURL(r.blob)})))};total+=JSON.stringify(item).length;if(total>32_000_000)throw Error('A biblioteca ultrapassa 32 MB para exportação. Baixe os PNGs individuais.');assets.push(item);}
  download(new Blob([JSON.stringify({format:'companion-asset-library',version:1,assets})],{type:'application/json'}),'companion-assets.json');feedback('Biblioteca exportada com imagens e referências. Nenhuma sessão ou credencial é incluída.');
});
$('libraryFile').onchange=()=>void work(async()=>{
  let count=0;try{if(!canWrite)throw Error('Esta biblioteca é somente leitura.');const file=$('libraryFile').files[0];if(!file)return;if(file.size>32_000_000)throw Error('A biblioteca deve ter até 32 MB.');const data=JSON.parse(await file.text());if(data.format!=='companion-asset-library'||data.version!==1||!Array.isArray(data.assets)||data.assets.length>30)throw Error('Arquivo de biblioteca incompatível.');
    const prepared=[];
    for(const row of data.assets){const b=validateBrief(row.brief);if(!Array.isArray(row.references)||row.references.length>3)throw Error('Referências incompatíveis.');const decode=(value,side,bytes)=>prepare(pngBlob(value),side,bytes);const image=row.image?await decode(row.image,2048,4_000_000):null;const references=[];for(const r of row.references){const p=await decode(r.image,768,900_000);references.push({name:String(r.name||'Referência').slice(0,160),blob:p.blob});}prepared.push({brief:b,prompt:assetPrompt(b),image:image?.blob,alpha:image?.alpha??null,references,source:'import'});}
    for(const draft of prepared){await library.save(draft);count++;}await refreshLibrary();feedback(`${count} rascunhos importados. Nenhuma geração foi solicitada.`);
  }catch(error){await refreshLibrary().catch(()=>{});throw Error(`${error.message}${count?` ${count} rascunhos foram guardados antes da interrupção.`:''}`);}finally{$('libraryFile').value='';}
});
if(!cloud){$('storage').value='local';$('storage').querySelector('[value=cloud]').disabled=true;}
window.addEventListener('pagehide',()=>{observer?.disconnect();[...refUrls,...candidateUrls,...libraryUrls].forEach(URL.revokeObjectURL);});
updatePrompt();draw();await changeScope();
