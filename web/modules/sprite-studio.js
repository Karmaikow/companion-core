import {cloudConfig} from './runtime-mode.js';
import {localLibrary,createCloudLibrary} from './asset-studio-store.js';
import {accessPanel,preferredScope} from './studio-access.js';
import { ACTIONS,DIRECTIONS,validateAtlas,selectClip,frameRect,spritePrompt,coverage,godotSpriteFrames } from './sprite-atlas.js';
import { readSprite,saveSprite,spriteKey,readSpriteDraft,saveSpriteDraft } from './sprite-store.js';
import { decodeArtImage } from './art-image.js';
import { mountSheetImport } from './sprite-sheet-ui.js';
import {frameSelection} from './sprite-sheet-import.js';
import {ACTION_LABELS,DIRECTION_LABELS,frameCount,reviewedCount,nextDirection,withDirection,mergeProjects} from './sprite-project.js';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
const id=params.get('id')||'MC-MAYUNA-REFUGE-LAB',generation=Math.max(0,Number(params.get('generation'))||0),key=spriteKey(id,generation);
let batchUI,activeAction=ACTIONS.includes(params.get('action'))?params.get('action'):'walk',activeDirection='S',hasWork=false;
const editorDrafts=new Map();
const sheetUI=mountSheetImport(document.getElementById('megaSheetImport'),{onActionChange:a=>selectAction(a),onImport:async(png,project,sourceId)=>{if(busy)throw Error('Aguarde a operação atual do Studio.');const ok=await action(async()=>{await importSheet(png,project,sourceId);status('Ação importada. Confira cada direção na rosa dos ventos e salve para continuar.');});if(!ok)throw Error('A ação não foi importada. Confira a mensagem do Studio.');}});
let image,atlas,blob,reference,playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,manualFrame=0,playbackStart=performance.now(),epoch=0,busy=false,canSaveLibrary=true;
const status=text=>{$('status').textContent=text;const feedback=$('generationFeedback');if(feedback)feedback.textContent=text;};
for(const name of ['direction','previewDirection']){for(const dir of DIRECTIONS){const option=document.createElement('option');option.value=dir;option.textContent=dir;$(name).append(option);}$(name).value=activeDirection;}
for(const name of ['action','previewAction','direction','previewDirection'])$(name).closest('label').hidden=true;
$('targetName').textContent=`${id} · forma ${generation} · salvo somente neste navegador`;
$('refugeLink').href=id==='MC-MAYUNA-REFUGE-LAB'?'/refuge-lab.html':'/';
function controls(){atlas.pivot={x:Number($('pivotX').value)/100,y:Number($('pivotY').value)/100};atlas.mirror=$('mirror').checked;validateAtlas(atlas,image.naturalWidth,image.naturalHeight);}
async function action(work){if(busy)return false;busy=true;const buttons=[...document.querySelectorAll('button')].map(b=>[b,b.disabled]);buttons.forEach(([b])=>b.disabled=true);try{await work();return true;}catch(e){status(e.message||'Não foi possível concluir.');return false;}finally{busy=false;buttons.forEach(([b,disabled])=>b.disabled=disabled);$('saveLibrary').disabled=!canSaveLibrary;if(atlas)renderActionUI();batchUI?.refresh();}}
function sync(){
  $('columns').value=atlas.columns;$('rows').value=atlas.rows;$('pivotX').value=atlas.pivot.x*100;$('pivotY').value=atlas.pivot.y*100;$('mirror').checked=!!atlas.mirror;
  $('timeline').replaceChildren();
  for(let i=0;i<frameCount(atlas);i++){
    const button=document.createElement('button'),c=document.createElement('canvas');c.width=80;c.height=80;const r=frameRect(atlas,i);c.getContext('2d').drawImage(image,r.x,r.y,r.w,r.h,0,0,80,80);button.append(c,document.createTextNode(String(i)));button.setAttribute('aria-label',`Ver quadro ${i}`);button.onclick=()=>{playing=false;manualFrame=i;updatePlay();};$('timeline').append(button);
  }
  renderActionUI();fillSelection();
  $('scrub').max=frameCount(atlas)-1;manualFrame=0;playbackStart=performance.now();updatePlay();
}
async function load(nextBlob,nextAtlas){const ticket=++epoch;const decoded=await decodeArtImage(nextBlob);const valid=validateAtlas(nextAtlas,decoded.naturalWidth,decoded.naturalHeight);if(ticket!==epoch)return;image=decoded;blob=nextBlob;atlas=valid;sync();}
function rememberSelection(){if(atlas)editorDrafts.set(activeAction+':'+activeDirection,{frames:$('frames').value,fps:$('fps').value,loop:$('loopClip').checked});}
function fillSelection(){
 const c=atlas?.clips[activeAction]?.[activeDirection],pending=editorDrafts.get(activeAction+':'+activeDirection);
 $('action').value=$('previewAction').value=activeAction;$('direction').value=$('previewDirection').value=activeDirection;
 $('frames').value=pending?.frames??c?.frames.join(',')??'';$('fps').value=pending?.fps??c?.fps??10;$('loopClip').checked=pending?.loop??c?.loop??false;
 $('directionSaveStatus').textContent=atlas?.studio?.reviewed?.[activeAction]?.[activeDirection]?'Esta direção está salva no rascunho.':'Confira os quadros e salve esta direção.';
 playbackStart=performance.now();sheetUI.setAction(activeAction);
}
function selectAction(a,d=activeDirection,remember=true){
 if(!ACTIONS.includes(a)||!DIRECTIONS.includes(d))return;
 if(remember)rememberSelection();activeAction=a;activeDirection=d;fillSelection();renderActionUI();
}
function renderActionUI(){
 $('actionTabs').replaceChildren();
 for(const a of ACTIONS){const b=document.createElement('button');b.type='button';b.dataset.action=a;b.textContent=ACTION_LABELS[a]+' · '+reviewedCount(atlas,a)+'/8';b.setAttribute('aria-current',a===activeAction?'page':'false');b.disabled=busy;b.onclick=()=>selectAction(a,'S');$('actionTabs').append(b);}
 $('actionProgress').textContent=ACTION_LABELS[activeAction]+' · '+reviewedCount(atlas,activeAction)+' de 8 direções salvas neste navegador';
 $('actionHeading').textContent='02 / '+ACTION_LABELS[activeAction];
 const root=$('directionCompass');root.replaceChildren();
 const arrows={N:'↑',NE:'↗',E:'→',SE:'↘',S:'↓',SW:'↙',W:'←',NW:'↖'},short={N:'N',NE:'NE',E:'L',SE:'SE',S:'S',SW:'SO',W:'O',NW:'NO'};
 for(const d of DIRECTIONS){const b=document.createElement('button'),saved=Boolean(atlas?.studio?.reviewed?.[activeAction]?.[d]);b.type='button';b.dataset.direction=d;b.dataset.complete=String(saved);b.textContent=arrows[d]+' '+short[d]+(saved?' ✓':'');b.setAttribute('aria-label',DIRECTION_LABELS[d]+' · '+d+(saved?' · salva':''));b.setAttribute('aria-pressed',String(d===activeDirection));b.disabled=busy;b.onclick=()=>selectAction(activeAction,d);root.append(b);}
 const center=document.createElement('span');center.className='compass-center';center.textContent='VISTA';root.append(center);
 $('clips').replaceChildren();
 for(const [d,c]of Object.entries(atlas?.clips[activeAction]||{})){const b=document.createElement('button');b.type='button';b.textContent=DIRECTION_LABELS[d]+' · '+c.frames.length+' quadros';b.onclick=()=>selectAction(activeAction,d);$('clips').append(b);}
 renderCoverage();
}
async function persistDraft(next=atlas,editor={action:activeAction,direction:activeDirection}){
 await saveSpriteDraft(key,{blob,atlas:next,editor,updatedAt:Date.now()});
}
async function saveSelection(advance=false){
 if(!atlas)throw Error('Importe uma folha primeiro.');controls();
 const clip={frames:frameSelection($('frames').value,frameCount(atlas)),fps:Number($('fps').value),loop:$('loopClip').checked};
 const candidate=validateAtlas(withDirection(atlas,activeAction,activeDirection,clip),image.naturalWidth,image.naturalHeight),savedDirection=activeDirection,next=advance?nextDirection(candidate,activeAction,activeDirection):null;
 await persistDraft(candidate,{action:activeAction,direction:next||activeDirection});
 atlas=candidate;hasWork=true;editorDrafts.delete(activeAction+':'+savedDirection);if(next)activeDirection=next;sync();
 status(ACTION_LABELS[activeAction]+' / '+DIRECTION_LABELS[savedDirection]+' salva no rascunho.'+(advance?(next?' Próxima direção: '+DIRECTION_LABELS[next]+'.':' As oito direções estão concluídas. Escolha a próxima ação.'):''));
}
async function importSheet(png,project,sourceId){
 rememberSelection();const incoming=await decodeArtImage(png),merged=mergeProjects(hasWork?atlas:null,project,sourceId);let output=png;
 if(!merged.replace){
  if(merged.reuse)output=blob;
  else{
   const c=document.createElement('canvas');c.width=merged.atlas.columns*merged.atlas.frameWidth;c.height=merged.atlas.rows*merged.atlas.frameHeight;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);
   for(let i=0;i<frameCount(project);i++){const r=frameRect(project,i),index=merged.offset+i,x=index%merged.atlas.columns*merged.atlas.frameWidth,y=Math.floor(index/merged.atlas.columns)*merged.atlas.frameHeight,scale=Math.min(merged.atlas.frameWidth/r.w,merged.atlas.frameHeight/r.h),w=r.w*scale,h=r.h*scale;ctx.clearRect(x,y,merged.atlas.frameWidth,merged.atlas.frameHeight);ctx.drawImage(incoming,r.x,r.y,r.w,r.h,x+(merged.atlas.frameWidth-w)/2,y+(merged.atlas.frameHeight-h)/2,w,h);}
   output=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(!output)throw Error('Não foi possível reunir as ações na folha.');
  }
 }
 const a=Object.keys(project.clips)[0],d=Object.keys(project.clips[a])[0];
 await saveSpriteDraft(key,{blob:output,atlas:merged.atlas,editor:{action:a,direction:d},updatedAt:Date.now()});
 for(const [act,dirs]of Object.entries(project.clips))for(const dir of Object.keys(dirs))editorDrafts.delete(act+':'+dir);
 hasWork=true;activeAction=a;activeDirection=d;await load(output,merged.atlas);
}
async function mayuna(){const [p,j]=await Promise.all([fetch('/assets/refuge/mayuna-walk.png'),fetch('/assets/refuge/mayuna-walk.json')]);if(!p.ok||!j.ok)throw Error('A animação da Mayuna não está disponível.');await load(await p.blob(),await j.json());status('Primeiro ciclo da Mayuna carregado. As outras direções ainda precisam de desenhos próprios.');}
function newAtlas(w,h,columns,rows){return {version:1,image:'atlas.png',frameWidth:w/columns,frameHeight:h/rows,columns,rows,pivot:{x:.5,y:.95},mirror:false,clips:{[activeAction]:{[activeDirection]:{frames:[0],fps:10,loop:false}}}};}
async function gridImport(input,columns,rows){
  if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<1||rows<1||columns*rows>512)throw Error('Use uma grade de até 512 quadros.');
  const src=await decodeArtImage(input);if(src.naturalWidth*src.naturalHeight>16777216)throw Error('Use uma imagem de até 16 milhões de pixels.');
  if(src.naturalWidth%columns||src.naturalHeight%rows)throw Error('As dimensões devem ser divisíveis pela grade, sem cortar ou deformar quadros.');
  const cellW=Math.max(1,Math.floor(src.naturalWidth/columns)),cellH=Math.max(1,Math.floor(src.naturalHeight/rows));
  const canvas=document.createElement('canvas');canvas.width=cellW*columns;canvas.height=cellH*rows;canvas.getContext('2d').drawImage(src,0,0,canvas.width,canvas.height);
  const b=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!b)throw Error('Não foi possível preparar o PNG.');
  editorDrafts.clear();await load(b,newAtlas(canvas.width,canvas.height,columns,rows));hasWork=true;await persistDraft();status('Grade importada. Configure e salve cada direção.');
}
async function appendInput(input,columns,rows){
  if(!atlas||!image)return gridImport(input,columns,rows);
  if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<1||rows<1)throw Error('Grade inválida.');
  controls();const src=await decodeArtImage(input),first=frameCount(atlas),count=columns*rows,total=first+count,outColumns=atlas.columns,outRows=Math.ceil(total/outColumns);
  if(total>512||outColumns*outRows*atlas.frameWidth*atlas.frameHeight>16777216||src.naturalWidth*src.naturalHeight>16777216)throw Error('A folha combinada excede o limite. Use quadros menores.');
  const out=document.createElement('canvas');out.width=outColumns*atlas.frameWidth;out.height=outRows*atlas.frameHeight;const ctx=out.getContext('2d');ctx.drawImage(image,0,0);
  const sw=src.naturalWidth/columns,sh=src.naturalHeight/rows,scale=Math.min(atlas.frameWidth/sw,atlas.frameHeight/sh);
  for(let i=0;i<count;i++){const index=first+i,x=(index%outColumns)*atlas.frameWidth,y=Math.floor(index/outColumns)*atlas.frameHeight;ctx.drawImage(src,(i%columns)*sw,Math.floor(i/columns)*sh,sw,sh,x+(atlas.frameWidth-sw*scale)/2,y+(atlas.frameHeight-sh*scale)/2,sw*scale,sh*scale);}
  const next={...atlas,rows:outRows,frameCount:total},png=await new Promise(resolve=>out.toBlob(resolve,'image/png'));if(!png)throw Error('Não foi possível reunir os quadros.');await load(png,next);hasWork=true;$('frames').value=Array.from({length:count},(_,i)=>first+i).join(',');status(`Quadros ${first} a ${first+count-1} acrescentados. Escolha ação/direção e salve a sequência.`);
}
$('sourceFile').onchange=()=>action(async()=>{const file=$('sourceFile').files[0];if(!file)return;if(file.size>32000000)throw Error('Use uma imagem de até 32 MB.');await ($('appendMode').checked?appendInput:gridImport)(file,Number($('columns').value),Number($('rows').value));});
$('regrid').onclick=()=>action(async()=>{if(!blob)throw Error('Importe uma imagem.');await gridImport(blob,Number($('columns').value),Number($('rows').value));});
$('jsonFile').onchange=()=>action(async()=>{if(!image)throw Error('Importe o PNG correspondente primeiro.');const file=$('jsonFile').files[0];if(!file)return;if(file.size>100000)throw Error('JSON muito grande.');const next=validateAtlas(JSON.parse(await file.text()),image.naturalWidth,image.naturalHeight);await persistDraft(next);atlas=next;hasWork=true;editorDrafts.clear();sync();status('Projeto importado e salvo no rascunho.');});
$('loadMayuna').onclick=()=>action(mayuna);
function updatePlay(){$('play').textContent=playing?'Pausar':'Reproduzir';$('play').setAttribute('aria-pressed',String(playing));}
$('play').onclick=()=>{playing=!playing;playbackStart=performance.now();updatePlay();};$('scrub').oninput=()=>{playing=false;manualFrame=Number($('scrub').value);updatePlay();};
$('saveClip').onclick=()=>action(()=>saveSelection());
$('saveAndNext').onclick=()=>action(()=>saveSelection(true));
$('nextAction').onclick=()=>selectAction(ACTIONS[(ACTIONS.indexOf(activeAction)+1)%ACTIONS.length],'S');
for(const name of ['pivotX','pivotY','mirror'])$(name).onchange=()=>{try{if(atlas)controls();}catch(e){status(e.message);}};
$('align').onclick=()=>action(async()=>{
  if(!image)throw Error('Importe uma imagem.');
  const source=document.createElement('canvas');source.width=image.naturalWidth;source.height=image.naturalHeight;const ctx=source.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const bounds=[];
  for(let i=0;i<frameCount(atlas);i++){
    const r=frameRect(atlas,i),pixels=ctx.getImageData(r.x,r.y,r.w,r.h).data;let minX=r.w,minY=r.h,maxX=-1,maxY=-1;
    for(let y=0;y<r.h;y++)for(let x=0;x<r.w;x++)if(pixels[(y*r.w+x)*4+3]>24){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
    if(maxX<0)throw Error(`O quadro ${i} está vazio.`);bounds.push({r,minX,minY,w:maxX-minX+1,h:maxY-minY+1});
  }
  // One global scale preserves relative character size across the animation.
  const scale=Math.min(...bounds.map(b=>Math.min(atlas.frameWidth*.90/b.w,atlas.frameHeight*.90/b.h)));
  const out=document.createElement('canvas');out.width=source.width;out.height=source.height;const c=out.getContext('2d');
  for(const b of bounds)c.drawImage(source,b.r.x+b.minX,b.r.y+b.minY,b.w,b.h,b.r.x+(b.r.w-b.w*scale)/2,b.r.y+b.r.h*.95-b.h*scale,b.w*scale,b.h*scale);
  const png=await new Promise(resolve=>out.toBlob(resolve,'image/png'));if(!png)throw Error('Falha ao alinhar.');const next={...atlas,pivot:{x:.5,y:.95}};await load(png,next);status('Bases alinhadas. Revise as patas e ajuste o ponto de apoio, se necessário.');
});
function download(data,name){const url=URL.createObjectURL(data),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
$('exportPng').onclick=()=>action(async()=>{controls();download(blob,'atlas.png');});
$('exportJson').onclick=()=>action(async()=>{controls();download(new Blob([JSON.stringify({...atlas,image:'atlas.png'},null,2)],{type:'application/json'}),'atlas.json');});
$('apply').onclick=()=>action(async()=>{controls();await persistDraft();await saveSprite(key,{blob,atlas,updatedAt:Date.now()});status('Sprite aplicado neste dispositivo. Volte ao refúgio; a arte será atualizada.');});
$('makePrompt').onclick=()=>{try{$('prompt').value=spritePrompt({action:$('action').value,direction:$('direction').value,frames:Number($('generateFrames').value)});}catch(e){status(e.message);}};
$('copyPrompt').onclick=()=>action(async()=>{await navigator.clipboard.writeText($('prompt').value);status('Pedido copiado. Anexe a referência no gerador de imagens.');});
$('referenceFile').onchange=()=>action(async()=>{const file=$('referenceFile').files[0];if(!file)return;if(file.size>4000000||file.type!=='image/png')throw Error('Use referência PNG de até 4 MB.');await decodeArtImage(file);reference=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});status('Referência preparada para a próxima geração.');});
$('generate').onclick=()=>action(async()=>{
  if(cloudConfig?.url)throw Error('Na versão web, use a seção 05 / Geração automática acima. Este botão é exclusivo do Core local; nenhuma geração foi enviada por ele.');
  if(!$('paidConsent').checked)throw Error('Confirme a cobrança da API ou copie o pedido para gerar externamente.');
  if(!reference)throw Error('Escolha a imagem de referência PNG.');
  const frames=Number($('generateFrames').value);if(!Number.isInteger(frames)||frames<1||frames>16)throw Error('Use de 1 a 16 quadros.');
  status('Gerando poses para revisão. Pode levar alguns minutos.');
  const response=await fetch('/api/companion/art/sprite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,generation,prompt:$('prompt').value,reference,paidConsent:true}),signal:AbortSignal.timeout(195000)});
  if(response.headers.get('content-type')?.includes('application/json')!==true)throw Error('Geração direta exige o Core local. Copie o pedido e importe o PNG.');
  const data=await response.json();if(!response.ok)throw Error(data.error||'Geração indisponível.');
  await appendInput(data.image,frames,1);$('paidConsent').checked=false;status('Novos quadros acrescentados. Revise e salve a sequência antes de aplicar.');
});
function render(time){
  if(!document.hidden&&image&&atlas){
    const actionName=$('previewAction').value,dir=$('previewDirection').value,selection=selectClip(atlas,actionName,dir),clip=selection.clip;
    const cursor=Math.floor((time-playbackStart)*clip.fps/1000),index=playing?clip.frames[(clip.loop??['idle','walk','fly','sleep','happy','defend'].includes(actionName))?cursor%clip.frames.length:Math.min(cursor,clip.frames.length-1)]:manualFrame,r=frameRect(atlas,index),c=$('preview').getContext('2d');
    c.clearRect(0,0,640,540);c.fillStyle='#04111e77';c.beginPath();c.ellipse(320,470,85,15,0,0,Math.PI*2);c.fill();c.strokeStyle='#75d7b944';c.beginPath();c.moveTo(30,470);c.lineTo(610,470);c.stroke();
    const s=Math.min(400/r.w,410/r.h);c.save();c.translate(320,470);if(selection.flip)c.scale(-1,1);c.drawImage(image,r.x,r.y,r.w,r.h,-r.w*s*atlas.pivot.x,-r.h*s*atlas.pivot.y,r.w*s,r.h*s);c.restore();
    $('clipTitle').textContent=`${actionName} · ${dir}`;$('frameNumber').textContent=index;$('scrub').value=index;$('directionNotice').textContent=selection.exact&&atlas.clips[actionName]?.[dir]?'Sequência própria desta direção.':'Direção/ação ainda sem sequência própria: exibindo a disponível'+(selection.flip?' espelhada.':'.');
  }
  raf=requestAnimationFrame(render);
}
let raf=requestAnimationFrame(render);window.addEventListener('pagehide',()=>cancelAnimationFrame(raf));
renderActionUI();fillSelection();
await action(async()=>{let saved;try{saved=await readSpriteDraft(key)||await readSprite(key);}catch{}if(saved){hasWork=true;if(ACTIONS.includes(saved.editor?.action))activeAction=saved.editor.action;if(DIRECTIONS.includes(saved.editor?.direction))activeDirection=saved.editor.direction;await load(saved.blob,saved.atlas);status('Rascunho deste dispositivo carregado. Continue pela direção selecionada.');}else {try{await mayuna();}catch{status('Importe uma folha ou um vídeo para começar.');}}});
$('makePrompt').click();


function renderCoverage(){const root=$('coverage');root.replaceChildren();for(const row of coverage(atlas).filter(r=>r.action===activeAction)){const label=document.createElement('p');label.className='coverage-label';label.textContent=ACTION_LABELS[row.action];const grid=document.createElement('div');grid.className='coverage';for(const cell of row.directions){const item=document.createElement('span');item.className=cell.frames?'present':'missing';item.textContent=cell.direction+' · '+(cell.frames||'ausente');grid.append(item);}root.append(label,grid);}}
$('deleteClip').onclick=()=>action(async()=>{if(!atlas)throw Error('Importe uma folha.');const candidate=structuredClone(atlas);delete candidate.clips[activeAction]?.[activeDirection];delete candidate.studio?.reviewed?.[activeAction]?.[activeDirection];for(const key of Object.keys(candidate.clips))if(!Object.keys(candidate.clips[key]).length)delete candidate.clips[key];const valid=validateAtlas(candidate,image.naturalWidth,image.naturalHeight);await persistDraft(valid);atlas=valid;editorDrafts.delete(activeAction+':'+activeDirection);sync();status('Direção removida do rascunho; os desenhos continuam na folha.');});
$('action').onchange=()=>selectAction($('action').value);
$('direction').onchange=()=>selectAction(activeAction,$('direction').value);
$('exportGodot').onclick=()=>action(async()=>{controls();download(new Blob([godotSpriteFrames(atlas)],{type:'text/plain'}),'companion_frames.tres');status('SpriteFrames exportado. Baixe também o PNG como atlas.png.');});
let assetLibrary=localLibrary;
async function libraryAccess(){assetLibrary=$('storage').value==='cloud'?createCloudLibrary():localLibrary;canSaveLibrary=false;try{const a=await assetLibrary.access();canSaveLibrary=a.canWrite;$('accountStatus').textContent=a.label;}catch(e){$('accountStatus').textContent=e.message;}$('saveLibrary').disabled=!canSaveLibrary;}
const accessUI=accessPanel($('accountStatus').parentElement,()=>void action(async()=>{await libraryAccess();await accessUI.refresh();}));
if(!cloudConfig?.url||preferredScope()==='local')$('storage').value='local';
$('storage').onchange=()=>void action(async()=>{await libraryAccess();await accessUI.refresh();});
$('saveLibrary').onclick=()=>action(async()=>{if(!canSaveLibrary)throw Error('Escolha a biblioteca local ou uma conta com edição.');controls();if(blob.size>16_000_000)throw Error('Reduza a folha a até 16 MB.');const brief={name:$('spriteName').value.trim()||'Folha de sprites',kind:'prop',prompt:'Folha de animações com câmera ortográfica elevada. Quadros reais importados e sequências editadas.',palette:''};await assetLibrary.save({brief,prompt:brief.prompt,image:blob,mimeType:'image/png',references:[],source:'import',metadata:{assetType:'sprite',atlas,role:$('spriteRole').value}});status('Folha guardada. Abra a Oficina do mundo e selecione-a para o personagem ou monstro de estudo.');});
await libraryAccess();await accessUI.refresh();
if(params.get('asset'))await action(async()=>{const rows=await assetLibrary.list(),row=rows.find(r=>r.id===params.get('asset'));if(!row||row.metadata?.assetType!=='sprite')throw Error('Folha indisponível na biblioteca escolhida.');const file=await assetLibrary.file(row);await load(file,row.metadata.atlas);hasWork=true;editorDrafts.clear();await persistDraft();$('spriteName').value=row.name;$('spriteRole').value=row.metadata.role||'companion';status('Folha da biblioteca aberta. Guardar cria uma nova versão.');});
renderCoverage();

$('previewAction').onchange=()=>selectAction($('previewAction').value);
$('previewDirection').onchange=()=>selectAction(activeAction,$('previewDirection').value);

const {mountSpriteBatch}=await import('./sprite-batch-ui.js');
batchUI=await mountSpriteBatch(document.getElementById('automaticSprites'),{id,generation,cloud:Boolean(cloudConfig?.url),onAssemble:async(png,project)=>{editorDrafts.clear();await load(png,project);hasWork=true;await persistDraft();status('Lote montado para revisão. Confira todas as direções, guarde na biblioteca e só então aplique ao mundo.');}});

