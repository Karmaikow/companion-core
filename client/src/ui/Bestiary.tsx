/**
 * Análise de Partículas (Memórias → Memórias de Combate): cada criatura derrotada, as partículas recolhidas e o que
 * a análise já revelou — em camadas, até a ficha completa (fraquezas, atributos, o que solta). Os marcos de espécies
 * analisadas formam a quest "Análise de Partículas".
 */
import { ANALYSIS_MILESTONES, ANALYSIS_TARGET, DEFAULT_CREATURES, analysisRatio, dossier, isAnalyzed } from '@rules';
import { useGame } from '../store';
import { brain } from '../scene/brain';
import { useSkills } from './skillState';

export function BestiaryPanel() {
  const list = useGame((s) => s.snap?.bestiary ?? []);
  const catalog = useSkills((s) => s.catalog);
  const defs = brain.defs.length ? brain.defs : DEFAULT_CREATURES;
  const analyzed = list.filter(isAnalyzed).length;
  const next = ANALYSIS_MILESTONES.find((m) => m > analyzed) ?? null;
  const skillName = (slug: string) => catalog.find((s) => s.slug === slug)?.name ?? slug;
  return (
    <div className="bestiary">
      <div className="best-quest">
        <b>Quest: Análise de Partículas</b>
        <span>{analyzed} espécie{analyzed === 1 ? '' : 's'} analisada{analyzed === 1 ? '' : 's'}{next ? ` · próximo marco: ${next}` : ' · todos os marcos!'}</span>
        <div className="bar"><i style={{ width: `${next ? Math.round((analyzed / next) * 100) : 100}%` }} /></div>
        <small>Derrote criaturas no Companion World: cada uma solta partículas da Bruma. Com {ANALYSIS_TARGET} partículas de uma espécie, a análise revela tudo sobre ela — e ela passa a saber disso nas conversas.</small>
      </div>
      {!list.length && <p className="empty">Nenhuma criatura derrotada ainda. Explore o mundo com ela (ou mande: "ataque esses monstros!").</p>}
      <ul className="best-list">
        {list.map((e) => {
          const def = defs.find((d) => d.slug === e.slug);
          const pct = Math.round(analysisRatio(e) * 100);
          const dz = def ? dossier(def, e, skillName) : null;
          return (
            <li key={e.slug} className={isAnalyzed(e) ? 'done' : ''}>
              <header>
                <i className="dot" style={{ background: def?.color ?? '#b9a6ff' }} />
                <b>{e.name}</b>
                <small>derrotou {e.kills}×</small>
              </header>
              <div className="best-prog" aria-label={`análise ${pct}%`}><div className="bar"><i style={{ width: pct + '%' }} /></div><small>{pct === 100 ? 'Análise completa' : `${Math.min(e.particles, ANALYSIS_TARGET)}/${ANALYSIS_TARGET} partículas`}</small></div>
              {dz && (
                <dl>
                  <dt>Essência</dt><dd>{dz.essence ?? 'nenhuma'}</dd>
                  {dz.temperament && <><dt>Temperamento</dt><dd>{dz.temperament}</dd></>}
                  {dz.archetype && <><dt>Jeito de lutar</dt><dd>{dz.archetype}</dd></>}
                  {dz.skills && <><dt>Habilidades</dt><dd>{dz.skills.join(', ') || '—'}</dd></>}
                  {dz.weakTo && <><dt>Fraca contra</dt><dd>{dz.weakTo.join(', ') || 'nada em especial'}</dd></>}
                  {dz.resists && <><dt>Resiste a</dt><dd>{dz.resists.join(', ') || 'nada'}</dd></>}
                  {dz.stats && <><dt>Atributos</dt><dd>vida {dz.stats.vida} · ataque {dz.stats.ataque} · defesa {dz.stats.defesa}</dd></>}
                  {dz.drops && <><dt>Solta</dt><dd>{dz.drops.join(', ') || 'nada'}</dd></>}
                  {dz.stage < 3 && <><dt>…</dt><dd className="locked">mais partículas revelam o resto</dd></>}
                </dl>
              )}
              {dz?.description && <p>{dz.description}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
