/**
 * Técnicas da arma na mão (painel Habilidades): o tier da arma, cada técnica com a forma atual, a escolha do caminho
 * de evolução (abre no T3; no T5 vira a forma final) e a lista de combos daquela arma.
 */
import {
  COMBO_LINKS, TIERS, WEAPON_TECHNIQUES, ITEM_TYPES, CITY_SCHOOLS, TECHNIQUE_SCHOOL, evolutionsOf, finisherBySlug, lockedTechniques, type CitySchool, type SkillDef,
} from '@rules';
import { setTechPath, useSkillData, useSkills } from './skillState';

const nameOf = (slug: string) => (slug === 'basic' ? 'Golpe' : WEAPON_TECHNIQUES.find((t) => t.slug === slug)?.name ?? finisherBySlug(slug)?.name ?? slug);

export function WeaponArts() {
  const { companion: c, unlocked, catalog, bond, weapon, weaponTier, schools } = useSkillData();
  const paths = useSkills((s) => s.paths);
  if (!c) return null;
  if (!weapon) return <section className="weapon-arts"><h3>Técnicas de arma</h3><p className="hint">Equipe uma arma (espada, arco...) para ver as técnicas dela. Elas trocam sozinhas na barra quando a arma muda.</p></section>;
  const tier = TIERS[weaponTier];
  const techs = unlocked.map((u) => u.skill).filter((s) => s.slot === 'technique' && s.weapon === weapon);
  const locked = lockedTechniques(catalog, weapon, bond, schools);
  const combos = COMBO_LINKS.filter((l) => l.weapon === weapon);
  const card = (sk: SkillDef, open: boolean) => {
    const ev = evolutionsOf(sk.slug), base = WEAPON_TECHNIQUES.find((t) => t.slug === sk.slug);
    const chosen = paths[sk.slug];
    return (
      <li key={sk.slug} className={'wa-tech' + (open ? '' : ' locked')}>
        <header>
          <b>{sk.name}</b>
          {base && base.name !== sk.name && <small>de {base.name}</small>}
          {!open && <small>{TECHNIQUE_SCHOOL[sk.slug] && !schools.includes(TECHNIQUE_SCHOOL[sk.slug]) ? `ensinada na ${CITY_SCHOOLS[TECHNIQUE_SCHOOL[sk.slug] as CitySchool].label}` : `abre no vínculo ${sk.unlockBond}`}</small>}
        </header>
        <p>{sk.description}</p>
        {ev && open && (
          <div className="wa-paths" role="radiogroup" aria-label={`Caminho de evolução de ${base?.name ?? sk.name}`}>
            {ev.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={chosen === p.id} className={chosen === p.id ? 'on' : ''}
                disabled={weaponTier < 3} onClick={() => setTechPath(c.id, sk.slug, p.id)}
                title={weaponTier < 3 ? 'Abre com a arma no T3' : `T3: ${p.t3.name} · T5: ${p.t5.name}`}>
                <span>{p.label}</span>
                <small>{p.t3.name} → {p.t5.name}</small>
              </button>
            ))}
          </div>
        )}
        {ev && open && weaponTier >= 3 && !chosen && <small className="wa-hint">Escolha um caminho para a técnica evoluir.</small>}
      </li>
    );
  };
  return (
    <section className="weapon-arts" aria-label="Técnicas de arma">
      <h3>Técnicas de {ITEM_TYPES[weapon].label.toLowerCase()} <span className="wa-tier" style={{ ['--t' as string]: tier.color }}>{tier.label}</span></h3>
      <p className="hint">{weaponTier < 3 ? `Arma ${tier.label} (${tier.material}): no T3 cada técnica evolui por um caminho à sua escolha; no T5, a forma final.` : weaponTier < 5 ? `Arma ${tier.label}: técnicas evoluídas pelo caminho escolhido. No T5, a forma final.` : 'Arma T5: técnicas na forma final.'} Dano das técnicas e do golpe ×{tier.power}.</p>
      <ul className="wa-list">{techs.map((s) => card(s, true))}{locked.map((s) => card(s, false))}</ul>
      {combos.length > 0 && (
        <>
          <h4>Combos</h4>
          <ul className="wa-combos">
            {combos.map((l) => <li key={l.becomes}><span>{l.basics ? `${nameOf('basic')} ×${l.basics + 1}` : `${nameOf(l.from)} → ${nameOf(l.press)}`}</span><b>{finisherBySlug(l.becomes)?.name}</b></li>)}
          </ul>
          <small className="hint">Aperte a segunda técnica quando o botão acender; no dourado sai o Perfeito (+30%).</small>
        </>
      )}
    </section>
  );
}
