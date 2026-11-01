/**
 * Lojas (painel do ADM): o que cada loja de Áster vende, por quanto e quanto, e o Mercadão rotativo.
 * Grava em game_config.values.shop; o servidor lê a cada compra (vale na hora, sem publicar nada).
 * - Lojas fixas: itens, preço, limite por compra, ativo/pausado.
 * - Mercadão: o mesmo, mais estoque diário global, peso no sorteio do dia, escola e materiais exigidos.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_SHOP, DEFAULT_ITEMS, SHOP_GOODS, SHOP_KINDS, SHOP_KIND_IDS, CITY_SCHOOLS, CITY_SCHOOL_IDS, MATERIALS, MAX_SHOP_ENTRIES,
  resolveShop, sanitizeItem, entryInfo, shopListing, shopDay, isWearable,
  type ShopConfig, type ShopEntry, type ShopKind, type ItemDef, type CitySchool,
} from '@rules';
import { supabase } from '../backend/online';

type Tab = ShopKind | 'geral';

export function ShopStudio() {
  const [values, setValues] = useState<Record<string, unknown> | null>(null);
  const [cfg, setCfg] = useState<ShopConfig>(DEFAULT_SHOP);
  const [saved, setSaved] = useState<string>('');
  const [items, setItems] = useState<ItemDef[]>(DEFAULT_ITEMS);
  const [sold, setSold] = useState<Record<string, number>>({});
  const [tab, setTab] = useState<Tab>('pocoes');
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const day = shopDay();

  useEffect(() => {
    void supabase().from('game_config').select('values').eq('id', 1).maybeSingle().then(({ data, error }) => {
      if (error) { setMsg({ text: 'Não consegui ler a configuração: ' + error.message }); return; }
      const v = (data?.values ?? {}) as Record<string, unknown>, c = resolveShop(v.shop);
      setValues(v); setCfg(c); setSaved(JSON.stringify(c));
    });
    void supabase().from('items').select('slug,name,data').eq('status', 'published').then(({ data }) => {
      const list = (data ?? []).map((r) => sanitizeItem({ ...(r.data as object), slug: r.slug, name: r.name })).filter((x): x is ItemDef => !!x);
      if (list.length) setItems([...list, ...DEFAULT_ITEMS.filter((d) => !isWearable(d.type) && !list.some((x) => x.slug === d.slug))]);
    });
    void supabase().from('shop_stock').select('entry,sold').eq('day', day).then(({ data }) => setSold(Object.fromEntries((data ?? []).map((r) => [r.entry as string, Number(r.sold)]))));
  }, [day]);

  const dirty = JSON.stringify(cfg) !== saved;
  const patch = (id: string, p: Partial<ShopEntry>) => setCfg((c) => ({ ...c, entries: c.entries.map((e) => (e.id === id ? { ...e, ...p } : e)) }));
  const remove = (id: string) => setCfg((c) => ({ ...c, entries: c.entries.filter((e) => e.id !== id) }));
  const add = (shop: ShopKind) => setCfg((c) => {
    const base = SHOP_GOODS.find((g) => g.shop === shop) ?? SHOP_GOODS[0];
    let id = `${shop}-${Date.now().toString(36)}`;
    while (c.entries.some((e) => e.id === id)) id += 'x';
    return { ...c, entries: [...c.entries, { id, shop, ref: { kind: 'loja', good: base.id }, price: base.price, maxBuy: base.kind === 'ferramenta' ? 1 : 10, enabled: true, stock: shop === 'rotacao' ? 5 : 0, weight: 1, school: null, materials: [] }] };
  });

  async function save() {
    setBusy(true); setMsg(null);
    const clean = resolveShop(cfg);
    const uid = (await supabase().auth.getUser()).data.user?.id;
    const next = { ...(values ?? {}), shop: clean };
    const { error } = await supabase().from('game_config').update({ values: next, updated_at: new Date().toISOString(), updated_by: uid }).eq('id', 1);
    setBusy(false);
    if (error) { setMsg({ text: 'Não consegui salvar: ' + error.message }); return; }
    setValues(next); setCfg(clean); setSaved(JSON.stringify(clean));
    setMsg({ ok: true, text: 'Lojas salvas: já vale na próxima compra de todos os jogadores.' });
  }

  const count = (k: ShopKind) => cfg.entries.filter((e) => e.shop === k).length;
  const entries = tab === 'geral' ? [] : cfg.entries.filter((e) => e.shop === tab);
  const today = useMemo(() => shopListing(cfg, 'rotacao', day), [cfg, day]);

  return (
    <div className="studio shop-studio">
      <aside className="studio-side">
        <h2>Lojas de Áster</h2>
        <small className="hint">Preços em Lumes. O que muda aqui vale na hora para todos (o jogo lê a cada compra).</small>
        <ul className="studio-nav">
          {SHOP_KIND_IDS.map((k) => (
            <li key={k}><button className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><strong>{SHOP_KINDS[k].icon} {SHOP_KINDS[k].label}</strong><small>{count(k)} {count(k) === 1 ? 'item' : 'itens'}{k === 'rotacao' ? ` · ${cfg.rotationPerDay} por dia` : ''}</small></button></li>
          ))}
          <li><button className={tab === 'geral' ? 'on' : ''} onClick={() => setTab('geral')}><strong>⚙ Geral</strong><small>revenda {Math.round(cfg.sellRate * 100)}% · Mercadão</small></button></li>
        </ul>
      </aside>

      <section className="studio-main">
        {tab === 'geral' ? (
          <div className="biome-form">
            <fieldset>
              <legend>Revenda</legend>
              <label>Quanto a loja paga pelo que ela mesma vende (% do preço)<input type="number" min={0} max={100} value={Math.round(cfg.sellRate * 100)} onChange={(e) => setCfg({ ...cfg, sellRate: Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100 })} /></label>
              <small className="hint">Materiais do Vale e drops de monstro têm preço próprio (pela raridade e qualidade).</small>
            </fieldset>
            <fieldset>
              <legend>🧺 Mercadão</legend>
              <label>Itens à venda por dia (sorteados pelo peso)<input type="number" min={0} max={30} value={cfg.rotationPerDay} onChange={(e) => setCfg({ ...cfg, rotationPerDay: Math.max(0, Math.min(30, Math.round(Number(e.target.value) || 0))) })} /></label>
              <small className="hint">A rotação e o estoque global viram à meia-noite (horário de Brasília). Hoje ({day}):</small>
              <ul className="shop-today">
                {today.map((e) => { const i = entryInfo(e, items); return <li key={e.id}>{i?.icon} {i?.name ?? e.id} · ✧ {e.price}{e.stock ? ` · vendidos ${sold[e.id] ?? 0}/${e.stock}` : ' · sem limite'}</li>; })}
                {!today.length && <li className="empty">Nada hoje: adicione itens ao Mercadão (com peso maior que 0).</li>}
              </ul>
            </fieldset>
            <fieldset>
              <legend>Recomeçar</legend>
              <button className="ghost danger" onClick={() => { if (window.confirm('Voltar todas as lojas ao estoque padrão? (só vale depois de salvar)')) setCfg(DEFAULT_SHOP); }}>Voltar ao estoque padrão</button>
            </fieldset>
          </div>
        ) : (
          <div className="biome-form">
            <header className="studio-main-head">
              <div>
                <h3>{SHOP_KINDS[tab].icon} {SHOP_KINDS[tab].label}</h3>
                <small className="hint">{tab === 'rotacao' ? 'Pool do Mercadão: a cada dia saem alguns destes (pelo peso), com estoque para o servidor inteiro.' : 'Estoque fixo: tudo o que estiver ativo aparece sempre.'}</small>
              </div>
              <button className="primary" disabled={cfg.entries.length >= MAX_SHOP_ENTRIES} onClick={() => add(tab)}>+ Adicionar item</button>
            </header>
            {!entries.length && <p className="empty">Nenhum item nesta loja.</p>}
            {entries.map((e) => <EntryRow key={e.id} e={e} items={items} sold={sold[e.id] ?? 0} today={today.some((x) => x.id === e.id)} onPatch={(p) => patch(e.id, p)} onRemove={() => remove(e.id)} />)}
          </div>
        )}

        <div className="studio-actions">
          {msg && <p className={'msg' + (msg.ok ? ' ok' : ' err')} role="status">{msg.text}</p>}
          {dirty && <small className="hint">Alterações não salvas.</small>}
          <button className="ghost" disabled={!dirty || busy} onClick={() => setCfg(JSON.parse(saved || JSON.stringify(DEFAULT_SHOP)))}>Desfazer</button>
          <button className="primary" disabled={!dirty || busy || !values} onClick={() => void save()}>Salvar lojas</button>
        </div>
      </section>
    </div>
  );
}

function EntryRow({ e, items, sold, today, onPatch, onRemove }: { e: ShopEntry; items: ItemDef[]; sold: number; today: boolean; onPatch: (p: Partial<ShopEntry>) => void; onRemove: () => void }) {
  const info = entryInfo(e, items);
  const rot = e.shop === 'rotacao';
  const refValue = e.ref.kind === 'loja' ? 'loja:' + e.ref.good : 'item:' + e.ref.slug;
  const setRef = (v: string) => {
    if (v.startsWith('loja:')) { const g = SHOP_GOODS.find((x) => x.id === v.slice(5))!; onPatch({ ref: { kind: 'loja', good: g.id }, price: g.price, maxBuy: g.kind === 'ferramenta' ? 1 : e.maxBuy }); }
    else onPatch({ ref: { kind: 'item', slug: v.slice(5) } });
  };
  const tool = info?.kind === 'ferramenta';
  return (
    <fieldset className={'shop-entry' + (e.enabled ? '' : ' off')}>
      <legend>{info?.icon} {info?.name ?? 'item que não existe mais'}{rot && today ? ' · à venda hoje' : ''}</legend>
      <div className="grid-form">
        <label className="span-2">Item
          <select value={refValue} onChange={(ev) => setRef(ev.target.value)}>
            <optgroup label="Da loja (poções, comidas, ferramentas)">{SHOP_GOODS.map((g) => <option key={g.id} value={'loja:' + g.id}>{g.icon} {g.name}</option>)}</optgroup>
            <optgroup label="Do Arsenal">{items.map((it) => <option key={it.slug} value={'item:' + it.slug}>{it.name}</option>)}</optgroup>
            {e.ref.kind === 'item' && !items.some((it) => it.slug === (e.ref as { slug: string }).slug) && <option value={refValue}>{e.ref.slug} (não publicado)</option>}
          </select>
        </label>
        <label>Preço (✧)<input type="number" min={0} value={e.price} onChange={(ev) => onPatch({ price: Math.max(0, Math.round(Number(ev.target.value) || 0)) })} /></label>
        <label>Máx. por compra<input type="number" min={1} max={999} disabled={tool} value={e.maxBuy} onChange={(ev) => onPatch({ maxBuy: Math.max(1, Math.round(Number(ev.target.value) || 1)) })} /></label>
        {rot && <label>Estoque por dia<input type="number" min={0} value={e.stock} onChange={(ev) => onPatch({ stock: Math.max(0, Math.round(Number(ev.target.value) || 0)) })} /><small className="hint">{e.stock ? `vendidos hoje: ${sold}` : '0 = sem limite'}</small></label>}
        {rot && <label>Peso no sorteio<input type="number" min={0} step={0.5} value={e.weight} onChange={(ev) => onPatch({ weight: Math.max(0, Number(ev.target.value) || 0) })} /><small className="hint">0 = nunca sai</small></label>}
        <label>Exige escola<select value={e.school ?? ''} onChange={(ev) => onPatch({ school: (ev.target.value || null) as CitySchool | null })}><option value="">nenhuma</option>{CITY_SCHOOL_IDS.map((k) => <option key={k} value={k}>{CITY_SCHOOLS[k].label}</option>)}</select></label>
      </div>
      <div className="shop-mats">
        <span className="hint">Materiais exigidos (saem da mochila junto com os Lumes):</span>
        {e.materials.map((m, i) => (
          <span key={i} className="list-row">
            <select value={m.material} onChange={(ev) => onPatch({ materials: e.materials.map((x, j) => (j === i ? { ...x, material: ev.target.value } : x)) })}>{Object.values(MATERIALS).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
            <input type="number" min={1} value={m.qty} onChange={(ev) => onPatch({ materials: e.materials.map((x, j) => (j === i ? { ...x, qty: Math.max(1, Math.round(Number(ev.target.value) || 1)) } : x)) })} />
            <button className="link" onClick={() => onPatch({ materials: e.materials.filter((_, j) => j !== i) })}>tirar</button>
          </span>
        ))}
        {e.materials.length < 6 && <button className="link" onClick={() => onPatch({ materials: [...e.materials, { material: Object.keys(MATERIALS)[0], qty: 1 }] })}>+ material</button>}
      </div>
      {info?.kind === 'item' && info.item && isWearable(info.item.type) && <small className="hint warn">Equipamento do Arsenal: pela regra do Pacto, equipamentos só nascem na forja. Venda só se for de propósito.</small>}
      <div className="cs-row">
        <label className="cs-check"><input type="checkbox" checked={e.enabled} onChange={(ev) => onPatch({ enabled: ev.target.checked })} /> à venda</label>
        <button className="link danger" onClick={onRemove}>remover</button>
      </div>
    </fieldset>
  );
}
