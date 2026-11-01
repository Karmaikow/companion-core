/**
 * Mural de trocas (aba da Casa dos Ecos): pedidos abertos de outros Companions (aceitar quando você tem o que foi
 * pedido), os seus (cancelar devolve a garantia) e um pedido novo — vender materiais por Lumes, comprar com Lumes
 * ou trocar materiais. A oferta fica guardada ao abrir; aceitar troca as duas partes numa transação só (servidor).
 */
import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import {
  TRADE, MATERIALS, CATEGORIES, PROP_LABEL, BAND_LABEL, offerText, wantText, tradeKind, pickForWant,
  type TradeOffer, type TradeWant, type PropKey, type Band,
} from '@rules';
import { useGame } from '../store';
import { useEcos, bagBatches, batchLabel } from '../ecos/ecosStore';
import { usePacto } from '../pacto/pactoStore';

interface Order { id: string; owner?: string; status?: string; offer: TradeOffer; want: TradeWant; createdAt: string; expiresAt: string; closedAt?: string | null }
interface Board { rules: { fee: number; maxOpen: number; hours: number }; open: Order[]; mine: Order[] }
interface Reply { board?: Board; posted?: string; filled?: string; cancelled?: string }

const useTrade = create<{ board: Board | null; busy: boolean; error: string | null; call(action: string, body?: Record<string, unknown>): Promise<Reply | null> }>((set) => ({
  board: null, busy: false, error: null,
  async call(action, body = {}) {
    const b = useGame.getState().backend;
    // a chamada genérica ao servidor (a mesma dos baús): o mural é só online
    if (!b?.chests) { set({ error: 'O mural funciona só conectado (online).' }); return null; }
    set({ busy: true, error: null });
    try {
      const r = (await b.chests(action, body)) as unknown as Reply;
      if (r.board) set({ board: r.board });
      return r;
    } catch (e) { set({ error: e instanceof Error ? e.message : 'Não deu certo.' }); return null; } finally { set({ busy: false }); }
  },
}));

const KIND_LABEL = { venda: 'Vende', compra: 'Compra', troca: 'Troca' } as const;
const left = (iso: string) => { const h = Math.max(0, (Date.parse(iso) - Date.now()) / 3_600_000); return h >= 1 ? `${Math.floor(h)} h` : `${Math.ceil(h * 60)} min`; };
const STATUS: Record<string, string> = { aberta: 'aberto', concluida: 'aceito', cancelada: 'cancelado', vencida: 'venceu (garantia devolvida)' };

export function TradeBoard() {
  const board = useTrade((s) => s.board), busy = useTrade((s) => s.busy), error = useTrade((s) => s.error);
  const ecos = useEcos((s) => s.view);
  const lumes = usePacto((s) => s.view?.lumes ?? 0);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { void useTrade.getState().call('trade.board'); void usePacto.getState().refresh(); }, []);
  const bag = bagBatches(ecos);
  const after = (text: string) => { setMsg(text); void useEcos.getState().refresh(); void usePacto.getState().refresh(); };
  const fill = async (o: Order) => {
    const picks = o.want.kind === 'material' ? pickForWant(o.want, bag) : [];
    if (!picks) return;
    const r = await useTrade.getState().call('trade.fill', { id: o.id, picks });
    if (r?.filled) { after(`Troca feita: você recebeu ${offerText(o.offer)}.`); useGame.getState().toast('Troca feita no mural', 'gold'); }
  };
  if (!board) return <div className="ecos-tab">{error ? <p className="msg err">{error}</p> : <p className="hint">Abrindo o mural…</p>}</div>;
  const mineOpen = board.mine.filter((m) => m.status === 'aberta');
  return (
    <div className="ecos-tab trade-board">
      <p className="hint">Abrir um pedido custa {board.rules.fee} Lumes e o que você oferece fica guardado até alguém aceitar. Cancelar ou vencer ({board.rules.hours} h) devolve a oferta; a taxa não volta. Até {board.rules.maxOpen} pedidos abertos.</p>
      {error && <p className="msg err" role="alert">{error}</p>}
      {msg && <p className="msg ok" role="status">{msg}</p>}

      <h4>No mural <small>{board.open.length}</small></h4>
      {!board.open.length ? <p className="empty">Nenhum pedido de outras pessoas agora.</p> : (
        <ul className="trade-list">
          {board.open.map((o) => {
            const can = o.want.kind === 'lumes' ? lumes >= o.want.qty : !!pickForWant(o.want, bag);
            return (
              <li key={o.id} className="trade-row">
                <span className={'trade-kind ' + tradeKind(o.offer, o.want)}>{KIND_LABEL[tradeKind(o.offer, o.want)]}</span>
                <div className="trade-what">
                  <b>{o.owner}</b> oferece <b>{offerText(o.offer)}</b>
                  <small>e quer {wantText(o.want)} · vence em {left(o.expiresAt)}</small>
                </div>
                <button type="button" className="primary" disabled={busy || !can} title={can ? 'Entregar o pedido e levar a oferta' : 'Você não tem o que foi pedido'} onClick={() => void fill(o)}>{can ? 'Aceitar' : 'Falta'}</button>
              </li>
            );
          })}
        </ul>
      )}

      <h4>Seus pedidos <small>{mineOpen.length}/{board.rules.maxOpen}</small></h4>
      {!board.mine.length ? <p className="empty">Você ainda não abriu pedidos.</p> : (
        <ul className="trade-list">
          {board.mine.slice(0, 10).map((o) => (
            <li key={o.id} className={'trade-row ' + (o.status === 'aberta' ? '' : 'closed')}>
              <span className={'trade-kind ' + tradeKind(o.offer, o.want)}>{KIND_LABEL[tradeKind(o.offer, o.want)]}</span>
              <div className="trade-what">
                <b>{offerText(o.offer)}</b> por <b>{wantText(o.want)}</b>
                <small>{STATUS[o.status ?? ''] ?? o.status}{o.status === 'aberta' ? ` · vence em ${left(o.expiresAt)}` : ''}</small>
              </div>
              {o.status === 'aberta' && <button type="button" className="ghost" disabled={busy} onClick={async () => { const r = await useTrade.getState().call('trade.cancel', { id: o.id }); if (r?.cancelled) after('Pedido cancelado: a oferta voltou.'); }}>Cancelar</button>}
            </li>
          ))}
        </ul>
      )}

      {mineOpen.length < board.rules.maxOpen && <NewOrder lumes={lumes} onPosted={(t) => after(t)} />}
    </div>
  );
}

function NewOrder({ lumes, onPosted }: { lumes: number; onPosted: (t: string) => void }) {
  const ecos = useEcos((s) => s.view);
  const busy = useTrade((s) => s.busy);
  const bag = bagBatches(ecos);
  const [give, setGive] = useState<'material' | 'lumes'>('material');
  const [key, setKey] = useState('');
  const [giveQty, setGiveQty] = useState(10);
  const [get, setGet] = useState<'material' | 'lumes'>('lumes');
  const [mat, setMat] = useState('erva-orvalho-folha');
  const [quality, setQuality] = useState('');
  const [getQty, setGetQty] = useState(10);
  const lot = bag.find((b) => b.key === key) ?? bag[0];
  const offer: TradeOffer | null = give === 'lumes' ? { kind: 'lumes', qty: giveQty } : lot ? { kind: 'material', key: lot.key, qty: Math.min(giveQty, lot.qty) } : null;
  const want: TradeWant = useMemo(() => {
    if (get === 'lumes') return { kind: 'lumes', qty: getQty };
    const [p, b] = quality.split(':');
    return { kind: 'material', material: mat, qty: getQty, ...(p ? { prop: p as PropKey, min: b as Band } : {}) };
  }, [get, getQty, mat, quality]);
  const props = Object.keys(MATERIALS[mat]?.ranges ?? {}) as PropKey[];
  const cost = TRADE.fee + (offer?.kind === 'lumes' ? offer.qty : 0);
  const invalid = !offer || (offer.kind === 'lumes' && want.kind === 'lumes') || cost > lumes;
  const post = async () => {
    if (!offer || invalid) return;
    const r = await useTrade.getState().call('trade.post', { id: crypto.randomUUID(), offer, want });
    if (r?.posted) onPosted(`Pedido no mural: ${offerText(offer)} por ${wantText(want)}.`);
  };
  return (
    <fieldset className="trade-new">
      <legend>Novo pedido</legend>
      <div className="row">
        <label>Você oferece
          <select value={give} onChange={(e) => { const v = e.target.value as 'material' | 'lumes'; setGive(v); if (v === 'lumes' && get === 'lumes') setGet('material'); }}>
            <option value="material">materiais da mochila</option><option value="lumes">Lumes</option>
          </select>
        </label>
        {give === 'material' ? (bag.length ? (
          <select value={lot?.key} onChange={(e) => setKey(e.target.value)} aria-label="Lote oferecido">{bag.map((b) => <option key={b.key} value={b.key}>{b.qty}× {batchLabel(b.key)}</option>)}</select>
        ) : <small className="hint">Mochila vazia.</small>) : null}
        <label>quantidade <input type="number" className="shop-qty" min={1} max={give === 'lumes' ? TRADE.maxLumes : lot?.qty ?? 1} value={giveQty} onChange={(e) => setGiveQty(Math.max(1, Math.round(Number(e.target.value) || 1)))} /></label>
      </div>
      <div className="row">
        <label>Em troca de
          <select value={get} onChange={(e) => { const v = e.target.value as 'material' | 'lumes'; setGet(v); if (v === 'lumes' && give === 'lumes') setGive('material'); }}>
            <option value="lumes">Lumes</option><option value="material">um material</option>
          </select>
        </label>
        {get === 'material' && <>
          <select value={mat} onChange={(e) => { setMat(e.target.value); setQuality(''); }} aria-label="Material pedido">{Object.values(MATERIALS).map((m) => <option key={m.id} value={m.id}>{CATEGORIES[m.category].icon} {m.name}</option>)}</select>
          {props.length > 0 && <select value={quality} onChange={(e) => setQuality(e.target.value)} aria-label="Qualidade mínima"><option value="">qualquer qualidade</option>{props.flatMap((p) => (['media', 'alta'] as Band[]).map((b) => <option key={p + b} value={`${p}:${b}`}>{PROP_LABEL[p]} {BAND_LABEL[b]}+</option>))}</select>}
        </>}
        <label>quantidade <input type="number" className="shop-qty" min={1} max={get === 'lumes' ? TRADE.maxLumes : TRADE.maxQty} value={getQty} onChange={(e) => setGetQty(Math.max(1, Math.round(Number(e.target.value) || 1)))} /></label>
      </div>
      <p className="hint">{offer ? `${offerText(offer)} por ${wantText(want)}` : 'Escolha o que oferecer.'} · taxa {TRADE.fee} Lumes{cost > lumes ? ' · Lumes insuficientes' : ''}</p>
      <button type="button" className="primary" disabled={busy || invalid} onClick={() => void post()}>Pôr no mural</button>
    </fieldset>
  );
}
