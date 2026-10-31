/**
 * Loja de Áster: o modal do mercador (Comprar / Vender). Abre quando o Companion chega à porta de uma loja (marcador
 * "loja" do Estúdio da Cidade, clicado no prédio ou na placa). Preços e estoque vêm das regras (shared/rules/shop.ts);
 * o servidor confere tudo — aqui só se mostra e se pede.
 */
import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { SHOP_KINDS, goodsOf, bagSellPrice, valeSellPrice, bagEntries, MAX_BUY, type ShopKind, type ShopGood } from '@rules';
import { useGame } from '../store';
import { usePacto, uuid } from '../pacto/pactoStore';
import { useEcos, bagBatches, batchLabel } from '../ecos/ecosStore';

export const useShop = create<{ open: { name: string; kind: ShopKind } | null }>(() => ({ open: null }));
export const openShop = (name: string, kind: ShopKind) => useShop.setState({ open: { name, kind } });
const close = () => useShop.setState({ open: null });

export function ShopPanel() {
  const open = useShop((s) => s.open);
  const lumes = usePacto((s) => s.view?.lumes);
  const simulated = usePacto((s) => s.view?.simulated);
  const busy = usePacto((s) => s.busy);
  const [tab, setTab] = useState<'comprar' | 'vender'>('comprar');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  useEffect(() => { if (!open) return; setTab('comprar'); setMsg(null); void usePacto.getState().refresh(); void useEcos.getState().refresh(); }, [open]);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open]);
  if (!open) return null;
  const info = SHOP_KINDS[open.kind];

  const trade = async (action: 'pacto.shop.buy' | 'pacto.shop.sell', body: Record<string, unknown>, label: string) => {
    setMsg(null);
    const r = await usePacto.getState().call(action, { request: uuid(), ...body });
    if (!r?.shop) { setMsg({ text: usePacto.getState().error ?? 'Não deu certo.', ok: false }); usePacto.getState().clear(); return; }
    void useGame.getState().run((b) => b.state());
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
            ? <Buy kind={open.kind} lumes={lumes ?? 0} busy={!!busy} onBuy={(g, qty) => trade('pacto.shop.buy', { good: g.id, qty }, `${qty > 1 ? qty + '× ' : ''}${g.name}`)} />
            : <Sell busy={!!busy} onSell={(key, from, qty, label) => trade('pacto.shop.sell', { key, from, qty }, `Vendido ${qty > 1 ? qty + '× ' : ''}${label}`)} />}
        </div>
      </div>
    </div>
  );
}

function Qty({ max, value, set }: { max: number; value: number; set: (n: number) => void }) {
  return <input type="number" className="shop-qty" min={1} max={max} value={value} onChange={(e) => set(Math.max(1, Math.min(max, Math.round(Number(e.target.value) || 1))))} aria-label="Quantidade" />;
}

function Buy({ kind, lumes, busy, onBuy }: { kind: ShopKind; lumes: number; busy: boolean; onBuy: (g: ShopGood, qty: number) => void }) {
  const goods = goodsOf(kind);
  const [qty, setQty] = useState<Record<string, number>>({});
  if (!goods.length) return <p className="hint">O estoque da rotação chega em breve: itens raros, trocados todo dia e com quantidade limitada para o servidor inteiro.</p>;
  return (
    <>
      {goods.map((g) => {
        const q = g.kind === 'ferramenta' ? 1 : qty[g.id] ?? 1, total = g.price * q;
        return (
          <div key={g.id} className="shop-row">
            <span className="shop-icon" aria-hidden>{g.icon}</span>
            <div className="shop-info"><b>{g.name}</b><small>{g.description}{g.kind === 'ferramenta' ? ' Ferramenta com durabilidade.' : ''}</small></div>
            {g.kind === 'consumivel' && <Qty max={MAX_BUY} value={q} set={(n) => setQty({ ...qty, [g.id]: n })} />}
            <button className="primary" disabled={busy || total > lumes} title={total > lumes ? 'Lumes insuficientes' : 'Comprar'} onClick={() => onBuy(g, q)}>✧ {total}</button>
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
  const [qty, setQty] = useState<Record<string, number>>({});
  const rows = useMemo(() => {
    const out: { key: string; from: 'bolsa' | 'vale'; label: string; have: number; price: number }[] = [];
    const entries = bagEntries((inv ?? []).map((r) => ({ item_key: r.item_key, qty: r.qty, meta: r.meta })), items);
    for (const r of inv ?? []) {
      if (r.qty <= 0) continue;
      const price = bagSellPrice(r.item_key, r.meta, items);
      if (price != null) out.push({ key: r.item_key, from: 'bolsa', label: entries.find((e) => e.key === r.item_key)?.label ?? r.item_key, have: r.qty, price });
    }
    for (const b of bagBatches(ecos)) { const price = valeSellPrice(b.key); if (price != null) out.push({ key: b.key, from: 'vale', label: batchLabel(b.key), have: b.qty, price }); }
    return out;
  }, [inv, items, ecos]);
  if (!rows.length) return <p className="hint">Nada para vender agora. A loja compra materiais da coleta, drops dos monstros e os consumíveis que ela vende (por 40% do preço).</p>;
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
