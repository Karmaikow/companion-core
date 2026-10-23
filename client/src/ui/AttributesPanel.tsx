import { useState } from 'react';
import { SPECIES, ELEMENTS, spent, canSpend, type AttrKey } from '@rules';
import { useSkillData, useSkills, persistAlloc } from './skillState';
import { useVitals } from '../scene/vitals';
import { HudGlyph } from './HudGlyph';

const ROWS: { key: AttrKey; label: string; color: string }[] = [
  { key: 'vida', label: 'Vitalidade', color: '#83d876' },
  { key: 'energia', label: 'Energia', color: '#6fcaff' },
  { key: 'poder', label: 'Poder', color: '#f29b87' },
  { key: 'agilidade', label: 'Agilidade', color: '#edc766' },
];

/** A visual view over the existing skill allocation, not a second progression system. */
export function AttributesPanel() {
  const { companion, species, essence, bond, points, tree, alloc, fx } = useSkillData();
  const saving = useSkills((s) => s.saving);
  const hpMax = useVitals((s) => s.hpMax), spMax = useVitals((s) => s.spMax);
  const [view, setView] = useState<'essence' | 'attributes'>('attributes');
  if (!companion) return null;
  const free = Math.max(0, points - spent(alloc));
  return <div className="attribute-sheet">
    <nav className="attribute-tabs" aria-label="Ficha do Companion">
      <button className={view === 'essence' ? 'on' : ''} aria-pressed={view === 'essence'} onClick={() => setView('essence')}>Essência</button>
      <button className={view === 'attributes' ? 'on' : ''} aria-pressed={view === 'attributes'} onClick={() => setView('attributes')}>Atributos</button>
    </nav>
    {view === 'essence' ? <div className="essence-profile">
      <div className="essence-orb" style={{ color: essence ? ELEMENTS[essence].glow : '#a5d2ff' }}><HudGlyph kind={essence ?? 'sintonia'} /></div>
      <h3>{species ? SPECIES[species].label : 'Forma a descobrir'}{essence ? ' · ' + ELEMENTS[essence].label : ''}</h3>
      <p>{species ? SPECIES[species].lineage : 'Sua identidade floresce a cada conversa.'}</p>
      <div className="essence-traits">{companion.discoveries.traits?.map((t) => <span key={t}>{t}</span>)}</div>
      {companion.discoveries.dream && <blockquote>{companion.discoveries.dream}</blockquote>}
    </div> : <>
      <div className="attribute-rows">{ROWS.map(({ key, label, color }) => {
        const bonus = fx?.bonus[key] ?? 0;
        const nodes = tree?.nodes.filter((n) => n.kind === 'passive' && n.bonus?.[key]) ?? [];
        const candidate = nodes.find((n) => !canSpend(tree!, alloc, n.id, bond, points));
        const value = key === 'vida' ? hpMax : key === 'energia' ? spMax : '+' + bonus + '%';
        return <div className="attribute-row" key={key} style={{ ['--stat-color' as string]: color }}>
          <span className="attribute-symbol"><HudGlyph kind={key} /></span>
          <div><div className="attribute-label"><span>{label}</span><strong>{value}</strong></div>
            <div className="attribute-meter" title={'Bônus da árvore: +' + bonus + '%'}><i style={{ width: Math.min(100, 20 + bonus * 2) + '%' }} /></div>
          </div>
          <button className="attribute-plus" disabled={saving || !candidate} aria-label={'Melhorar ' + label}
            title={candidate ? candidate.name + ': ' + candidate.description : nodes.length ? 'Confira os pontos e pré-requisitos na árvore de habilidades' : 'Este atributo ainda não tem uma passiva disponível para sua classe'}
            onClick={() => { if (candidate) void persistAlloc(companion.id, { ...alloc, [candidate.id]: (alloc[candidate.id] ?? 0) + 1 }); }}>+</button>
        </div>;
      })}</div>
      <div className="attribute-secondary">
        <div><HudGlyph kind="defesa" /><span>Defesa<b>+{fx?.bonus.defesa ?? 0}%</b></span></div>
        <div><HudGlyph kind="sintonia" /><span>Sintonia<b>+{fx?.bonus.sintonia ?? 0}%</b></span></div>
      </div>
      <small className="attribute-points" aria-live="polite">{saving ? 'Salvando…' : free + ' ponto' + (free === 1 ? '' : 's') + ' disponível' + (free === 1 ? '' : 'is')}</small>
      <button className="redistribute" disabled={saving || !spent(alloc)} onClick={() => { if (confirm('Devolver todos os pontos da árvore? As habilidades liberadas por eles também serão removidas até você distribuí-los novamente.')) void persistAlloc(companion.id, {}); }}><span aria-hidden="true">⟳</span> Redistribuir pontos</button>
      <p className="attribute-note">Vitalidade e energia mostram os máximos atuais; os demais valores mostram bônus da árvore. Habilidades e passivas compartilham os mesmos pontos.</p>
    </>}
  </div>;
}
