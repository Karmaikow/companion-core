import { Suspense, useEffect, useMemo, useState } from 'react';
import { ELEMENTS, derivePalette } from '@rules';
import { Refuge } from './scene/Refuge';
import { useGame, type Tab } from './store';
import { Icon } from './ui/icons';
import { ChatPanel, MemoriesPanel, DiaryPanel, QuestsPanel, InventoryPanel, BondPanel } from './ui/Panels';
import { Entry } from './ui/Entry';

const TABS: { key: Tab; label: string }[] = [
  { key: 'chat', label: 'Conversa' },
  { key: 'memories', label: 'Memórias' },
  { key: 'diary', label: 'Diário' },
  { key: 'quests', label: 'Quests' },
  { key: 'inventory', label: 'Inventário' },
  { key: 'bond', label: 'Vínculo' },
];

function quality(): 'high' | 'low' {
  const q = new URLSearchParams(location.search).get('q');
  if (q === 'low' || q === 'high') return q;
  const mobile = matchMedia('(pointer: coarse)').matches;
  return mobile && (navigator.hardwareConcurrency ?? 8) <= 6 ? 'low' : 'high';
}

export function App() {
  const { backend, snap, tab, setTab, run, error, toasts, lastReply, pulse, busy } = useGame();
  const [bubble, setBubble] = useState<string | null>(null);

  useEffect(() => {
    if (!backend) return;
    void run(async (b) => {
      const s = await b.state();
      return s.companion ? s : b.create();
    });
  }, [backend, run]);

  useEffect(() => {
    if (!lastReply) return;
    setBubble(lastReply);
    const t = setTimeout(() => setBubble(null), Math.max(5000, lastReply.length * 70));
    return () => clearTimeout(t);
  }, [lastReply]);

  const c = snap?.companion;
  const d = c?.discoveries ?? {};
  const visual = useMemo(() => {
    const p = d.color ? derivePalette(d.color, d.element ?? null) : null;
    return { color: p?.primary ?? '#9fc9ff', glow: p?.glow ?? (d.element ? ELEMENTS[d.element].glow : '#ffffff') };
  }, [d.color, d.element]);
  const energy = c ? Math.min(1, (c.bond.level - 1) / 6 + c.bond.ratio / 6) : 0;

  const panel = { chat: ChatPanel, memories: MemoriesPanel, diary: DiaryPanel, quests: QuestsPanel, inventory: InventoryPanel, bond: BondPanel };
  const Panel = tab ? panel[tab] : null;

  return (
    <div className="app">
      <div className="stage">
        <Suspense fallback={null}>
          <Refuge color={visual.color} glow={visual.glow} element={d.element} energy={energy} pulseKey={pulse} contract={c?.stage === 'awakened' ? c.identityContract : null} quality={quality()} />
        </Suspense>
      </div>

      {!backend && <Entry />}

      {backend && c && (
        <>
          <header className="nameplate">
            <div className="portrait" style={{ background: `radial-gradient(circle at 50% 45%, #fff 0 12%, ${visual.color} 40%, transparent 72%)` }} />
            <div>
              <h1>{d.name ?? 'Núcleo sem nome'}</h1>
              <p>{c.stage === 'awakened' ? 'Primeira forma' : 'Partículas'} · vínculo {c.bond.level}</p>
              <div className="bar small"><i style={{ width: Math.round(c.bond.ratio * 100) + '%' }} /></div>
            </div>
            {backend.kind === 'local' && <span className="mode" title="Progresso salvo apenas neste navegador">Modo local</span>}
          </header>

          {bubble && !tab && <div className="bubble" role="status">{bubble}</div>}
          {bubble && tab && tab !== 'chat' && <div className="bubble" role="status">{bubble}</div>}

          <nav className="rail" aria-label="Refúgio">
            {TABS.map((t) => (
              <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(tab === t.key ? null : t.key)} aria-pressed={tab === t.key}>
                <Icon tab={t.key} />
                <span>{t.label}</span>
                {t.key === 'bond' && snap?.awakening?.ready && c.stage === 'particles' && <em className="dot" aria-label="pronto para despertar" />}
              </button>
            ))}
          </nav>

          {Panel && tab && (
            <section className={'panel panel-' + tab} aria-label={TABS.find((t) => t.key === tab)?.label}>
              <header>
                <h2>{TABS.find((t) => t.key === tab)?.label}</h2>
                <button className="close" onClick={() => setTab(null)} aria-label="Fechar painel">×</button>
              </header>
              <div className="panel-body"><Panel /></div>
            </section>
          )}
        </>
      )}

      {backend && !c && busy && <div className="loading">Abrindo o Refúgio…</div>}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={'toast ' + t.tone}>{t.text}</div>)}
        {error && <div className="toast warn" onClick={() => useGame.setState({ error: null })}>{error}</div>}
      </div>
    </div>
  );
}
