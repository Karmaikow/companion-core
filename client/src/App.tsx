import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ELEMENTS, derivePalette, refugeFeatures } from '@rules';
import { Refuge } from './scene/Refuge';
import { useGame, type Tab } from './store';
import { Icon } from './ui/icons';
import { ChatPanel, MemoriesPanel, DiaryPanel, QuestsPanel, InventoryPanel, RecipesPanel, BondPanel } from './ui/Panels';
import { Celebration, AwakenCall } from './ui/Celebration';
import { Entry } from './ui/Entry';
import { Creation } from './ui/Creation';
import { supabase } from './backend/online';

const TABS: { key: Tab; label: string }[] = [
  { key: 'chat', label: 'Conversa' },
  { key: 'memories', label: 'Memórias' },
  { key: 'diary', label: 'Diário' },
  { key: 'quests', label: 'Quests' },
  { key: 'inventory', label: 'Inventário' },
  { key: 'recipes', label: 'Receitas' },
  { key: 'bond', label: 'Vínculo' },
];

function quality(): 'high' | 'low' {
  const q = new URLSearchParams(location.search).get('q');
  if (q === 'low' || q === 'high') return q;
  const mobile = matchMedia('(pointer: coarse)').matches;
  return mobile && (navigator.hardwareConcurrency ?? 8) <= 6 ? 'low' : 'high';
}

export function App() {
  const { backend, snap, tab, setTab, run, error, toasts, lastReply, pulse, burst, busy, setBackend } = useGame();
  const [bubble, setBubble] = useState<string | null>(null);

  useEffect(() => {
    if (!backend) return;
    // Sem Companion ainda: o ritual de criação aparece (não cria automaticamente).
    void run((b) => b.state());
  }, [backend, run]);

  useEffect(() => {
    if (!lastReply) return;
    setBubble(lastReply);
    const t = setTimeout(() => setBubble(null), Math.max(5000, lastReply.length * 70));
    return () => clearTimeout(t);
  }, [lastReply]);

  // Silêncio: depois de um tempo sem a pessoa responder, o Companion puxa assunto (online, até 3 vezes por sessão).
  const muses = useRef(0);
  const lastEvent = snap?.timeline?.[snap.timeline.length - 1];
  useEffect(() => {
    if (!backend?.muse || busy || muses.current >= 3 || !lastEvent || lastEvent.kind !== 'chat.companion' || lastEvent.payload.muse) return;
    const t = setTimeout(() => {
      if (document.hidden) return;
      muses.current++;
      void run((b) => b.muse!());
    }, 80_000);
    return () => clearTimeout(t);
  }, [backend, busy, lastEvent, run]);

  async function leave() {
    if (!backend) return;
    const guest = backend.kind === 'online' && (await supabase().auth.getUser()).data.user?.is_anonymous;
    const text = guest
      ? 'Você está jogando como convidado. Se sair, não será possível voltar a este Companion. Sair mesmo assim?'
      : 'Sair do Refúgio? Seu progresso continua salvo.';
    if (!confirm(text)) return;
    await backend.signOut?.();
    setBackend(null);
  }

  const c = snap?.companion;
  const d = c?.discoveries ?? {};
  const visual = useMemo(() => {
    const p = d.color ? derivePalette(d.color, d.element ?? null) : null;
    return { color: p?.primary ?? '#9fc9ff', glow: p?.glow ?? (d.element ? ELEMENTS[d.element].glow : '#ffffff') };
  }, [d.color, d.element]);
  const energy = c ? Math.min(1, (c.bond.level - 1) / 6 + c.bond.ratio / 6) : 0;
  const features = useMemo(
    () => refugeFeatures(d, snap?.quests ?? [], c?.bond.level ?? 1, { recipes: snap?.recipes?.length ?? 0, diary: snap?.diary?.length ?? 0 }),
    [d, snap?.quests, c?.bond.level, snap?.recipes?.length, snap?.diary?.length],
  );

  const panel = { chat: ChatPanel, memories: MemoriesPanel, diary: DiaryPanel, quests: QuestsPanel, inventory: InventoryPanel, recipes: RecipesPanel, bond: BondPanel };
  const Panel = tab ? panel[tab] : null;

  return (
    <div className="app">
      <div className="stage">
        <Suspense fallback={null}>
          <Refuge color={visual.color} glow={visual.glow} element={d.element} energy={energy} pulseKey={pulse} burstKey={burst} features={features} contract={c?.stage === 'awakened' ? c.identityContract : null} artUrl={snap?.visualJob?.artUrl} quality={quality()} />
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
            {backend.kind === 'local' && <span className="mode" title="Progresso salvo apenas neste navegador; respostas sem IA">Offline · sem IA</span>}
            <button className="leave" title="Sair" aria-label="Sair" onClick={() => void leave()}>⎋</button>
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

      {backend && c && <Celebration tint={visual.color} />}
      {backend && c && <AwakenCall name={d.name ?? 'Seu Companion'} he={d.pronoun === 'ele'} />}
      {backend && snap && !c && <Creation />}
      {backend && !c && busy && !snap && <div className="loading">Abrindo o Refúgio…</div>}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={'toast ' + t.tone}>{t.text}</div>)}
        {error && <div className="toast warn" onClick={() => useGame.setState({ error: null })}>{error}</div>}
        {backend && !snap && error && <button className="toast warn" onClick={() => setBackend(null)}>Voltar ao início</button>}
      </div>
    </div>
  );
}
