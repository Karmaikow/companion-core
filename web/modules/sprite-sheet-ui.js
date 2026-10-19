import {decodeArtImage} from './art-image.js';
import {DIRECTIONS,ACTIONS} from './sprite-atlas.js';
import {ACTION_LABELS,DIRECTION_LABELS} from './sprite-project.js';
import {mountVideoImport} from './video-sheet-ui.js';
import {MAYUNA_VIDEO_LAYOUT,sheetLayout,frameSelection,mappedAtlas,classifyOrderedTurn,cropSheet,clipFrame} from './sprite-sheet-import.js';

export function mountSheetImport(root,{onImport,onActionChange=()=>{}}){
 root.innerHTML='<summary>Importar folha ou vídeo</summary><h2>Uma fonte para a ação atual</h2><p>Importe uma folha de qualquer quantidade de quadros, até 512 por projeto, ou extraia diretamente de um vídeo.</p><div id="videoImport"></div><button id="sheetPreset">Usar grade Mayuna · 240 quadros</button><label>Folha PNG ou WebP<input id="sheetFile" type="file" accept="image/png,image/webp"></label><div id="sheetMeasures" class="sheet-measures"></div><label>Quantidade real de quadros<input id="sheetCount" type="number" min="0" max="512" value="0"><small>0 usa toda a grade. Informe o total se a última linha tiver células vazias.</small></label><label class="check"><input id="sheetScaled" type="checkbox"> Imagem redimensionada proporcionalmente</label><button id="sheetCrop" disabled>Recortar e visualizar</button><p id="sheetStatus" role="status"></p><canvas id="sheetPreview" width="320" height="320" aria-label="Prévia dos quadros"></canvas><div class="pair"><button id="sheetPlay" disabled>Pausar</button><label>FPS<input id="sheetFps" type="number" min="1" max="30" value="10"></label></div><label>Quadro <output id="sheetNumber">0</output><input id="sheetScrub" type="range" min="0" max="0" value="0"></label><button id="sheetAll" disabled>Ver sequência completa</button><label>Ação<select id="sheetAction"></select></label><div class="pair"><label>Primeira direção<select id="sheetAnchor"></select></label><label>Ordem<select id="sheetOrder"><option value="forward">S → SO → O → NO → N → NE → L → SE</option><option value="reverse">Inverter rotação</option></select></label></div><button id="sheetAutoMap" disabled>AutoMap · distribuir oito direções</button><p id="sheetReview" class="small">O AutoMap usa a ordem da rotação. A orientação dos desenhos continua revisável.</p><label>Direção para conferir<select id="sheetDirection"></select></label><div class="pair"><label>Início<input id="sheetStart" type="number" min="0" value="0"></label><label>Fim<input id="sheetEnd" type="number" min="0" value="0"></label></div><button id="sheetMarkStart">Usar quadro como início</button><button id="sheetMarkEnd">Usar quadro como fim</button><div id="sheetDirections"></div><label class="check"><input id="sheetLoop" type="checkbox"> Repetir (revise a emenda)</label><button id="sheetImport" disabled>Enviar ação para revisar no Studio</button><button id="sheetDownload" disabled>Baixar folha recortada PNG</button>';
 const $=id=>root.querySelector('#'+id),status=s=>$('sheetStatus').textContent=s;
 const labels={columns:'Colunas',rows:'Linhas',frameWidth:'Largura da célula',frameHeight:'Altura da célula',gapX:'Intervalo horizontal',gapY:'Intervalo vertical',marginX:'Margem horizontal',marginY:'Margem vertical'};
 for(const [k,label]of Object.entries(labels)){const l=document.createElement('label');l.textContent=label;const n=document.createElement('input');n.type='number';n.min=['columns','rows','frameWidth','frameHeight'].includes(k)?'1':'0';n.id='sheet-'+k;n.value=MAYUNA_VIDEO_LAYOUT[k];l.append(n);$('sheetMeasures').append(l);}
 for(const a of ACTIONS)$('sheetAction').add(new Option(ACTION_LABELS[a],a));$('sheetAction').value='walk';
 for(const id of ['sheetAnchor','sheetDirection'])for(const d of DIRECTIONS)$(id).add(new Option(DIRECTION_LABELS[d]+' · '+d,d));
 let source,layout,canvas,sourceId,playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,sequence=[],frame=0,start=performance.now(),epoch=0,busy=false,classification=null,manualEdits=false,currentAction='walk';
 const fields={},rows={},drafts=new Map();
 function buttons(){for(const id of ['sheetImport','sheetPlay','sheetAll','sheetAutoMap','sheetDownload'])$(id).disabled=busy||!layout;$('sheetCrop').disabled=busy||!source;}
 async function run(work){if(busy)return;busy=true;buttons();try{await work();}catch(e){status(e.message);}finally{busy=false;buttons();}}
 function edited(){if(classification)manualEdits=true;}
 function direction(){for(const d of DIRECTIONS)rows[d].hidden=d!==$('sheetDirection').value;}
 function rangeText(frames){if(!frames.length)return'';return frames[0]+'-'+frames.at(-1);}
 function snapshot(){drafts.set(currentAction,{ranges:Object.fromEntries(DIRECTIONS.map(d=>[d,fields[d].value])),classification,manualEdits,fps:$('sheetFps').value,loop:$('sheetLoop').checked});}
 function autoMap(){
  if(!layout)throw Error('Recorte a folha primeiro.');
  const result=classifyOrderedTurn(layout.rects.length,{anchor:$('sheetAnchor').value,clockwise:$('sheetOrder').value==='forward'});
  classification=result.classification;manualEdits=false;
  for(const d of DIRECTIONS)fields[d].value=rangeText(result.framesByDirection[d]);
  $('sheetLoop').checked=false;$('sheetReview').textContent=layout.rects.length+' quadros distribuídos em oito setores. Confira uma direção por vez e ajuste os intervalos.';
 }
 function setAction(a){
  if(!ACTIONS.includes(a)||a===currentAction)return;
  snapshot();currentAction=a;$('sheetAction').value=a;const saved=drafts.get(a);
  if(saved){for(const d of DIRECTIONS)fields[d].value=saved.ranges[d];classification=saved.classification;manualEdits=saved.manualEdits;$('sheetFps').value=saved.fps;$('sheetLoop').checked=saved.loop;}
  else{for(const d of DIRECTIONS)fields[d].value='';classification=null;manualEdits=false;if(layout)autoMap();}
 }
 for(const d of DIRECTIONS){
  const row=document.createElement('div');row.className='sheet-direction';const label=document.createElement('label');label.textContent=DIRECTION_LABELS[d]+' · '+d;
  const input=document.createElement('input');input.id='sheet-range-'+d;input.placeholder='0-15,20,22-25';input.addEventListener('input',edited);label.append(input);fields[d]=input;
  const use=document.createElement('button');use.textContent='Usar trecho';use.onclick=()=>run(async()=>{if(!layout)throw Error('Recorte a folha primeiro.');const text=$('sheetStart').value+'-'+$('sheetEnd').value;frameSelection(text,layout.rects.length);input.value=text;edited();});
  const preview=document.createElement('button');preview.textContent='Ver '+d;preview.onclick=()=>run(async()=>{if(!layout)throw Error('Recorte a folha primeiro.');const list=frameSelection(input.value,layout.rects.length);if(!list.length)throw Error('Esta direção ainda não tem quadros.');sequence=list;frame=list[0];start=performance.now();playing=!matchMedia('(prefers-reduced-motion: reduce)').matches;});
  row.append(label,use,preview);rows[d]=row;$('sheetDirections').append(row);
 }
 function invalidate(){epoch++;layout=null;canvas=null;classification=null;manualEdits=false;sourceId=null;sequence=[];drafts.clear();for(const f of Object.values(fields))f.value='';$('sheetReview').textContent='Recorte a fonte para distribuir e conferir as direções.';$('sheetPreview').getContext('2d').clearRect(0,0,320,320);buttons();}
 function install(next,cropped,fps=10){
  invalidate();layout=next;canvas=cropped;sourceId=crypto.randomUUID();sequence=next.rects.map((_,i)=>i);frame=0;start=performance.now();playing=!matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('sheetScrub').max=$('sheetStart').max=$('sheetEnd').max=sequence.length-1;$('sheetStart').value=0;$('sheetEnd').value=sequence.length-1;$('sheetFps').value=fps;autoMap();buttons();status(sequence.length+' quadros preparados. Revise os setores e envie a ação ao Studio.');
 }
 $('sheetDirection').onchange=direction;direction();
 $('sheetAction').onchange=()=>{setAction($('sheetAction').value);onActionChange(currentAction);};
 $('sheetPreset').onclick=()=>{invalidate();for(const k of Object.keys(labels))$('sheet-'+k).value=MAYUNA_VIDEO_LAYOUT[k];$('sheetCount').value=240;$('sheetScaled').checked=false;status('Grade Mayuna: 3127 × 5215 px, 12 × 20 células com intervalo 5 px.');};
 for(const k of Object.keys(labels))$('sheet-'+k).onchange=invalidate;$('sheetScaled').onchange=$('sheetCount').onchange=invalidate;
 $('sheetFile').onchange=()=>run(async()=>{invalidate();source=null;const f=$('sheetFile').files[0];if(!f)return;if(f.size>32000000)throw Error('Use uma folha de até 32 MB.');source=await decodeArtImage(f);status('Imagem '+source.naturalWidth+' × '+source.naturalHeight+' px. Configure a grade e a quantidade real de quadros.');});
 $('sheetCrop').onclick=()=>run(async()=>{if(!source)throw Error('Escolha a folha.');const next=sheetLayout({...Object.fromEntries(Object.keys(labels).map(k=>[k,Number($('sheet-'+k).value)])),frameCount:Number($('sheetCount').value)},source.naturalWidth,source.naturalHeight,$('sheetScaled').checked);install(next,cropSheet(source,next));});
 $('sheetAutoMap').onclick=()=>run(async()=>{autoMap();status('Classificação distribuída. Os intervalos continuam editáveis.');});
 $('sheetScrub').oninput=()=>{frame=Number($('sheetScrub').value);playing=false;$('sheetPlay').textContent='Reproduzir';};
 $('sheetPlay').onclick=()=>{playing=!playing;start=performance.now();$('sheetPlay').textContent=playing?'Pausar':'Reproduzir';};
 $('sheetFps').onchange=()=>{start=performance.now();};$('sheetAll').onclick=()=>{if(!layout)return;sequence=layout.rects.map((_,i)=>i);start=performance.now();playing=!matchMedia('(prefers-reduced-motion: reduce)').matches;};
 $('sheetMarkStart').onclick=()=>$('sheetStart').value=frame;$('sheetMarkEnd').onclick=()=>$('sheetEnd').value=frame;
 const pngBlob=()=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Falha ao exportar PNG.')),'image/png'));
 $('sheetImport').onclick=()=>run(async()=>{if(!layout)throw Error('Recorte a fonte primeiro.');const next=mappedAtlas(layout,currentAction,Object.fromEntries(DIRECTIONS.map(d=>[d,fields[d].value])),Number($('sheetFps').value),$('sheetLoop').checked,classification?{...classification,manualEdits}:null);const ticket=epoch,png=await pngBlob();if(ticket!==epoch)throw Error('A fonte mudou. Recorte novamente.');await onImport(png,next,sourceId);status('Ação enviada. Salve cada direção no Studio e avance pela rosa dos ventos.');});
 $('sheetDownload').onclick=()=>run(async()=>{if(!canvas)return;const url=URL.createObjectURL(await pngBlob()),a=document.createElement('a');a.href=url;a.download='mega-spritesheet.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 mountVideoImport($('videoImport'),{onExtract:async(c,p)=>{if(busy)throw Error('Aguarde a importação atual.');const measures={columns:p.columns,rows:p.rows,frameWidth:p.frameWidth,frameHeight:p.frameHeight,gapX:0,gapY:0,marginX:0,marginY:0,frameCount:p.count};for(const k of Object.keys(labels))$('sheet-'+k).value=measures[k];$('sheetCount').value=p.count;$('sheetScaled').checked=false;source=null;install(sheetLayout(measures,c.width,c.height),c,p.fps);}});
 function render(time){
  if(canvas&&!document.hidden){const fps=Number($('sheetFps').value);if(playing&&sequence.length&&fps>=1&&fps<=30)frame=clipFrame({frames:sequence,fps,loop:sequence.length===layout.rects.length?false:$('sheetLoop').checked},(time-start)/1000);const c=$('sheetPreview').getContext('2d'),w=layout.frameWidth,h=layout.frameHeight,s=Math.min(300/w,300/h);c.clearRect(0,0,320,320);c.drawImage(canvas,frame%layout.columns*w,Math.floor(frame/layout.columns)*h,w,h,(320-w*s)/2,(320-h*s)/2,w*s,h*s);$('sheetNumber').textContent=frame;$('sheetScrub').value=frame;}
  raf=requestAnimationFrame(render);
 }
 let raf=requestAnimationFrame(render);window.addEventListener('pagehide',()=>cancelAnimationFrame(raf),{once:true});
 return{setAction};
}
