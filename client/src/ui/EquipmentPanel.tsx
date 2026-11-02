/**
 * Inventário: carga no topo; o que está equipado (os oito espaços e o golpe que eles dão); o cinto de ferramentas
 * (machado, picareta, foice e cinzel, que a coleta usa); e a bolsa com busca e filtro por categoria. Tocar num espaço
 * filtra a bolsa pelo que entra nele; tocar num item abre o detalhe com as ações (equipar, tirar, jogar fora).
 * A Taurina vê também a aba da Forja (que leva à Oficina do Pacto).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import './inventory.css';
import {
  ITEM_TYPES, ITEM_CATEGORIES, RARITIES, SLOTS_EQ, EQUIP_SLOTS, ELEMENTS, ELEMENT_SETS, SET_TIERS, QUEST_REWARDS, LOAD_LABEL, TOOLS,
  equip, unequip, equipmentBonus, elementSets, slotsFor, isWearable, canForge, basicAttack, itemWeight, categoryOf,
  type EquipSlot, type Equipped, type ItemCategory, type ItemDef, type ItemType, type BagEntry, type Element, type ToolKey,
} from '@rules';
import { useGame } from '../store';
import { supabase } from '../backend/online';
import { offhandMark, usePacto } from '../pacto/pactoStore';
import { markSource } from '../scene/vitals';
import { useEcos } from '../ecos/ecosStore';
import { ownsItem, useCarry } from './bag';
import { ItemIcon } from './itemIcons';
import { TOOL_INFO, TOOL_ORDER, ownedToolPieces, useToolBelt } from './toolBelt';

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
/** filtros da bolsa: tudo e as quatro categorias */
type Filter = 'tudo' | ItemCategory;
const FILTERS: Filter[] = ['tudo', 'arma', 'equipamento', 'material', 'diversos'];
const FILTER_LABEL: Record<Filter, string> = { tudo: 'Tudo', arma: 'Armas', equipamento: 'Equipamentos', material: 'Materiais', diversos: 'Diversos' };
const kg = (n: number) => `${Math.round(n * 10) / 10}`.replace('.', ',') + ' kg';
const pct = (v: number) => `${v > 0 ? '+' : ''}${String(v).replace('.', ',')}%`;

/** Uma linha da bolsa para mostrar: item da bolsa, peça forjada ou material da coleta. */
interface Row { key: string; label: string; icon: string; qty: number; unitWeight: number; category: ItemCategory; item: ItemDef | null; entry: BagEntry | null; vale?: boolean; rarity?: ItemDef['rarity']; essence?: Element | null; description: string }
/** O que está aberto no detalhe: um item da bolsa ou uma ferramenta do cinto. */
type Pick = { kind: 'item'; key: string } | { kind: 'tool'; tool: ToolKey } | null;

export function EquipmentPanel() {
  const items = useGame((s) => s.items);
  const equipped = useGame((s) => s.equipped);
  const setEquipped = useGame((s) => s.setEquipped);
  const backend = useGame((s) => s.backend);
  const c = useGame((s) => s.snap?.companion);
  const inv = useGame((s) => s.snap?.inventory ?? []);
  const equipment = usePacto((s) => s.view?.equipment);
  const beltOff = useToolBelt((s) => s.off);
  const species = c?.discoveries.form ?? null;
  const carry = useCarry();
  const [filter, setFilter] = useState<Filter>('tudo');
  const [query, setQuery] = useState('');
  const [slotFilter, setSlotFilter] = useState<EquipSlot | null>(null);
  const [pick, setPick] = useState<Pick>(null);
  const [mode, setMode] = useState<'bolsa' | 'forja'>('bolsa');
  const [msg, setMsg] = useState<string | null>(null);
  const detail = useRef<HTMLElement>(null);
  const awakened = c?.stage === 'awakened';
  // a mochila da coleta entra na carga e as ferramentas vêm do Pacto: carrega quando o painel abre
  useEffect(() => {
    if (!awakened) return;
    if (!useEcos.getState().view) void useEcos.getState().refresh();
    if (!usePacto.getState().view) void usePacto.getState().refresh();
  }, [awakened]);
  useEffect(() => { if (c?.id) useToolBelt.getState().load(c.id); }, [c?.id]);
  useEffect(() => { if (pick) detail.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [pick]);

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
  const tools = ownedToolPieces(equipment);

  // todas as linhas da bolsa
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = carry.entries.map((e) => ({
      key: e.key, label: e.label, icon: e.item ? TYPE_ICON[e.item.type] : e.category === 'material' ? '🧩' : '🎁', qty: e.qty, unitWeight: e.unitWeight,
      category: e.category, item: e.item, entry: e, rarity: e.rarity, essence: e.essence, description: e.description,
    }));
    for (const f of carry.forged) out.push({ key: f.slug, label: f.name, icon: TYPE_ICON[f.type], qty: 1, unitWeight: itemWeight(f), category: categoryOf(f.type), item: f, entry: null, rarity: f.rarity, essence: f.essence, description: f.description });
    // peças de evento ou do modo de teste que não estão na bolsa
    for (const it of items) if (isWearable(it.type) && !out.some((r) => r.key === it.slug) && ownsItem(it.slug)) out.push({ key: it.slug, label: it.name, icon: TYPE_ICON[it.type], qty: 1, unitWeight: itemWeight(it), category: categoryOf(it.type), item: it, entry: null, rarity: it.rarity, essence: it.essence, description: it.description });
    for (const v of carry.vale) out.push({ key: 'vale:' + v.key, label: v.label, icon: v.icon, qty: v.qty, unitWeight: v.unitWeight, category: 'material', item: null, entry: null, vale: true, description: 'Da mochila de coleta (vai para receitas, para a Oficina e para o refino na Casa dos Ecos).' });
    return out;
  }, [carry, items]);
  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) => (filter === 'tudo' || r.category === filter) && (!slotFilter || (r.item && slotsFor(r.item.type).includes(slotFilter))) && (!q || r.label.toLowerCase().includes(q)));
  const sel = pick?.kind === 'item' ? rows.find((r) => r.key === pick.key) ?? null : null;
  const count = (k: Filter) => rows.filter((r) => k === 'tudo' || r.category === k).reduce((t, r) => t + r.qty, 0);

  const clickSlot = (s: EquipSlot) => {
    const it = bySlug(equipped[s]);
    setSlotFilter(slotFilter === s ? null : s);
    setFilter(s === 'mainhand' ? 'arma' : s === 'offhand' && it && ITEM_TYPES[it.type].weapon ? 'arma' : 'equipamento');
    setPick(it ? { kind: 'item', key: it.slug } : null);
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
      <button key={s} type="button" className={'inv-slot' + (slotFilter === s ? ' on' : '') + (it ? ' has' : '')} onClick={() => clickSlot(s)}
        style={it ? { ['--r' as string]: RARITIES[it.rarity].color } : undefined} aria-label={`${SLOTS_EQ[s].label}: ${it ? it.name : 'vazio'}`} title={it ? `${SLOTS_EQ[s].label}: ${it.name}` : SLOTS_EQ[s].label}>
        <span className="ic" aria-hidden>{it ? TYPE_ICON[it.type] : SLOT_ICON[s]}</span>
        <small>{it ? it.name : SLOTS_EQ[s].short}</small>
        {it?.essence && <i className="el" style={{ background: ELEMENTS[it.essence].glow }} aria-hidden />}
      </button>
    );
  };

  const toolCell = (t: ToolKey) => {
    const piece = tools[t], on = !!piece && !beltOff[t];
    const open = pick?.kind === 'tool' && pick.tool === t;
    return (
      <button key={t} type="button" className={'inv-tool' + (piece ? ' has' : '') + (on ? ' on' : '') + (open ? ' sel' : '')} onClick={() => setPick(open ? null : { kind: 'tool', tool: t })}
        aria-label={`${TOOLS[t].label}: ${piece ? (on ? 'no cinto' : 'guardada') : 'não tem'}`}>
        <span className="ic" aria-hidden>{TOOLS[t].icon}</span>
        <small>{TOOLS[t].label.split(' ')[0]}</small>
        {piece && <span className="dur" aria-hidden><i style={{ width: `${Math.round((piece.durability / Math.max(1, piece.maxDurability)) * 100)}%` }} /></span>}
        {on && <em className="worn" aria-hidden>✓</em>}
      </button>
    );
  };

  const toolDetail = (t: ToolKey) => {
    const piece = tools[t], on = !!piece && !beltOff[t];
    return (
      <article className="inv-detail" ref={detail} aria-label={TOOLS[t].label}>
        <header>
          <span className="ic" aria-hidden>{TOOLS[t].icon}</span>
          <div>
            <strong>{piece?.name ?? TOOLS[t].label}</strong>
            <small>Ferramenta de coleta{piece ? ` · durabilidade ${piece.durability}/${piece.maxDurability}` : ' · você ainda não tem'}</small>
          </div>
          <button type="button" className="close" aria-label="Fechar" onClick={() => setPick(null)}>×</button>
        </header>
        <p>{TOOL_INFO[t].use}</p>
        {piece ? (
          <>
            <p className="hint">{on ? 'No cinto: vai para a mão quando a coleta pede esta ferramenta. Cada uso gasta 1 de durabilidade.' : 'Guardada: as coletas que pedem esta ferramenta ficam bloqueadas até você equipar.'}</p>
            <div className="row">
              <button type="button" className={on ? 'ghost' : 'primary'} onClick={() => useToolBelt.getState().set(t, !on)}>{on ? 'Tirar do cinto' : 'Equipar no cinto'}</button>
            </div>
          </>
        ) : <p className="hint">Onde conseguir: {TOOL_INFO[t].where}</p>}
      </article>
    );
  };

  return (
    <div className="bag-panel inv">
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
          <div className={'inv-carry ' + carry.load.level} title={LOAD_LABEL[carry.load.level]}>
            <span><b>Carga</b> {kg(carry.carried)} / {kg(carry.capacity)}</span>
            <div className="bar" role="progressbar" aria-label="Carga" aria-valuemin={0} aria-valuemax={carry.capacity} aria-valuenow={carry.carried}><i style={{ width: `${Math.min(100, carry.load.ratio * 100)}%` }} /></div>
            {carry.load.level !== 'leve' && <small>{LOAD_LABEL[carry.load.level]}</small>}
          </div>

          <section className="inv-card" aria-labelledby="inv-eq">
            <h4 id="inv-eq">Equipado</h4>
            <div className="inv-slots">{EQUIP_SLOTS.map(slotCell)}</div>
            <div className="inv-atk">
              <span className="atk"><b>{atk.label}</b> · alcance {String(atk.range).replace('.', ',')} m{atk.affinity > 1 ? ' · afinidade +5%' : ''}{atk.ranged === 'charged' ? ' · segure para carregar' : ''}</span>
              <span className="chips">
                {Object.entries(bonus).filter(([, v]) => v).map(([k, v]) => <em key={k}>{ATTR[k]} {pct(v!)}</em>)}
                {!Object.values(bonus).some(Boolean) && <em className="none">Sem bônus de atributo</em>}
              </span>
              {sets.length > 0 && (
                <ul className="inv-sets">
                  {sets.map((s) => (
                    <li key={s.element} className={s.tier ? 'on' : ''} title={ELEMENT_SETS[s.element].note}>
                      <i style={{ background: ELEMENTS[s.element].glow }} aria-hidden /> {ELEMENT_SETS[s.element].label} {s.pieces}/{s.next ?? SET_TIERS[SET_TIERS.length - 1].pieces}
                      {s.tier ? <small> · {Object.entries(s.bonus).map(([k, v]) => `${ATTR[k]} +${String(v).replace('.', ',')}%`).join(' · ')}</small> : <small> · bônus com {SET_TIERS[0].pieces} peças</small>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="inv-card" aria-labelledby="inv-tools">
            <h4 id="inv-tools">Ferramentas <small>para a coleta</small></h4>
            <div className="inv-tools">{TOOL_ORDER.map(toolCell)}</div>
          </section>
          {pick?.kind === 'tool' && toolDetail(pick.tool)}

          <section className="inv-card inv-bag" aria-labelledby="inv-bag">
            <h4 id="inv-bag">Bolsa</h4>
            <div className="inv-tools-bar">
              <input type="search" className="inv-search" placeholder="Buscar na bolsa…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar na bolsa" />
            </div>
            <nav className="inv-filters" role="tablist" aria-label="Categorias da bolsa">
              {FILTERS.map((k) => (
                <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => { setFilter(k); setSlotFilter(null); }} title={k === 'tudo' ? 'Tudo o que está na bolsa' : ITEM_CATEGORIES[k].hint}>
                  {FILTER_LABEL[k]} <em>{count(k)}</em>
                </button>
              ))}
            </nav>
            {slotFilter && <p className="hint">Mostrando o que entra em <b>{SLOTS_EQ[slotFilter].label}</b>. <button className="link" onClick={() => setSlotFilter(null)}>Ver tudo</button></p>}
            {msg && <p className="msg err" role="alert">{msg}</p>}
            <ul className="inv-grid">
              {shown.map((r) => {
                const on = r.item ? !!slotOf(r.item.slug) : false, open = pick?.kind === 'item' && pick.key === r.key;
                return (
                  <li key={r.key}>
                    <button type="button" className={'inv-item' + (open ? ' sel' : '') + (on ? ' on' : '')} onClick={() => setPick(open ? null : { kind: 'item', key: r.key })}
                      style={r.rarity ? { ['--r' as string]: RARITIES[r.rarity].color } : undefined} title={r.label}>
                      <span className="ic" aria-hidden>{r.icon}</span>
                      {r.qty > 1 && <em className="qty">{r.qty}</em>}
                      {on && <em className="worn" aria-label="equipado">E</em>}
                      {r.essence && <i className="el" style={{ background: ELEMENTS[r.essence].glow }} aria-hidden />}
                      <small>{r.label}</small>
                    </button>
                  </li>
                );
              })}
              {!shown.length && <li className="empty">{q ? 'Nada com esse nome.' : filter === 'material' ? 'Nada ainda. Monstros soltam materiais, e a coleta pelo mundo dá madeira, pedra e minério.' : filter === 'diversos' ? 'Nada ainda. Comida, chaves e lembranças aparecem aqui.' : slotFilter ? 'Nenhuma peça sua entra neste espaço.' : filter === 'tudo' ? 'A bolsa está vazia.' : 'Nenhuma peça ainda. Peças nascem na Forja (Taurinas) ou caem de monstros.'}</li>}
            </ul>
          </section>

          {sel && (
            <article className="inv-detail" ref={detail} aria-label={sel.label}>
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
              </div>
            </article>
          )}

          {(filter === 'diversos' || filter === 'tudo') && <Collection inv={inv} />}
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
    <section className="inv-card">
      <h4>Descobertas que faltam <small>{slots.length - missing.length}/{slots.length}</small></h4>
      <div className="inventory">
        {missing.map((r) => (
          <div key={r.item} className="slot" title="Ainda não descoberto">
            <ItemIcon item={r.item} tint={tint} size={36} locked />
            <strong>???</strong>
            <small>Conclua uma quest para encontrar</small>
          </div>
        ))}
      </div>
    </section>
  );
}
