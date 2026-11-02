/**
 * Galho "Armas" da árvore de habilidades: uma trilha para cada arma, no mesmo céu estrelado da árvore. Cada técnica é
 * uma linha da trilha — a estrela da técnica base, a bifurcação do T3 (dois caminhos, a pessoa escolhe um) e a forma
 * final do T5 no fim de cada caminho. As técnicas não gastam pontos: abrem pelo vínculo (e pela escola, as do
 * cajado) e evoluem com o tier da arma na mão. Embaixo, os combos daquela arma.
 */
import { useState } from 'react';
import {
  COMBO_LINKS, TIERS, WEAPON_TECHNIQUES, TECHNIQUE_SCHOOL, CITY_SCHOOLS, ITEM_TYPES, evolutionsOf, finisherBySlug,
  type CitySchool, type SkillDef, type WeaponKind,
} from '@rules';
import { setTechPath, useSkillData, useSkills } from './skillState';

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

      {combos.length > 0 && (
        <div className="wt-combos">
          <h4>Combos da {ITEM_TYPES[pick].label.toLowerCase()}</h4>
          <ul>
            {combos.map((l) => <li key={l.becomes}><span>{l.basics ? `${nameOf('basic')} ×${l.basics + 1}` : `${nameOf(l.from)} → ${nameOf(l.press)}`}</span><b>{finisherBySlug(l.becomes)?.name}</b></li>)}
          </ul>
          <small>Aperte a segunda técnica quando o botão acender; no dourado sai o Perfeito (+30%).</small>
        </div>
      )}
    </div>
  );
}
