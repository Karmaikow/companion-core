/**
 * Torre Central de Áster (o Cristal Ápice da praça): quando a cidade cai, a reconstrução é uma meta do servidor
 * inteiro — Cristais Ápice (dos baús de monstro), materiais da coleta (refinados da Casa dos Ecos) e Lumes. Cada um
 * entrega o que puder; quando tudo fecha, Áster volta ao normal. Com a cidade de pé, a Torre só conta a história.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { CRYSTAL_KEY, CRYSTALS_LABEL, needText, rebuildFits, rebuildRatio } from '@rules';
import { useGame } from '../store';
import { useChests } from '../chests/chestStore';
import { useEcos, bagBatches, batchLabel } from '../ecos/ecosStore';
import { usePacto } from '../pacto/pactoStore';

export const useTower = create<{ open: boolean }>(() => ({ open: false }));
export const openTower = () => useTower.setState({ open: true });
const close = () => useTower.setState({ open: false });
const rid = () => crypto.randomUUID();

export function TowerPanel() {
  const open = useTower((s) => s.open);
  const city = useChests((s) => s.city), aster = useChests((s) => s.aster), busy = useChests((s) => s.busy), error = useChests((s) => s.error);
  const inv = useGame((s) => s.snap?.inventory ?? []);
  const lumes = usePacto((s) => s.view?.lumes ?? 0);
  const ecos = useEcos((s) => s.view);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (!open) return; setMsg(null); void useChests.getState().loadCity(); void usePacto.getState().refresh(); void useEcos.getState().refresh(); }, [open]);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open]);
  if (!open) return null;
  const g = aster.rebuild, p = city?.progress, down = city?.state === 'destruida';
  const crystals = inv.find((i) => i.item_key === CRYSTAL_KEY)?.qty ?? 0;
  const give = async (body: Record<string, unknown>) => {
    setMsg(null);
    const r = await useChests.getState().call('city.give', { request: rid(), ...body });
    if (!r?.given) return;
    setMsg(`Entregue: ${r.given.accepted}.`);
    if (r.given.done) useGame.getState().celebrate({ kind: 'quest', eyebrow: 'Áster', title: 'A Torre voltou a brilhar', subtitle: 'A cidade foi reconstruída com a ajuda de todos. Obrigado!' });
    void useGame.getState().run((b) => b.state()); void usePacto.getState().refresh(); void useEcos.getState().refresh();
  };
  return (
    <div className="shop-back" role="dialog" aria-modal="true" aria-label="Torre Central de Áster" onClick={close}>
      <div className="shop school framed" onClick={(e) => e.stopPropagation()}>
        <header className="shop-head">
          <div className="shop-face" aria-hidden>◆</div>
          <div className="shop-who">
            <h2>Torre Central</h2>
            <small>O Cristal Ápice de Áster</small>
            <p className="shop-say">{down ? '“A luz apagou. Cristais, pedra boa e Lumes: é o que a torre pede para voltar a brilhar.”' : '“A torre brilha. Enquanto a defesa resistir, a cidade fica de pé.”'}</p>
          </div>
          <button className="close" onClick={close} aria-label="Fechar">✕</button>
        </header>
        {error && <p className="msg err" role="alert">{error}</p>}
        {msg && <p className="msg ok" role="status">{msg}</p>}
        {!city ? <p className="hint">Lendo a torre…</p> : !down ? (
          <p className="hint">Áster está de pé{city.rebuiltAt ? `, reconstruída em ${new Date(city.rebuiltAt).toLocaleDateString('pt-BR')}` : ''}. Se a defesa cair, a reconstrução começa aqui: guarde os {CRYSTALS_LABEL} que os baús dos monstros trazem.</p>
        ) : (
          <div className="shop-list">
            <p className="hint">Reconstrução de todos: {Math.round(rebuildRatio(g, p!) * 100)}% pronto. Cada pessoa entrega o que puder.</p>
            <Row label={CRYSTALS_LABEL} have={p!.crystals} goal={g.crystals}>
              <button className="primary" disabled={busy || !crystals} onClick={() => void give({ kind: 'cristal', qty: crystals })}>{crystals ? `Entregar ${Math.min(crystals, g.crystals - p!.crystals)}` : 'Sem cristais'}</button>
            </Row>
            <Row label="Lumes" have={p!.lumes} goal={g.lumes}>
              <LumesGive max={Math.min(lumes, g.lumes - p!.lumes)} busy={busy} onGive={(q) => void give({ kind: 'lumes', qty: q })} />
            </Row>
            {g.materials.map((m, i) => {
              const fits = bagBatches(ecos).filter((b) => rebuildFits(m, b.key));
              const need = m.qty - (p!.materials[i] ?? 0);
              return (
                <Row key={i} label={needText(m)} have={p!.materials[i] ?? 0} goal={m.qty}>
                  {fits.length ? <button className="primary" disabled={busy} onClick={() => void give({ kind: 'material', idx: i, key: fits[0].key, qty: Math.min(need, fits[0].qty) })}>Entregar {Math.min(need, fits[0].qty)}× {batchLabel(fits[0].key)}</button>
                    : <small className="hint">Nada na mochila serve (refine na Casa dos Ecos).</small>}
                </Row>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** uma parte da meta: barra de progresso e, enquanto falta, como entregar */
function Row({ label, have, goal, children }: { label: string; have: number; goal: number; children?: ReactNode }) {
  return (
    <div className="shop-row tower-row">
      <div className="shop-info">
        <b>{label}: {Math.min(have, goal)}/{goal}</b>
        <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(have, goal)}><i style={{ width: `${goal ? Math.min(100, (have / goal) * 100) : 100}%` }} /></div>
      </div>
      {have < goal && children}
    </div>
  );
}

function LumesGive({ max, busy, onGive }: { max: number; busy: boolean; onGive: (q: number) => void }) {
  const [q, setQ] = useState(Math.min(100, max));
  if (max <= 0) return <small className="hint">Sem Lumes para entregar.</small>;
  return (
    <span className="row">
      <input type="number" className="shop-qty" min={1} max={max} value={Math.min(q, max)} onChange={(e) => setQ(Math.max(1, Math.min(max, Math.round(Number(e.target.value) || 1))))} aria-label="Lumes para entregar" />
      <button className="primary" disabled={busy} onClick={() => onGive(Math.min(q, max))}>Entregar ✧</button>
    </span>
  );
}

// testes no navegador (só no dev)
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __tower: unknown }).__tower = openTower;
