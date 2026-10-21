/**
 * Equipamento (dentro do Inventário): os cinco espaços, os itens que o Companion tem e a Forja.
 * Itens são raros e só nascem na Forja — e só a classe Taurina forja, com receitas e ingredientes (drops dos monstros).
 * Enquanto a coleta de drops não existe (chega com a batalha), ninguém tem ingredientes; `?arsenal` libera tudo para teste.
 */
import { useMemo, useState } from 'react';
import { ITEM_TYPES, RARITIES, SLOTS_EQ, ELEMENTS, SPECIES, equip, equipmentBonus, forgeCheck, canForge, basicAttack, type EquipSlot, type Equipped, type ItemDef } from '@rules';
import { useGame } from '../store';
import { supabase } from '../backend/online';

const TEST = typeof location !== 'undefined' && new URLSearchParams(location.search).has('arsenal');
/** Itens que o Companion tem: os de evento (starter) — e, no modo de teste, todos. */
export const ownsItem = (slug: string) => TEST || !!useGame.getState().items.find((i) => i.slug === slug)?.starter;
const materials = (): Record<string, number> => (TEST ? new Proxy({}, { get: () => 99 }) as Record<string, number> : {});
const ATTR: Record<string, string> = { vida: 'Vida', energia: 'Energia', poder: 'Poder', defesa: 'Defesa', agilidade: 'Agilidade', sintonia: 'Sintonia' };
const ICON: Record<string, string> = { espada: '🗡', faca: '🔪', maca: '🔨', lanca: '🔱', cajado: '🪄', varinha: '✨', arco: '🏹', escudo: '🛡', grimorio: '📖', orbe: '🔮', chapeu: '🎩', tiara: '👑', laco: '🎀', coroa: '🌸', mochila: '🎒', aljava: '🏹', amuleto: '📿', anel: '💍' };

export function EquipmentPanel() {
  const items = useGame((s) => s.items);
  const equipped = useGame((s) => s.equipped);
  const setEquipped = useGame((s) => s.setEquipped);
  const backend = useGame((s) => s.backend);
  const c = useGame((s) => s.snap?.companion);
  const species = c?.discoveries.form ?? null;
  const [slot, setSlot] = useState<EquipSlot>('weapon');
  const [tab, setTab] = useState<'equip' | 'forja'>('equip');

  async function save(next: Equipped) {
    setEquipped(next);
    if (!c) return;
    try {
      if (backend?.kind === 'online') await supabase().from('companion_equipment').upsert({ companion_id: c.id, equipped: next, updated_at: new Date().toISOString() });
      else localStorage.setItem('companion-core:equipped:' + c.id, JSON.stringify(next));
    } catch { /* fica só nesta sessão */ }
  }
  const bySlug = (s?: string) => items.find((i) => i.slug === s);
  const list = useMemo(() => items.filter((i) => ITEM_TYPES[i.type].slot === slot), [items, slot]);
  const bonus = equipmentBonus(equipped, items);
  const atk = basicAttack(bySlug(equipped.weapon) ?? null, species);

  return (
    <div className="equip">
      <nav className="st-tabs" aria-label="Equipamento">
        <button className={tab === 'equip' ? 'on' : ''} onClick={() => setTab('equip')}>Equipamento</button>
        <button className={tab === 'forja' ? 'on' : ''} onClick={() => setTab('forja')}>Forja{canForge(species) ? '' : ' 🔒'}</button>
      </nav>

      {tab === 'equip' ? (
        <>
          <div className="eq-slots">
            {(Object.keys(SLOTS_EQ) as EquipSlot[]).map((k) => {
              const it = bySlug(equipped[k]);
              return (
                <button key={k} className={'eq-slot' + (slot === k ? ' on' : '') + (it ? ' has' : '')} onClick={() => setSlot(k)} style={it ? { borderColor: RARITIES[it.rarity].color } : undefined}>
                  <span aria-hidden>{it ? ICON[it.type] : '·'}</span>
                  <small>{SLOTS_EQ[k].label}</small>
                </button>
              );
            })}
          </div>
          <div className="eq-summary">
            <span>Ataque: <b>{atk.label}</b>{atk.affinity > 1 && <em> afinidade +5%</em>} · alcance {atk.range} m{atk.ranged === 'charged' ? ' (segure para carregar)' : ''}</span>
            <span>{Object.entries(bonus).filter(([, v]) => v).map(([k, v]) => `${ATTR[k]} ${v! > 0 ? '+' : ''}${v}%`).join(' · ') || 'Sem bônus'}</span>
          </div>
          <ul className="eq-list">
            {list.map((it) => {
              const own = ownsItem(it.slug), on = equipped[slot] === it.slug;
              return (
                <li key={it.slug} className={'eq-item' + (own ? '' : ' locked') + (on ? ' on' : '')}>
                  <span className="eq-icon" style={{ borderColor: RARITIES[it.rarity].color }} aria-hidden>{ICON[it.type]}</span>
                  <div>
                    <strong>{it.name}</strong> <small style={{ color: RARITIES[it.rarity].color }}>{RARITIES[it.rarity].label}{it.essence ? ` · ${ELEMENTS[it.essence].label}` : ''}</small>
                    <small className="d">{it.description}</small>
                    <small className="d">{Object.entries(it.stats).map(([k, v]) => `${ATTR[k]} ${v! > 0 ? '+' : ''}${Math.round(v! * RARITIES[it.rarity].statMul * 10) / 10}%`).join(' · ')}</small>
                  </div>
                  {own
                    ? <button className={on ? 'ghost' : 'primary'} onClick={() => { if (on) { const n = { ...equipped }; delete n[slot]; void save(n); } else void save(equip(equipped, it, items)); }}>{on ? 'Tirar' : 'Equipar'}</button>
                    : <small className="lock">Só na Forja</small>}
                </li>
              );
            })}
            {!list.length && <li className="empty">Nenhum item deste tipo no Arsenal ainda.</li>}
          </ul>
          {!TEST && <small className="hint">Itens são raros e só existem pela Forja — e só Companions da classe Taurina forjam.</small>}
        </>
      ) : (
        <ForgeList items={items} species={species} bond={c?.bond.level ?? 1} />
      )}
    </div>
  );
}

function ForgeList({ items, species, bond }: { items: ItemDef[]; species: string | null; bond: number }) {
  const mats = materials();
  const taurina = canForge(species as never);
  return (
    <div className="forge">
      {taurina
        ? <p className="hint">{SPECIES.touro.craft?.hint} Os ingredientes vêm dos monstros acalmados — a coleta chega com a batalha.</p>
        : <p className="hint">🔒 Só Companions da classe <b>Taurina</b> sabem forjar. Os outros conseguem itens com quem forja (troca e presentes, no mundo compartilhado).</p>}
      <ul className="eq-list">
        {items.map((it) => {
          const missing = forgeCheck(it, { species: species as never, bond, materials: mats });
          return (
            <li key={it.slug} className={'eq-item' + (missing.length ? ' locked' : '')}>
              <span className="eq-icon" style={{ borderColor: RARITIES[it.rarity].color }} aria-hidden>{ICON[it.type]}</span>
              <div>
                <strong>{it.name}</strong> <small style={{ color: RARITIES[it.rarity].color }}>{RARITIES[it.rarity].label}</small>
                <small className="d">{it.recipe.ingredients.map((g) => `${g.qty}× ${g.item}`).join(' · ')} · vínculo {it.recipe.minBond}</small>
                {missing.length > 0 && taurina && <small className="d why">Falta: {missing.join(' · ')}</small>}
              </div>
              <button className="primary" disabled={missing.length > 0} title={missing.join('\n') || 'Forjar'} onClick={() => useGame.getState().toast(`${it.name} forjado! (modo de teste: a forja de verdade grava no servidor junto com a coleta)`, 'gold')}>Forjar</button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
