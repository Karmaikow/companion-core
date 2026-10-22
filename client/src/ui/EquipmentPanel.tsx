/**
 * Equipamento (dentro do Inventário): os cinco espaços, os itens que o Companion tem e a Forja.
 * Itens são raros e só nascem na Forja — e só a classe Taurina forja, com receitas e ingredientes (drops dos monstros).
 * Enquanto a coleta de drops não existe (chega com a batalha), ninguém tem ingredientes; `?arsenal` libera tudo para teste.
 */
import { useMemo, useState } from 'react';
import { ITEM_TYPES, RARITIES, SLOTS_EQ, ELEMENTS, SPECIES, equip, equipmentBonus, forgeCheck, canForge, basicAttack, type EquipSlot, type Equipped, type ItemDef } from '@rules';
import { useGame } from '../store';
import { supabase } from '../backend/online';
import { ownsInstance, offhandMark } from '../pacto/pactoStore';
import { markSource } from '../scene/vitals';

markSource.get = offhandMark;

const TEST = typeof location !== 'undefined' && new URLSearchParams(location.search).has('arsenal');
/** Itens que o Companion tem: os de evento (starter) — e, no modo de teste, todos. */
export const ownsItem = (slug: string) => TEST || ownsInstance(slug) || !!useGame.getState().items.find((i) => i.slug === slug)?.starter;
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
                    : <small className="lock">Modelo do arsenal</small>}
                </li>
              );
            })}
            {!list.length && <li className="empty">Nenhum item deste tipo no Arsenal ainda.</li>}
          </ul>
          {!TEST && <small className="hint">Peças só nascem na Forja Primordial (Oficina do Pacto) — nenhuma vem de drop, baú ou recompensa.</small>}
        </>
      ) : (
        <div className="forge">
          <p className="hint">A forja agora acontece na <b>Oficina do Pacto das Cinco</b>: só Taurinas concluem equipamentos, com componentes que as outras classes preparam nos seus ofícios. As peças forjadas aparecem aqui para equipar.</p>
          <button className="primary" onClick={() => useGame.getState().setTab('pacto')}>Abrir a Oficina do Pacto</button>
        </div>
      )}
    </div>
  );
}

