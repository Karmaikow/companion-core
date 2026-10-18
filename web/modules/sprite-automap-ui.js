import {DIRECTIONS} from './sprite-atlas.js';
import {analyzeCanvas,history} from './sprite-automap.js';
export function mountAutoMap(root,{getCanvas,getLayout,getFrame,fields}){
 const panel=document.createElement('section');panel.innerHTML=`<h3>AutoMap v1 · análise local</h3><p>Sem referências confirmadas, as vistas ficam incertas. Confirme exemplos visíveis; o AutoMap compara pixels, sem gerar desenhos ou usar APIs.</p><div class="auto-anchors"></div><button type="button" id="autoRun">Reanalisar com referências</button><button type="button" id="autoUndo">Desfazer mapa</button><button type="button" id="autoRedo">Refazer mapa</button><button type="button" id="autoRestore">Restaurar resultado automático</button><p id="autoStatus" role="status"></p><div id="autoCycles"></div><details><summary>Confiança e continuidade por quadro</summary><div id="autoFrames"></div></details>`;root.append(panel);
 const $=id=>panel.querySelector('#'+id);let report=null,automatic=null,edits=history({anchors:{},ranges:{}});
 function snapshot(){return {anchors:report?.anchors||{},ranges:Object.fromEntries(DIRECTIONS.map(d=>[d,fields[d].value]))};}
 function apply(state){for(const d of DIRECTIONS)fields[d].value=state.ranges[d]||'';if(getCanvas())report=analyzeCanvas(getCanvas(),getLayout(),state.anchors);render();}
 function render(){
  $('autoUndo').disabled=!edits.canUndo;$('autoRedo').disabled=!edits.canRedo;
  if(!report){$('autoStatus').textContent='Recorte uma folha para analisar.';return;}
  const unknown=report.frames.filter(f=>!f.direction).length;$('autoStatus').textContent=`${report.frames.length} quadros · ${unknown} incertos · ${report.cycles.length} sugestões de ciclo. FPS padrão 10. Direções não confirmadas continuam ausentes.`;
  const list=$('autoFrames');list.replaceChildren();for(const f of report.frames){const p=document.createElement('p');p.textContent=`${f.index}: ${f.direction||'incerto'} · confiança ${Math.round(f.confidence*100)}% · continuidade ${f.continuity===null?'—':Math.round(f.continuity*100)+'%'}${f.reviewed?' · referência confirmada':''}`;list.append(p);}
  $('autoCycles').replaceChildren();for(const cycle of report.cycles){const b=document.createElement('button');b.type='button';b.textContent=`Usar ciclo sugerido ${cycle.direction}: ${cycle.frames.join(',')} (${Math.round(cycle.confidence*100)}%)`;b.onclick=()=>{fields[cycle.direction].value=cycle.frames.join(',');cycle.accepted=true;edits.push(snapshot());render();};$('autoCycles').append(b);}
 }
 function run(anchors=report?.anchors||{}){if(!getCanvas())return;report=analyzeCanvas(getCanvas(),getLayout(),anchors);for(const d of DIRECTIONS)fields[d].value=report.frames.filter(f=>f.direction===d).map(f=>f.index).join(',');automatic=snapshot();edits.push(automatic);render();}
 for(const d of DIRECTIONS){const b=document.createElement('button');b.type='button';b.textContent=`Confirmar quadro atual como ${d}`;b.onclick=()=>{if(!getCanvas())return;const anchors=structuredClone(report?.anchors||{}),i=getFrame();for(const key of DIRECTIONS)anchors[key]=(anchors[key]||[]).filter(n=>n!==i);anchors[d]=[...(anchors[d]||[]),i];run(anchors);};panel.querySelector('.auto-anchors').append(b);fields[d].addEventListener('change',()=>{edits.push(snapshot());render();});}
 $('autoRun').onclick=()=>run();$('autoUndo').onclick=()=>apply(edits.undo());$('autoRedo').onclick=()=>apply(edits.redo());$('autoRestore').onclick=()=>{if(automatic)apply(edits.push(automatic));};
 render();return {reset(){report=null;automatic=null;edits=history({anchors:{},ranges:{}});$('autoFrames').replaceChildren();$('autoCycles').replaceChildren();render();},run:()=>run({}),get metadata(){return report?{...structuredClone(report),automatic:structuredClone(automatic),ranges:snapshot().ranges}:null;}};
}
