/**
 * Bolsa e equipamento (Inventário): os oito espaços do equipamento (chapéu, acessório 1 e 2, capa, armadura, mão
 * direita, mão esquerda, sapatos), o resumo (golpe, bônus, conjuntos de elemento, carga) e a bolsa por categoria:
 * Materiais, Diversos, Equipamentos e Armas. Tocar num espaço mostra só o que entra nele; tocar num item mostra os
 * detalhes e as ações (equipar, tirar, jogar fora).
 * A Taurina vê também a aba da Forja (que leva à Oficina do Pacto).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ITEM_TYPES, ITEM_CATEGORIES, RARITIES, SLOTS_EQ, EQUIP_SLOTS, ELEMENTS, ELEMENT_SETS, SET_TIERS, QUEST_REWARDS, LOAD_LABEL,
  equip, unequip, equipmentBonus, elementSets, slotsFor, isWearable, canForge, basicAttack, itemWeight, categoryOf,
  type EquipSlot, type Equipped, type ItemCategory, type ItemDef, type ItemType, type BagEntry, type Element,
} from '@rules';
import { useGame } from '../store';
import { supabase } from '../backend/online';
import { offhandMark } from '../pacto/pactoStore';
import { markSource } from '../scene/vitals';
import { useEcos } from '../ecos/ecosStore';
import { ownsItem, useCarry } from './bag';
import { ItemIcon } from './itemIcons';

export { ownsItem };
markSource.get = offhandMark;

const ATTR: Record<string, string> = { vida: 'Vida', energia: 'Energia', poder: 'Poder', defesa: 'Defesa', agilidade: 'Agilidade', sintonia: 'Sintonia' };
export const TYPE_ICON: Record<ItemType, string> = {
  espada: '🗡', faca: '🔪', maca: '🔨', lanca: '🔱', cajado: '🪄', varinha: '✨', arco: '🏹', escudo: '🛡', grimorio: '📖', orbe: '🔮',
  chapeu: '🎩', tiara: '👑', laco: '🎀', coroa: '🌸', elmo: '⛑', armadura: '🥋', tunica: '👘', botas: '👢', capa: '🧣', mochila: '🎒', aljava: '🏹',
  amuleto: '📿', anel: '💍', bracelete: '⭕', madeira: '🪵', minerio: '⛏', pedra: '🪨', fibra: '🧶', erva: '🌿', gema: '💎', essencia: '🌫',
  parte: '🦴', comida: '🍎', pocao: '🧪', chave: '🗝', lembranca: '📜', outro: '📦',
};
const SLOT_ICON: Record<EquipSlot, string> = { head: '🎩', acc1: '💍', acc2: '📿', cape: '🧣', armor: '🥋', mainhand: '🗡', offhand: '🛡', feet: '👢' };
const TABS: ItemCategory[] = ['material', 'diversos', 'equipamento', 'arma'];
const kg = (n: number) => `${Math.round(n * 10) / 10}`.replace('.', ',') + ' kg';

/** Uma linha da bolsa para mostrar: item da bolsa, peça forjada ou material do vale. */
interface Row { key: string; label: string; icon: string; qty: number; unitWeight: number; category: ItemCategory; item: ItemDef | null; entry: BagEntry | null; vale?: boolean; rarity?: ItemDef['rarity']; essence?: Element | null; description: string }

export function EquipmentPanel() {
  const items = useGame((s) => s.items);
  const equipped = useGame((s) => s.equipped);
  const setEquipped = useGame((s) => s.setEquipped);
  const backend = useGame((s) => s.backend);
  const c = useGame((s) => s.snap?.companion);
  const inv = useGame((s) => s.snap?.inventory ?? []);
  const species = c?.discoveries.form ?? null;
  const carry = useCarry();
  const [tab, setTab] = useState<ItemCategory>('arma');
  const [slotFilter, setSlotFilter] = useState<EquipSlot | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [mode, setMode] = useState<'bolsa' | 'forja'>('bolsa');
  const [msg, setMsg] = useState<string | null>(null);
  const awakened = c?.stage === 'awakened';
  // a mochila do vale entra na carga: carrega quando o painel abre
  useEffect(() => { if (awakened && !useEcos.getState().view) void useEcos.getState().refresh(); }, [awakened]);

  async function save(next: Equipped) {
    setEquipped(next);
    if (!c) return;
    try {
      if (backend?.kind === 'online') await supabase().from('companion_equipment').upsert({ companion_id: c.id, equipped: next, updated_at: new Date().toISOString() });
      else localStorage.setItem('companion-core:equipped:' + c.id, JSON.stringify(next));
    } catch { /* fica só nesta sessão */ }
  }
  const bySlug = (s?: string) => (s ? items.find((i) => i.slug === s) : undefined);
  const bonus = equipmentBonus(equipped, items);
  const sets = elementSets(equipped, items);
  const atk = basicAttack(bySlug(equipped.mainhand) ?? null, species);

  // todas as linhas da bolsa, por categoria
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = carry.entries.map((e) => ({
      key: e.key, label: e.label, icon: e.item ? TYPE_ICON[e.item.type] : e.category === 'material' ? '🧩' : '🎁', qty: e.qty, unitWeight: e.unitWeight,
      category: e.category, item: e.item, entry: e, rarity: e.rarity, essence: e.essence, description: e.description,
    }));
    for (const f of carry.forged) out.push({ key: f.slug, label: f.name, icon: TYPE_ICON[f.type], qty: 1, unitWeight: itemWeight(f), category: categoryOf(f.type), item: f, entry: null, rarity: f.rarity, essence: f.essence, description: f.description });
    // peças de evento ou do modo de teste que não estão na bolsa
    for (const it of items) if (isWearable(it.type) && !out.some((r) => r.key === it.slug) && ownsItem(it.slug)) out.push({ key: it.slug, label: it.name, icon: TYPE_ICON[it.type], qty: 1, unitWeight: itemWeight(it), category: categoryOf(it.type), item: it, entry: null, rarity: it.rarity, essence: it.essence, description: it.description });
    for (const v of carry.vale) out.push({ key: 'vale:' + v.key, label: v.label, icon: v.icon, qty: v.qty, unitWeight: v.unitWeight, category: 'material', item: null, entry: null, vale: true, description: 'Da mochila do Vale dos Ecos (vai para receitas e para a Oficina).' });
    return out;
  }, [carry, items]);
  const shown = rows.filter((r) => r.category === tab && (!slotFilter || (r.item && slotsFor(r.item.type).includes(slotFilter))));
  const sel = rows.find((r) => r.key === pick) ?? null;
  const count = (k: ItemCategory) => rows.filter((r) => r.category === k).reduce((t, r) => t + r.qty, 0);

  const clickSlot = (s: EquipSlot) => {
    const it = bySlug(equipped[s]);
    setSlotFilter(slotFilter === s ? null : s);
    setTab(s === 'mainhand' ? 'arma' : s === 'offhand' && it && ITEM_TYPES[it.type].weapon ? 'arma' : 'equipamento');
    if (it) setPick(it.slug);
  };
  const doEquip = (it: ItemDef, slot?: EquipSlot) => { setMsg(null); void save(equip(equipped, it, items, slot)); };
  const doUnequip = (slot: EquipSlot) => { setMsg(null); void save(unequip(equipped, slot)); };
  const slotOf = (slug: string) => EQUIP_SLOTS.find((s) => equipped[s] === slug) ?? null;
  async function discard(r: Row, qty: number) {
    if (!r.entry) return;
    const err = await useGame.getState().bagAction('inventory.discard', { key: r.key, qty });
    setMsg(err);
    if (!err && r.qty - qty <= 0) setPick(null);
  }

  const slotCell = (s: EquipSlot) => {
    const it = bySlug(equipped[s]);
    return (
      <button key={s} type="button" className={'doll-slot' + (slotFilter === s ? ' on' : '') + (it ? ' has' : '')} onClick={() => clickSlot(s)}
        style={it ? { borderColor: RARITIES[it.rarity].color } : undefined} aria-label={`${SLOTS_EQ[s].label}: ${it ? it.name : 'vazio'}`} title={SLOTS_EQ[s].label}>
        <span className="ic" aria-hidden>{it ? TYPE_ICON[it.type] : SLOT_ICON[s]}</span>
        <small>{it ? it.name : SLOTS_EQ[s].short}</small>
        {it?.essence && <i className="el" style={{ background: ELEMENTS[it.essence].glow }} aria-hidden />}
      </button>
    );
  };

  return (
    <div className="bag-panel">
      {canForge(species) && (
        <nav className="st-tabs" aria-label="Bolsa ou Forja">
          <button className={mode === 'bolsa' ? 'on' : ''} onClick={() => setMode('bolsa')}>Bolsa e equipamento</button>
          <button className={mode === 'forja' ? 'on' : ''} onClick={() => setMode('forja')}>Forja</button>
        </nav>
      )}
      {mode === 'forja' ? (
        <div className="forge">
          <p className="hint">A forja acontece na <b>Oficina do Pacto das Cinco</b>: só Taurinas concluem equipamentos, com componentes que as outras classes preparam nos seus ofícios. As peças forjadas aparecem aqui para equipar.</p>
          <button className="primary" onClick={() => useGame.getState().setTab('pacto')}>Abrir a Oficina do Pacto</button>
        </div>
      ) : (
        <>
          <section className="doll" aria-label="Equipamento">
            <div className="doll-col">{EQUIP_SLOTS.slice(0, 4).map(slotCell)}</div>
            <div className="doll-mid">
              <div className="doll-atk"><b>{atk.label}</b>{atk.affinity > 1 && <em> afinidade +5%</em>}<small>alcance {String(atk.range).replace('.', ',')} m{atk.ranged === 'charged' ? ' · segure para carregar' : ''}</small></div>
              <div className="doll-bonus">{Object.entries(bonus).filter(([, v]) => v).map(([k, v]) => <span key={k}>{ATTR[k]} {v! > 0 ? '+' : ''}{String(v).replace('.', ',')}%</span>)}{!Object.values(bonus).some(Boolean) && <span className="hint">Sem bônus</span>}</div>
              {sets.length > 0 && (
                <ul className="doll-sets">
                  {sets.map((s) => (
                    <li key={s.element} className={s.tier ? 'on' : ''} title={ELEMENT_SETS[s.element].note}>
                      <i style={{ background: ELEMENTS[s.element].glow }} aria-hidden /> {ELEMENT_SETS[s.element].label} {s.pieces}/{s.next ?? SET_TIERS[SET_TIERS.length - 1].pieces}
                      {s.tier ? <small> · {Object.entries(s.bonus).map(([k, v]) => `${ATTR[k]} +${String(v).replace('.', ',')}%`).join(' · ')}</small> : <small> · bônus com {SET_TIERS[0].pieces} peças</small>}
                    </li>
                  ))}
                </ul>
              )}
              <div className={'carry ' + carry.load.level} title={LOAD_LABEL[carry.load.level]}>
                <span>Carga {kg(carry.carried)} / {kg(carry.capacity)}</span>
                <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={carry.capacity} aria-valuenow={carry.carried}><i style={{ width: `${Math.min(100, carry.load.ratio * 100)}%` }} /></div>
                {carry.load.level !== 'leve' && <small>{LOAD_LABEL[carry.load.level]}</small>}
              </div>
            </div>
            <div className="doll-col">{EQUIP_SLOTS.slice(4).map(slotCell)}</div>
          </section>

          <nav className="bag-tabs" role="tablist" aria-label="Categorias da bolsa">
            {TABS.map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={'chip' + (tab === k ? ' on' : '')} onClick={() => { setTab(k); setSlotFilter(null); }} title={ITEM_CATEGORIES[k].hint}>
                {ITEM_CATEGORIES[k].icon} {ITEM_CATEGORIES[k].label} <em>{count(k)}</em>
              </button>
            ))}
          </nav>
          {slotFilter && <p className="hint">Mostrando o que entra em <b>{SLOTS_EQ[slotFilter].label}</b> <button className="link" onClick={() => setSlotFilter(null)}>ver tudo</button></p>}
          {msg && <p className="msg err" role="alert">{msg}</p>}

          <ul className="bag-grid">
            {shown.map((r) => {
              const on = r.item ? !!slotOf(r.item.slug) : false;
              return (
                <li key={r.key}>
                  <button type="button" className={'bag-item' + (pick === r.key ? ' sel' : '') + (on ? ' on' : '')} onClick={() => setPick(pick === r.key ? null : r.key)} style={r.rarity ? { borderColor: RARITIES[r.rarity].color } : undefined}>
                    <span className="ic" aria-hidden>{r.icon}</span>
                    {r.qty > 1 && <em className="qty">{r.qty}</em>}
                    {on && <em className="worn" aria-label="equipado">E</em>}
                    {r.essence && <i className="el" style={{ background: ELEMENTS[r.essence].glow }} aria-hidden />}
                    <small>{r.label}</small>
                  </button>
                </li>
              );
            })}
            {!shown.length && <li className="empty">{tab === 'material' ? 'Nada ainda. Monstros soltam materiais e o Vale dos Ecos dá madeira, pedra e minério.' : tab === 'diversos' ? 'Nada ainda. Comida, chaves e lembranças aparecem aqui.' : slotFilter ? 'Nenhuma peça sua entra neste espaço.' : 'Nenhuma peça ainda. Peças nascem na Forja (Taurinas) ou caem de monstros.'}</li>}
          </ul>

          {sel && (
            <article className="bag-detail" aria-label={sel.label}>
              <header>
                <span className="ic" aria-hidden>{sel.icon}</span>
                <div>
                  <strong>{sel.label}</strong>
                  <small>
                    {sel.item ? ITEM_TYPES[sel.item.type].label : ITEM_CATEGORIES[sel.category].label}
                    {sel.rarity && <> · <span style={{ color: RARITIES[sel.rarity].color }}>{RARITIES[sel.rarity].label}</span></>}
                    {sel.essence && <> · {ELEMENTS[sel.essence].label}</>}
                    {' · '}{kg(sel.unitWeight)}{sel.qty > 1 ? ` cada (${kg(sel.unitWeight * sel.qty)})` : ''}
                  </small>
                </div>
                <button type="button" className="close" aria-label="Fechar" onClick={() => setPick(null)}>×</button>
              </header>
              {sel.description && <p>{sel.description}</p>}
              {sel.item && Object.keys(sel.item.stats).length > 0 && <p className="stats">{Object.entries(sel.item.stats).map(([k, v]) => `${ATTR[k]} ${v! > 0 ? '+' : ''}${Math.round(v! * RARITIES[sel.item!.rarity].statMul * 10) / 10}%`).join(' · ')}</p>}
              {sel.item && ITEM_TYPES[sel.item.type].weapon && (() => { const w = basicAttack(sel.item); return <p className="stats">Golpe: alcance {String(w.range).replace('.', ',')} m · {String(w.cadence).replace('.', ',')}/s · dano ×{String(w.power).replace('.', ',')}{ITEM_TYPES[sel.item.type].weapon!.twoHanded ? ' · duas mãos' : ' · uma mão (também vai na mão esquerda)'}</p>; })()}
              <div className="row">
                {sel.item && isWearable(sel.item.type) && (() => {
                  const it = sel.item!, cur = slotOf(it.slug), opts = slotsFor(it.type);
                  if (cur) return <button className="ghost" onClick={() => doUnequip(cur)}>Tirar ({SLOTS_EQ[cur].short})</button>;
                  return opts.length > 1
                    ? opts.map((s) => <button key={s} className="primary" onClick={() => doEquip(it, s)}>Equipar: {SLOTS_EQ[s].short}</button>)
                    : <button className="primary" onClick={() => doEquip(it, opts[0])}>Equipar</button>;
                })()}
                {sel.entry && !sel.entry.item?.slug.startsWith('inst-') && sel.category !== 'diversos' && !(sel.item && slotOf(sel.item.slug) && sel.qty <= 1) && (
                  <>
                    <button className="ghost" onClick={() => void discard(sel, 1)}>Jogar fora 1</button>
                    {sel.qty > 1 && !(sel.item && slotOf(sel.item.slug)) && <button className="ghost" onClick={() => void discard(sel, sel.qty)}>Jogar fora todos</button>}
                  </>
                )}
                {sel.vale && <button className="ghost" onClick={() => useGame.getState().setTab('ecos')}>Abrir o Vale dos Ecos</button>}
              </div>
            </article>
          )}

          {tab === 'diversos' && <Collection inv={inv} />}
        </>
      )}
    </div>
  );
}

/** Coleção das quests: as descobertas que faltam aparecem como "???". */
function Collection({ inv }: { inv: { item_key: string }[] }) {
  const tint = useGame((s) => s.snap?.companion?.discoveries.color ?? '#9fc9ff');
  const slots = Object.values(QUEST_REWARDS);
  const missing = slots.filter((r) => !inv.some((i) => i.item_key === r.item));
  if (!missing.length) return null;
  return (
    <>
      <h3 className="rare-title">Descobertas que faltam <small>{slots.length - missing.length}/{slots.length}</small></h3>
      <div className="inventory">
        {missing.map((r) => (
          <div key={r.item} className="slot" title="Ainda não descoberto">
            <ItemIcon item={r.item} tint={tint} size={36} locked />
            <strong>???</strong>
            <small>Conclua uma quest para encontrar</small>
          </div>
        ))}
      </div>
    </>
  );
}
