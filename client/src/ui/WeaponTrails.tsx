/**
 * Galho "Armas" da árvore de habilidades: uma trilha para cada arma, no mesmo céu estrelado da árvore. Cada técnica é
 * uma linha da trilha — a estrela da técnica base, a bifurcação do T3 (dois caminhos, a pessoa escolhe um) e a forma
 * final do T5 no fim de cada caminho. As técnicas não gastam pontos: abrem pelo vínculo (e pela escola, as do
 * cajado) e evoluem com o tier da arma na mão. Embaixo, os combos daquela arma.
 */
import { useState } from 'react';
import {
  COMBO_LINKS, TIERS, WEAPON_TECHNIQUES, TECHNIQUE_SCHOOL, CITY_SCHOOLS, ITEM_TYPES, cadenceLabel, cadencesFor, evolutionsOf, finisherBySlug,
  type CitySchool, type SkillDef, type WeaponKind,
} from '@rules';
import { setTechPath, useSkillData, useSkills } from './skillState';
import { SkillIcon } from './SkillIcon';

const ICON: Partial<Record<WeaponKind, string>> = { espada: '🗡', arco: '🏹', cajado: '🪄', lanca: '🔱', maca: '🔨', faca: '🔪', varinha: '✨' };
const KINDS = [...new Set(WEAPON_TECHNIQUES.map((t) => t.weapon!))] as WeaponKind[];
const nameOf = (slug: string) => (slug === 'basic' ? 'Golpe' : WEAPON_TECHNIQUES.find((t) => t.slug === slug)?.name ?? finisherBySlug(slug)?.name ?? slug);

export function WeaponTrails() {
  const { companion: c, bond, weapon, weaponTier, schools } = useSkillData();
  const paths = useSkills((s) => s.paths);
  const [pick, setPick] = useState<WeaponKind>(weapon && KINDS.includes(weapon) ? weapon : KINDS[0]);
  if (!c) return null;
  const inHand = weapon === pick;
  const tier = inHand ? weaponTier : null;
  const techs = WEAPON_TECHNIQUES.filter((t) => t.weapon === pick);
  const combos = COMBO_LINKS.filter((l) => l.weapon === pick);
  const cadences = cadencesFor(pick);

  const lock = (t: SkillDef) => {
    const sc = TECHNIQUE_SCHOOL[t.slug];
    if (sc && !schools.includes(sc)) return `ensinada na ${CITY_SCHOOLS[sc as CitySchool]?.label ?? sc}`;
    if (t.unlockBond > bond) return `vínculo ${t.unlockBond}`;
    return null;
  };

  return (
    <div className="wt">
      <nav className="wt-weapons" aria-label="Trilha de qual arma">
        {KINDS.map((k) => (
          <button key={k} type="button" className={(pick === k ? 'on' : '') + (weapon === k ? ' held' : '')} aria-pressed={pick === k} onClick={() => setPick(k)}>
            <span aria-hidden>{ICON[k] ?? '⚔'}</span>{ITEM_TYPES[k].label}
            {weapon === k && <em style={{ ['--t' as string]: TIERS[weaponTier].color }}>{TIERS[weaponTier].label}</em>}
          </button>
        ))}
      </nav>
      <p className="wt-hint">
        {inHand
          ? `Na mão: ${ITEM_TYPES[pick].label} ${TIERS[weaponTier].label}. ${weaponTier < 3 ? 'No T3 cada técnica abre dois caminhos; no T5, a forma final.' : weaponTier < 5 ? 'Caminhos do T3 valendo; no T5, a forma final.' : 'Formas finais valendo.'} Dano ×${TIERS[weaponTier].power}.`
          : `Equipe ${ITEM_TYPES[pick].label.toLowerCase()} para usar estas técnicas. Dá para escolher os caminhos antes.`}
      </p>

      <ol className="wt-sky">
        {techs.map((t) => {
          const ev = evolutionsOf(t.slug), why = lock(t), chosen = paths[t.slug];
          const st3 = (id: 'a' | 'b') => (chosen === id ? (tier && tier >= 3 ? 'lit' : 'picked') : chosen ? 'off' : '');
          const st5 = (id: 'a' | 'b') => (chosen === id ? (tier && tier >= 5 ? 'lit' : 'picked') : 'off');
          return (
            <li key={t.slug} className={'wt-row' + (why ? ' locked' : '')}>
              <div className={'wt-star base' + (why ? '' : ' lit')} title={t.description}>
                <i aria-hidden />
                <b>{t.name}</b>
                <small>{why ?? 'aberta'}</small>
              </div>
              {ev && (
                <>
                  <span className="wt-fork" aria-hidden><i /><i /></span>
                  <div className="wt-col">
                    {ev.map((p) => (
                      <button key={p.id} type="button" className={'wt-star t3 ' + st3(p.id)} disabled={!!why} aria-pressed={chosen === p.id}
                        onClick={() => setTechPath(c.id, t.slug, p.id)} title={`Caminho ${p.label}: ${p.t3.name} (T3) → ${p.t5.name} (T5)`}>
                        <i aria-hidden /><b>{p.t3.name}</b><small>T3 · {p.label}</small>
                      </button>
                    ))}
                  </div>
                  <span className="wt-link" aria-hidden><i /><i /></span>
                  <div className="wt-col">
                    {ev.map((p) => (
                      <div key={p.id} className={'wt-star t5 ' + st5(p.id)}><i aria-hidden /><b>{p.t5.name}</b><small>T5</small></div>
                    ))}
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ol>

      <div className="wt-combos wt-cadences">
        <h4>Cadências da {ITEM_TYPES[pick].label.toLowerCase()}</h4>
        <ul>
          {cadences.map((cd) => {
            const sk = WEAPON_TECHNIQUES.find((t) => t.slug === cd.slug) ?? finisherBySlug(cd.slug);
            if (!sk) return null;
            const why = WEAPON_TECHNIQUES.some((t) => t.slug === cd.slug) ? lock(sk) : null;
            return (
              <li key={cd.slug} className={why ? 'locked' : ''} title={sk.description}>
                <span className="wt-cad-icon" aria-hidden><SkillIcon skill={sk} size={30} color="#ffd77a" /></span>
                <b>{sk.name}</b>
                <span className="wt-seq" aria-label={cadenceLabel(cd.seq)}>{cd.seq.map((t, i) => <i key={i} className={t === 'B' ? 'b' : 'h'}>{t === 'B' ? '⚔' : t.slice(1)}</i>)}</span>
                {why && <small>{why}</small>}
              </li>
            );
          })}
          {combos.filter((l) => l.basics).map((l) => <li key={l.becomes}><span className="wt-cad-icon" aria-hidden /><b>{finisherBySlug(l.becomes)?.name}</b><span className="wt-seq">{Array.from({ length: l.basics! + 1 }, (_, i) => <i key={i} className="b">⚔</i>)}</span></li>)}
        </ul>
        <small>⚔ é o golpe básico; 1, 2 e 3 são as habilidades dos três primeiros espaços da barra. A técnica sai no último toque. Dá para emendar uma cadência na continuação dela, e tocar no ritmo certo dá o Perfeito (+30%).</small>
      </div>
    </div>
  );
}
