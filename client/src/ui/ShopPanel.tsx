/**
 * Loja de Áster: o modal do mercador (Comprar / Vender). Abre quando o Companion chega à porta de uma loja (marcador
 * "loja" do Estúdio da Cidade, clicado no prédio ou na placa). Preços e estoque vêm das regras (shared/rules/shop.ts);
 * o servidor confere tudo — aqui só se mostra e se pede.
 */
import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { SHOP_KINDS, CITY_SCHOOLS, MATERIALS, bagSellPrice, valeSellPrice, bagEntries, entryBuyCheck, entryInfo, shopListing, type ShopKind, type ShopEntry } from '@rules';
import { useGame } from '../store';
import { usePacto, uuid } from '../pacto/pactoStore';
import { useShopConfig } from '../pacto/shopConfig';
import { useEcos, bagBatches, batchLabel } from '../ecos/ecosStore';

export const useShop = create<{ open: { name: string; kind: ShopKind } | null }>(() => ({ open: null }));
export const openShop = (name: string, kind: ShopKind) => useShop.setState({ open: { name, kind } });
const close = () => useShop.setState({ open: null });
const NONE: string[] = [];

export function ShopPanel() {
  const open = useShop((s) => s.open);
  const lumes = usePacto((s) => s.view?.lumes);
  const simulated = usePacto((s) => s.view?.simulated);
  const busy = usePacto((s) => s.busy);
  const [tab, setTab] = useState<'comprar' | 'vender'>('comprar');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  useEffect(() => { if (!open) return; setTab('comprar'); setMsg(null); void usePacto.getState().refresh(); void useEcos.getState().refresh(); void useShopConfig.getState().refresh(); }, [open]);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open]);
  if (!open) return null;
  const info = SHOP_KINDS[open.kind];

  const trade = async (action: 'pacto.shop.buy' | 'pacto.shop.sell', body: Record<string, unknown>, label: string) => {
    setMsg(null);
    const r = await usePacto.getState().call(action, { request: uuid(), ...body });
    if (!r?.shop) { setMsg({ text: usePacto.getState().error ?? 'Não deu certo.', ok: false }); usePacto.getState().clear(); return; }
    void useGame.getState().run((b) => b.state()); void useShopConfig.getState().refresh(); void useEcos.getState().refresh();
    const d = r.shop.delta;
    setMsg({ text: `${label}: ${d > 0 ? '+' : '−'}${Math.abs(d)} ✧`, ok: true });
    useGame.getState().toast(`${label} (${d > 0 ? '+' : '−'}${Math.abs(d)} Lumes)`, 'gold');
  };

  return (
    <div className="shop-back" role="dialog" aria-modal="true" aria-label={open.name} onClick={close}>
      <div className="shop framed" onClick={(e) => e.stopPropagation()}>
        <header className="shop-head">
          <div className="shop-face" aria-hidden>{info.icon}</div>
          <div className="shop-who">
            <h2>{open.name}</h2>
            <small>{info.merchant}</small>
            <p className="shop-say">“{info.greeting}”</p>
          </div>
          <div className="pacto-lumes" title="Lumes: a moeda de Áster e do Pacto">✧ <b>{lumes ?? '…'}</b> Lumes</div>
          <button className="close" onClick={close} aria-label="Fechar">✕</button>
        </header>
        {simulated && <p className="shop-note">Offline: compras simuladas neste aparelho, sem valor online.</p>}
        <nav className="st-tabs" aria-label="Loja">
          <button className={tab === 'comprar' ? 'on' : ''} onClick={() => setTab('comprar')}>Comprar</button>
          <button className={tab === 'vender' ? 'on' : ''} onClick={() => setTab('vender')}>Vender</button>
        </nav>
        {msg && <p className={'msg' + (msg.ok ? ' ok' : ' err')} role="status">{msg.text}</p>}
        <div className="shop-list">
          {tab === 'comprar'
            ? <Buy kind={open.kind} lumes={lumes ?? 0} busy={!!busy} onBuy={(e, name, qty) => trade('pacto.shop.buy', { entry: e.id, qty }, `${qty > 1 ? qty + '× ' : ''}${name}`)} />
            : <Sell busy={!!busy} onSell={(key, from, qty, label) => trade('pacto.shop.sell', { key, from, qty }, `Vendido ${qty > 1 ? qty + '× ' : ''}${label}`)} />}
        </div>
      </div>
    </div>
  );
}

function Qty({ max, value, set }: { max: number; value: number; set: (n: number) => void }) {
  return <input type="number" className="shop-qty" min={1} max={max} value={value} onChange={(e) => set(Math.max(1, Math.min(max, Math.round(Number(e.target.value) || 1))))} aria-label="Quantidade" />;
}

function Buy({ kind, lumes, busy, onBuy }: { kind: ShopKind; lumes: number; busy: boolean; onBuy: (e: ShopEntry, name: string, qty: number) => void }) {
  const { cfg, sold, day } = useShopConfig();
  const items = useGame((s) => s.items);
  const schools = usePacto((s) => s.view?.schools) ?? NONE;
  const vale = bagBatches(useEcos((s) => s.view));
  const [qty, setQty] = useState<Record<string, number>>({});
  const list = shopListing(cfg, kind, day);
  if (!list.length) return <p className="hint">{kind === 'rotacao' ? 'O Mercadão está vazio hoje. Volte amanhã: os itens mudam todo dia.' : 'Nada à venda agora.'}</p>;
  return (
    <>
      {kind === 'rotacao' && <p className="hint">Itens do dia: mudam à meia-noite e têm quantidade limitada para o servidor inteiro.</p>}
      {list.map((e) => {
        const info = entryInfo(e, items); if (!info) return null;
        const q = Math.min(e.maxBuy, qty[e.id] ?? 1), left = e.stock > 0 ? Math.max(0, e.stock - (sold[e.id] ?? 0)) : null;
        const why = entryBuyCheck(e, q, { lumes, sold: sold[e.id] ?? 0, schools, bag: vale });
        const req = [e.school ? `estudar na ${CITY_SCHOOLS[e.school].label}` : '', ...e.materials.map((m) => `${m.qty * q}× ${MATERIALS[m.material].name}`)].filter(Boolean);
        return (
          <div key={e.id} className="shop-row">
            <span className="shop-icon" aria-hidden>{info.icon}</span>
            <div className="shop-info">
              <b>{info.name}</b>
              <small>{info.description}{info.kind === 'ferramenta' ? ' Ferramenta com durabilidade.' : ''}</small>
              {(left != null || req.length > 0) && <small className="shop-req">{left != null ? `Restam ${left} hoje` : ''}{left != null && req.length ? ' · ' : ''}{req.length ? 'Pede: ' + req.join(', ') : ''}</small>}
            </div>
            {e.maxBuy > 1 && <Qty max={e.maxBuy} value={q} set={(n) => setQty({ ...qty, [e.id]: n })} />}
            <button className="primary" disabled={busy || !!why} title={why ?? 'Comprar'} onClick={() => onBuy(e, info.name, q)}>{left === 0 ? 'Esgotado' : `✧ ${e.price * q}`}</button>
          </div>
        );
      })}
    </>
  );
}

function Sell({ busy, onSell }: { busy: boolean; onSell: (key: string, from: 'bolsa' | 'vale', qty: number, label: string) => void }) {
  const inv = useGame((s) => s.snap?.inventory);
  const items = useGame((s) => s.items);
  const ecos = useEcos((s) => s.view);
  const cfg = useShopConfig((s) => s.cfg);
  const [qty, setQty] = useState<Record<string, number>>({});
  const rows = useMemo(() => {
    const out: { key: string; from: 'bolsa' | 'vale'; label: string; have: number; price: number }[] = [];
    const entries = bagEntries((inv ?? []).map((r) => ({ item_key: r.item_key, qty: r.qty, meta: r.meta })), items);
    for (const r of inv ?? []) {
      if (r.qty <= 0) continue;
      const price = bagSellPrice(r.item_key, r.meta, items, cfg);
      if (price != null) out.push({ key: r.item_key, from: 'bolsa', label: entries.find((e) => e.key === r.item_key)?.label ?? r.item_key, have: r.qty, price });
    }
    for (const b of bagBatches(ecos)) { const price = valeSellPrice(b.key); if (price != null) out.push({ key: b.key, from: 'vale', label: batchLabel(b.key), have: b.qty, price }); }
    return out;
  }, [inv, items, ecos, cfg]);
  if (!rows.length) return <p className="hint">Nada para vender agora. A loja compra materiais da coleta, drops dos monstros e os consumíveis que ela vende (por {Math.round(cfg.sellRate * 100)}% do preço).</p>;
  return (
    <>
      {rows.map((r) => {
        const q = Math.min(r.have, qty[r.key] ?? 1);
        return (
          <div key={r.from + r.key} className="shop-row">
            <span className="shop-icon" aria-hidden>{r.from === 'vale' ? '⛰' : '🎒'}</span>
            <div className="shop-info"><b>{r.label}</b><small>tem {r.have} · ✧ {r.price} cada</small></div>
            <Qty max={r.have} value={q} set={(n) => setQty({ ...qty, [r.key]: n })} />
            <button disabled={busy} onClick={() => onSell(r.key, r.from, q, r.label)}>Vender ✧ {r.price * q}</button>
          </div>
        );
      })}
    </>
  );
}
