import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_SKILLS, type SkillDef } from '@rules';
import { SkillPreview } from '../SkillFx';
import { ForgeSchools } from '../../ui/ForgeSchools';
import { ForgeSpellCatalogue } from '../../ui/ForgeSpellCatalogue';
import { SPELL_CATALOGUE } from '../../../../shared/rules/combat/catalogue';
function Gallery(){
 const [skill,setSkill]=useState<SkillDef>({...DEFAULT_SKILLS[0],slug:'catalogue-preview',name:'Demonstração',windup:0.5,range:8,radius:1.5,shape:'line',vfx:{...DEFAULT_SKILLS[0].vfx,catalogue:'ice'}});
 const [paused,setPaused]=useState(false),[restart,setRestart]=useState(0);
 const selected=SPELL_CATALOGUE.find(s=>s.id===skill.vfx.catalogue);
 return <main><h1>Companion Core · Catálogo VFX</h1><p>Demonstração dos 100 efeitos. As escolhas nesta página não são salvas.</p><h2>{selected?.label??'Visual clássico'}</h2><SkillPreview skill={skill} companionColor="#5fd0ff" defenderEssence={null} paused={paused} restart={restart} dark/><p><button onClick={()=>setPaused(p=>!p)}>{paused?'Continuar':'Pausar'}</button> <button onClick={()=>setRestart(r=>r+1)}>Reiniciar</button> <a href="/#/admin/forja">Abrir a Forja para salvar uma habilidade</a></p><ForgeSchools/><ForgeSpellCatalogue skill={skill} onChange={vfx=>{const effect=SPELL_CATALOGUE.find(s=>s.id===vfx.catalogue);setSkill(s=>({...s,vfx,shape:effect?.cast==='zone'?'circle':'line'}));setPaused(false);}}/></main>;
}
createRoot(document.getElementById('root')!).render(<Gallery/>);
