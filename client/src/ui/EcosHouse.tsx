/**
 * Casa dos Ecos (Áster): o modal que abre quando o Companion chega à porta (marcador "Casa dos Ecos" do Estúdio da
 * Cidade). Missões de coleta (pegar, entregar e receber), o refino (muitos materiais comuns → um refinado, com a
 * qualidade da média do que entrou), o mural de trocas entre Companions, a mochila de coleta e as receitas. O
 * servidor confere tudo.
 */
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { REFINES, MATERIALS, CATEGORIES, autoPickRefine, refineBands, describeBands, parseBatchKey, batchQuality, type RefineDef } from '@rules';
import { useGame } from '../store';
import { useEcos, bagBatches, batchLabel } from '../ecos/ecosStore';
import { useMissions } from '../missions/missionsStore';
import { MissionList } from './MissionsPanel';
import { Bag, Recipes } from './EcosPanel';
import { TradeBoard } from './TradeBoard';

export const useEcosHouse = create<{ open: string | null }>(() => ({ open: null }));
export const openEcosHouse = (name: string) => useEcosHouse.setState({ open: name });
const close = () => useEcosHouse.setState({ open: null });
const rid = () => crypto.randomUUID();

type Tab = 'missoes' | 'refinar' | 'mural' | 'mochila' | 'receitas';

export function EcosHouse() {
  const open = useEcosHouse((s) => s.open);
  const [tab, setTab] = useState<Tab>('missoes');
  const view = useEcos((s) => s.view), error = useEcos((s) => s.error);
  useEffect(() => { if (!open) return; void useEcos.getState().refresh(); void useMissions.getState().refresh(); }, [open]);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open]);
  if (!open) return null;
  return (
    <div className="shop-back" role="dialog" aria-modal="true" aria-label={open} onClick={close}>
      <div className="shop school framed wide" onClick={(e) => e.stopPropagation()}>
        <header className="shop-head">
          <div className="shop-face" aria-hidden>🌿</div>
          <div className="shop-who">
            <h2>{open}</h2>
            <small>Mestra Ilvana · coleta, refino e encomendas da cidade</small>
            <p className="shop-say">“O mundo inteiro dá o que a cidade precisa. Traga, que a gente transforma.”</p>
          </div>
          <button className="close" onClick={close} aria-label="Fechar">✕</button>
        </header>
        {view?.simulated && <p className="shop-note">Offline: tudo simulado neste aparelho, sem valor online.</p>}
        {error && <p className="msg err" role="alert">{error}</p>}
        <nav className="st-tabs pacto-tabs" aria-label="Casa dos Ecos">
          {([['missoes', 'Missões'], ['refinar', 'Refinar'], ['mural', 'Mural de trocas'], ['mochila', 'Mochila'], ['receitas', 'Receitas']] as [Tab, string][]).map(([k, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>
          ))}
        </nav>
        <div className="ecos-tab ecos-house">
          {tab === 'missoes' && <MissionList giver="casa-dos-ecos" />}
          {tab === 'refinar' && (view ? <Refine /> : <p className="hint">Abrindo a mochila…</p>)}
          {tab === 'mural' && <TradeBoard />}
          {tab === 'mochila' && (view ? <Bag /> : <p className="hint">Abrindo a mochila…</p>)}
          {tab === 'receitas' && (view ? <Recipes /> : <p className="hint">Abrindo a mochila…</p>)}
        </div>
      </div>
    </div>
  );
}

function Refine() {
  const view = useEcos((s) => s.view)!;
  const bag = bagBatches(view), qty = view.config.refine ?? 30;
  const [prefer, setPrefer] = useState<'melhores' | 'comuns'>('comuns');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async (r: RefineDef) => {
    const picks = autoPickRefine(r, bag, qty, prefer);
    if (!picks) return;
    setBusy(true); setMsg(null);
    try {
      const res = await useEcos.getState().call('ecos.refine', { request: rid(), refine: r.id, picks });
      if (res?.refined) {
        const p = parseBatchKey(res.refined.key);
        setMsg({ ok: true, text: `Pronto: 1× ${batchLabel(res.refined.key)}${p ? ` · ${batchQuality(p)}` : ''}.` });
        useGame.getState().toast(`${MATERIALS[r.to].name} refinado`, 'gold');
      }
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Não deu certo.' }); } finally { setBusy(false); }
  };
  return (
    <div className="ecos-refine">
      <p className="hint">{qty} materiais comuns viram 1 refinado. A qualidade do refinado é a média do que entrou: afinar bem a coleta dá refinado melhor. Refinados entram nas receitas da Forja, das Escolas e da Coleta e valem mais nas lojas.</p>
      <div className="chips" role="group" aria-label="Quais usar primeiro">
        <button type="button" className={'chip' + (prefer === 'comuns' ? ' on' : '')} aria-pressed={prefer === 'comuns'} onClick={() => setPrefer('comuns')}>Usar os mais comuns primeiro</button>
        <button type="button" className={'chip' + (prefer === 'melhores' ? ' on' : '')} aria-pressed={prefer === 'melhores'} onClick={() => setPrefer('melhores')}>Usar os melhores primeiro</button>
      </div>
      {msg && <p className={'msg' + (msg.ok ? ' ok' : ' err')} role="status">{msg.text}</p>}
      {REFINES.map((r) => {
        const have = bag.filter((b) => r.from.includes(b.material)).reduce((a, b) => a + b.qty, 0);
        const picks = autoPickRefine(r, bag, qty, prefer);
        const bands = picks ? refineBands(r, picks.map((p) => ({ ...parseBatchKey(p.key)!, qty: p.qty }))) : null;
        const to = MATERIALS[r.to];
        return (
          <article key={r.id} className="ecos-recipe">
            <h4>{CATEGORIES[to.category].icon} {to.name}</h4>
            <p className="hint">{r.label}: você tem <b>{have}</b>/{qty}. {to.uses.join('; ')}.</p>
            <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={qty} aria-valuenow={Math.min(have, qty)}><i style={{ width: `${Math.min(100, (have / qty) * 100)}%` }} /></div>
            {bands && <small className="hint">Sai com qualidade {describeBands(bands)}.</small>}
            <button type="button" className="primary" disabled={!picks || busy} onClick={() => void go(r)}>{picks ? `Refinar (${qty} → 1)` : `Faltam ${qty - have}`}</button>
          </article>
        );
      })}
    </div>
  );
}

// testes no navegador (só no dev)
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __ecosHouse: unknown }).__ecosHouse = openEcosHouse;
