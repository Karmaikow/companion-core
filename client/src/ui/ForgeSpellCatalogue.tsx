import { useState } from 'react';
import { SPELL_CATALOGUE, SPELL_SCHOOLS } from '../../../shared/rules/combat/catalogue';
import { catalogueAffinity } from '../../../shared/rules/combat/schools';
import type { SkillDef } from '@rules';
export function ForgeSpellCatalogue({skill,onChange}:{skill:SkillDef;onChange:(vfx:SkillDef['vfx'])=>void}){
 const [query,setQuery]=useState(''),[school,setSchool]=useState('');
 const filtered=SPELL_CATALOGUE.filter(s=>(!school||s.school===school)&&`${s.label} ${s.id} ${s.school} ${catalogueAffinity(s.school)?.label}`.toLowerCase().includes(query.toLowerCase()));
 return <section><h3>Biblioteca de habilidades · 100 efeitos</h3><p>Selecione para substituir o visual desta habilidade. Salve a habilidade para guardar a escolha; dano, custo e alcance continuam na folha de batalha.</p>
 <div className="grid-form"><label>Buscar efeito<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Fogo, Veneno, Arcana…"/></label><label>Essência ou escola<select value={school} onChange={e=>setSchool(e.target.value)}><option value="">10 essências + 5 escolas</option>{SPELL_SCHOOLS.map(s=><option key={s.id} value={s.id}>{catalogueAffinity(s.id)?.label ?? s.label} · {catalogueAffinity(s.id)?.kind === 'school' ? 'Escola' : 'Essência'}</option>)}</select></label></div>
 <p>{filtered.length} efeitos · Selecionado: {SPELL_CATALOGUE.find(s=>s.id===skill.vfx.catalogue)?.label??'Visual clássico'}</p>
 <div className="spell-grid">{filtered.map(s=><button type="button" key={s.id} aria-pressed={s.id===skill.vfx.catalogue} style={{borderColor:s.accent,background:s.id===skill.vfx.catalogue?'#28445a':undefined}} onClick={()=>onChange({...skill.vfx,catalogue:s.id,layers:[]})}>{s.label}<small style={{display:'block'}}>{catalogueAffinity(s.school)?.label ?? s.school} · {s.cast==='zone'?'Área':'Linear'}</small></button>)}</div>
 <div className="row"><button type="button" onClick={()=>onChange({...skill.vfx,catalogue:undefined})}>Usar visual clássico</button></div>
 <p className="hint">Efeitos MIT de achrefelouafi e majidmanzarpour. Carregamento sob demanda. Os formatos visuais do catálogo não alteram a área de dano.</p></section>;
}
