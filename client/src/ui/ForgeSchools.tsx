import type { SkillDef } from '@rules';
import { buildSchoolTree } from '../../../shared/rules/combat/schoolTree';
import { useState } from 'react';
import { SCHOOL_IDS, SCHOOL_DEFINITIONS, SCHOOL_RANKS, schoolPower, scaleSchoolEffect, type SchoolId } from '../../../shared/rules/combat/schools';

export function ForgeSchools({ catalogue = [] }: { catalogue?: SkillDef[] }) {
  const [priorities, setPriorities] = useState<SchoolId[]>(['arcane']);
  const [school, setSchool] = useState<SchoolId>('arcane');
  const [convergent, setConvergent] = useState(false);
  const schoolTree = buildSchoolTree(catalogue, school, 'touro');
  const definition = SCHOOL_DEFINITIONS[school];
  const power = schoolPower(school, priorities, convergent);
  const example = scaleSchoolEffect({ damage: 100, heal: 100, shield: 100, controlSeconds: 2, dashDistance: 6, dashSpeed: 12 }, power);
  function toggle(id: SchoolId) { setPriorities(current => current.includes(id) ? current.filter(s => s !== id) : [...current, id]); }
  function promote(id: SchoolId) { setPriorities(current => [id, ...current.filter(s => s !== id)]); }
  return <details className="kit-box">
    <summary>Escolas e evolução · planejamento e simulação</summary>
    <p>As cinco escolas estão planejadas. Este simulador não altera habilidades, inventário ou progresso do Companion.</p>
    <p>Estude todas; escolha a prioridade das escolas ativas. Essências e habilidades atuais permanecem independentes.</p>
    {SCHOOL_IDS.map(id => <div key={id}>
      <label><input type="checkbox" checked={priorities.includes(id)} onChange={() => toggle(id)} /> {SCHOOL_DEFINITIONS[id].label}</label>
      {priorities.includes(id) && <><span> · prioridade {priorities.indexOf(id) + 1} · {Math.round(schoolPower(id, priorities, convergent) * 100)}% </span><button type="button" disabled={priorities[0] === id} onClick={() => promote(id)}>Priorizar {SCHOOL_DEFINITIONS[id].label}</button></>}
    </div>)}
    <label><input type="checkbox" checked={convergent} onChange={e => setConvergent(e.target.checked)} /> Simular Convergente (70% em cada escola quando as cinco estão ativas)</label>
    <p>Convergente exige cinco maestrias, técnicas das trilhas, títulos, memórias, relíquias e a prova final. A Escola da Forja é exclusiva dos Taurinos, inclusive suas técnicas. A conquista Convergente exige revisão para as demais linhagens.</p>
    <label>Consultar escola <select value={school} onChange={e => setSchool(e.target.value as SchoolId)}>{SCHOOL_IDS.map(id => <option key={id} value={id}>{SCHOOL_DEFINITIONS[id].label}</option>)}</select></label>
    <p aria-live="polite">Exemplo a {Math.round(power * 100)}%: dano {example.damage}, cura {example.heal}, escudo {example.shield}, atordoamento {Number(example.controlSeconds.toFixed(2))} s. Dash preservado: {example.dashDistance} m.</p>
    <details><summary>Árvore da escola · prévia administrativa ({schoolTree.nodes.length} técnicas)</summary><p>No jogo, esta árvore será acessível apenas no local da escola. Forja: somente Taurinos.</p>{[1,2,3,4,5].map(rank => <section key={rank}><h4>{SCHOOL_RANKS[rank-1].label}</h4><ul>{schoolTree.nodes.filter(node=>node.rank===rank).map(node=><li key={node.id}>{node.iconUrl && <img src={node.iconUrl} alt="" width={32} height={32} />} {node.name} · vínculo {node.requiredBond} · {node.reason}</li>)}</ul></section>)}</details>
    <p>Memórias: {definition.themes.join(' · ')}. Título final: {definition.title}.</p>
    <p>Materiais: {definition.items.join(' · ')}. Localização a definir.</p>
    <div style={{ overflowX: 'auto' }}><table><caption>Requisitos propostos · quantidades sujeitas a balanceamento</caption><thead><tr><th>Grau / nível</th><th>Memórias / temas</th><th>Marcantes / extraordinárias</th><th>Entrega básica / incomum / rara</th><th>Vínculo / missão</th></tr></thead><tbody>
      {SCHOOL_RANKS.map(rank => <tr key={rank.label}><th scope="row">{rank.label} / {rank.level}</th><td>{rank.memories} / {rank.themes}</td><td>{rank.remarkable} / {rank.extraordinary}</td><td>{rank.label === 'Mestre' ? 'Conjunto especial da escola' : rank.items.join(' / ')}</td><td>{rank.bond} / {rank.quest}</td></tr>)}
    </tbody></table></div>
    <p>Memórias acumulam e não são consumidas. Eventos repetidos contam uma vez por conquista; somente eventos validados pelo jogo poderão qualificar. As entregas serão consumidas uma vez por promoção.</p>
  </details>;
}
