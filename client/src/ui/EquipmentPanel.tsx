/**
 * Inventário como um livro aberto de pergaminho. Aba Sacola: na página da esquerda o retrato no centro com os oito
 * espaços de equipamento em volta, a carga, o golpe e o cinto de ferramentas; na da direita a bolsa em grade (busca e
 * filtro por categoria) e o detalhe do item tocado. Aba Ficha: o personagem e os números da build. Tocar num espaço
 * filtra a bolsa pelo que entra nele. A Taurina vê também a aba Forja (leva à Oficina do Pacto). No celular, uma
 * página por vez.
 */
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import './inventory.css';
import {
  TIERS, tierOf, tierBlock,
  ITEM_TYPES, ITEM_CATEGORIES, RARITIES, SLOTS_EQ, EQUIP_SLOTS, ELEMENTS, ELEMENT_SETS, SET_TIERS, QUEST_REWARDS, LOAD_LABEL, TOOLS,
  equip, unequip, equippedItems, equipmentBonus, elementSets, slotsFor, isWearable, canForge, basicAttack, itemWeight, categoryOf,
  SPECIES, STAT_KEYS, STATS,
  type EquipSlot, type Equipped, type ItemCategory, type ItemDef, type ItemType, type BagEntry, type Element, type ToolKey,
} from '@rules';
import { useGame } from '../store';
import { useBuild } from '../build/buildStore';
import { combat } from '../build/combatStats';
import { MenuBook, type BookMenu } from './MenuBook';

const CompanionStage = lazy(() => import('../scene/CompanionStage'));
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

/** Inventário em forma de livro aberto (pergaminho): `onClose` fecha o livro. */
export function EquipmentPanel({ onClose, menu }: { onClose?: () => void; menu?: BookMenu } = {}) {
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
  const [book, setBook] = useState<'sacola' | 'ficha'>('sacola');
  const [page, setPage] = useState<'esq' | 'dir'>('dir');
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
  const bond = c?.bond.level ?? 1;
  const doEquip = (it: ItemDef, slot?: EquipSlot) => {
    const block = tierBlock(it, bond);
    if (block) { setMsg(block); return; }
    setMsg(null); void save(equip(equipped, it, items, slot));
  };
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

  const itemDetail = (sel: Row) => (
            <article className="inv-detail ib-detail" ref={detail} aria-label={sel.label}>
              <header>
                <span className="ic" aria-hidden>{sel.icon}</span>
                <div>
                  <strong>{sel.label}</strong>
                  <small>
                    {sel.item ? ITEM_TYPES[sel.item.type].label : ITEM_CATEGORIES[sel.category].label}
                    {sel.rarity && <> · <span style={{ color: RARITIES[sel.rarity].color }}>{RARITIES[sel.rarity].label}</span></>}
                    {sel.item && isWearable(sel.item.type) && <> · <span style={{ color: TIERS[tierOf(sel.item)].color }}>{TIERS[tierOf(sel.item)].label} {TIERS[tierOf(sel.item)].material}</span></>}
                    {sel.essence && <> · {ELEMENTS[sel.essence].label}</>}
                    {' · '}{kg(sel.unitWeight)}{sel.qty > 1 ? ` cada (${kg(sel.unitWeight * sel.qty)})` : ''}
                  </small>
                </div>
                <button type="button" className="close" aria-label="Fechar" onClick={() => setPick(null)}>×</button>
              </header>
              {sel.description && <p>{sel.description}</p>}
              {sel.item && Object.keys(sel.item.stats).length > 0 && <p className="stats">{Object.entries(sel.item.stats).map(([k, v]) => `${ATTR[k]} ${v! > 0 ? '+' : ''}${Math.round(v! * RARITIES[sel.item!.rarity].statMul * TIERS[tierOf(sel.item!)].stat * 10) / 10}%`).join(' · ')}</p>}
              {sel.item && ITEM_TYPES[sel.item.type].weapon && (() => { const w = basicAttack(sel.item); return <p className="stats">Golpe: alcance {String(w.range).replace('.', ',')} m · {String(w.cadence).replace('.', ',')}/s · dano ×{String(w.power).replace('.', ',')}{ITEM_TYPES[sel.item.type].weapon!.twoHanded ? ' · duas mãos' : ' · uma mão (também vai na mão esquerda)'}</p>; })()}
              {sel.item && isWearable(sel.item.type) && tierBlock(sel.item, bond) && <p className="msg err">{tierBlock(sel.item, bond)}</p>}
              {sel.item && ITEM_TYPES[sel.item.type].weapon && tierOf(sel.item) >= 3 && <p className="hint">{tierOf(sel.item) >= 5 ? 'T5: as técnicas desta arma estão na forma final.' : 'T3+: as técnicas desta arma evoluem (escolha o caminho em Habilidades).'}</p>}
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
  );

  // livro: página da esquerda (personagem) e da direita (sacola ou ficha); no celular, uma página por vez
  const art = useGame((s) => s.snap?.visualJob?.artUrl ?? null);
  const model = useGame((s) => s.snap?.visualJob?.model ?? null);
  const worn = useMemo(() => equippedItems(equipped, items).map((w) => w.item), [equipped, items]);
  const stage = (big = false) => (
    <div className={'ib-portrait' + (big ? ' big' : '') + (model ? ' live' : '')} style={{ ['--glow' as string]: glow }}>
      <span className="ib-emblem" aria-hidden />
      {model && c ? <Suspense fallback={<span className="ib-orb" aria-hidden />}><CompanionStage url={model.url} companionId={c.id} items={worn} /></Suspense>
        : art ? <img src={art} alt={`Retrato de ${name}`} /> : <span className="ib-orb" aria-hidden />}
      {model && <small className="ib-drag" aria-hidden>arraste para girar</small>}
    </div>
  );
  const glow = c?.discoveries.color ?? '#9fc9ff';
  const name = c?.discoveries.name ?? 'Companion';
  const SIDE_L: EquipSlot[] = ['head', 'cape', 'armor', 'feet'], SIDE_R: EquipSlot[] = ['mainhand', 'offhand', 'acc1', 'acc2'];
  const MIN_CELLS = 25;
  const empties = Math.max(MIN_CELLS - shown.length, (5 - (shown.length % 5)) % 5);
  const figure = (
    <div className="ib-figure">
      <div className="ib-col">{SIDE_L.map(slotCell)}</div>
      {stage()}
      <div className="ib-col">{SIDE_R.map(slotCell)}</div>
    </div>
  );
  const nameplate = (
    <div className="ib-name">
      <b>{name}</b>
      <small>{species ? SPECIES[species]?.label ?? species : 'Sem classe'}{c?.discoveries.element ? ` · ${ELEMENTS[c.discoveries.element as Element]?.label ?? ''}` : ''} · vínculo {bond}</small>
    </div>
  );

  return (
    <MenuBook title={book === 'sacola' ? 'Sacola' : 'Ficha'} icon={book === 'sacola' ? '🎒' : '📜'} menu={menu} onClose={onClose} className={'double page-' + page}
      sub={
        <nav className="ib-subtabs" role="tablist" aria-label="Seções do inventário">
          <button type="button" role="tab" aria-selected={book === 'sacola'} className={book === 'sacola' ? 'on' : ''} onClick={() => setBook('sacola')}><span aria-hidden>🎒</span>Sacola</button>
          <button type="button" role="tab" aria-selected={book === 'ficha'} className={book === 'ficha' ? 'on' : ''} onClick={() => setBook('ficha')}><span aria-hidden>📜</span>Ficha</button>
        </nav>
      }>
        <nav className="ib-switch" aria-label="Página">
          <button type="button" className={page === 'esq' ? 'on' : ''} onClick={() => setPage('esq')}>{book === 'sacola' ? 'Equipado' : 'Personagem'}</button>
          <button type="button" className={page === 'dir' ? 'on' : ''} onClick={() => setPage('dir')}>{book === 'sacola' ? 'Bolsa' : 'Atributos'}</button>
        </nav>

        {book === 'sacola' ? (
          <>
            <section className="ib-page ib-left" aria-label="Equipado">
              <div className={'ib-carry ' + carry.load.level} title={LOAD_LABEL[carry.load.level]}>
                <span>Carga <b>{kg(carry.carried)}</b> / {kg(carry.capacity)}</span>
                <div className="bar" role="progressbar" aria-label="Carga" aria-valuemin={0} aria-valuemax={carry.capacity} aria-valuenow={carry.carried}><i style={{ width: `${Math.min(100, carry.load.ratio * 100)}%` }} /></div>
              </div>
              {figure}
              <div className="ib-atk">
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
              <div className="ib-belt" aria-labelledby="ib-belt-t">
                <h4 id="ib-belt-t">Cinto de ferramentas</h4>
                <div className="inv-tools">{TOOL_ORDER.map(toolCell)}</div>
              </div>
              {pick?.kind === 'tool' && toolDetail(pick.tool)}
            </section>

            <section className="ib-page ib-right" aria-label="Bolsa">
              <div className="ib-bar">
                <nav className="inv-filters" role="tablist" aria-label="Categorias da bolsa">
                  {FILTERS.map((k) => (
                    <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => { setFilter(k); setSlotFilter(null); }} title={k === 'tudo' ? 'Tudo o que está na bolsa' : ITEM_CATEGORIES[k].hint}>
                      {FILTER_LABEL[k]} <em>{count(k)}</em>
                    </button>
                  ))}
                </nav>
                <input type="search" className="inv-search" placeholder="Buscar…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar na bolsa" />
              </div>
              {slotFilter && <p className="hint">Mostrando o que entra em <b>{SLOTS_EQ[slotFilter].label}</b>. <button className="link" onClick={() => setSlotFilter(null)}>Ver tudo</button></p>}
              {msg && <p className="msg err" role="alert">{msg}</p>}
              <ul className="ib-grid">
                {shown.map((r) => {
                  const on = r.item ? !!slotOf(r.item.slug) : false, open = pick?.kind === 'item' && pick.key === r.key;
                  return (
                    <li key={r.key}>
                      <button type="button" className={'inv-item' + (open ? ' sel' : '') + (on ? ' on' : '')} onClick={() => setPick(open ? null : { kind: 'item', key: r.key })}
                        style={r.rarity ? { ['--r' as string]: RARITIES[r.rarity].color } : undefined} title={r.label} aria-label={`${r.label}${r.qty > 1 ? `, ${r.qty}` : ''}${on ? ', equipado' : ''}`}>
                        <span className="ic" aria-hidden>{r.icon}</span>
                        {r.qty > 1 && <em className="qty">{r.qty}</em>}
                        {on && <em className="worn" aria-hidden>E</em>}
                        {r.item && isWearable(r.item.type) && <em className="tier" style={{ ['--t' as string]: TIERS[tierOf(r.item)].color }} aria-hidden>T{tierOf(r.item)}</em>}
                        {r.essence && <i className="el" style={{ background: ELEMENTS[r.essence].glow }} aria-hidden />}
                      </button>
                    </li>
                  );
                })}
                {Array.from({ length: empties }, (_, i) => <li key={'v' + i} className="ib-empty" aria-hidden><span /></li>)}
              </ul>
              {!shown.length && <p className="hint ib-none">{q ? 'Nada com esse nome.' : filter === 'material' ? 'Nada ainda. Monstros soltam materiais, e a coleta pelo mundo dá madeira, pedra e minério.' : filter === 'diversos' ? 'Nada ainda. Comida, chaves e lembranças aparecem aqui.' : slotFilter ? 'Nenhuma peça sua entra neste espaço.' : filter === 'tudo' ? 'A bolsa está vazia.' : 'Nenhuma peça ainda. Peças nascem na Forja (Taurinas) ou caem de monstros.'}</p>}
              {(filter === 'diversos' || filter === 'tudo') && <Collection inv={inv} />}
              {sel && itemDetail(sel)}
            </section>
          </>
        ) : (
          <>
            <section className="ib-page ib-left ib-sheet-left" aria-label="Personagem">
              <div className="ib-figure solo">
                {stage(true)}
              </div>
              {nameplate}
            </section>
            <section className="ib-page ib-right" aria-label="Atributos">
              <Sheet name={name} bond={bond} />
            </section>
          </>
        )}
    </MenuBook>
  );
}

/** Ficha do personagem: números de combate da build ativa e os pontos de atributo (como a "folha" do RPG). */
function Sheet({ name, bond }: { name: string; bond: number }) {
  const alloc = useBuild((s) => s.view?.active.alloc);
  const d = combat.d;
  const row = (a: string, av: string, b: string, bv: string) => (
    <div className="ib-stat"><span>{a}</span><b>{av}</b><span>{b}</span><b>{bv}</b></div>
  );
  const x = (n: number) => '×' + (Math.round(n * 100) / 100).toString().replace('.', ',');
  return (
    <div className="ib-sheet">
      <header>
        <div><small>Companion</small><b>{name}</b></div>
        <div><small>Vínculo</small><b>Nível {bond}</b></div>
      </header>
      <div className="ib-stats">
        {row('HP', String(Math.round(d.hpMax)), 'SP', String(Math.round(d.spMax)))}
        {row('Potência física', Math.round(d.physPower) + '%', 'Potência mágica', Math.round(d.magPower) + '%')}
        {row('Defesa física', String(Math.round(d.physDefense)), 'Resist. mágica', String(Math.round(d.magResist)))}
        {row('Vel. de ataque', x(d.attackSpeed), 'Movimento', x(d.moveSpeed))}
        {row('Precisão', Math.round(d.precision * 100) + '%', 'SP por segundo', (Math.round(d.spRegen * 10) / 10).toString().replace('.', ','))}
      </div>
      <h4>Atributos</h4>
      <div className="ib-attrs">
        {STAT_KEYS.map((k) => <div key={k} title={STATS[k].does}><span aria-hidden>{STATS[k].icon}</span><small>{STATS[k].short}</small><b>{alloc?.[k] ?? 0}</b></div>)}
      </div>
      <div className="row">
        <button type="button" className="primary" onClick={() => useGame.getState().setTab('skills')}>Distribuir pontos</button>
      </div>
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
