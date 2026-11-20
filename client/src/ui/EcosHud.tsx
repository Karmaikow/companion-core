/**
 * Interface do Ecos da Terra na cena (no Companion World, onde os recursos nascem por todas as regiões):
 *  - topo esquerdo: objetivo da coleta (e a Companion coletando por conta), só quando há um;
 *  - embaixo: a ação em andamento com cancelar (Esc); embaixo à esquerda: últimos materiais.
 * Tudo funciona com teclado (Tab/Enter/Esc) e toque, e o estado nunca depende só de cor.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  NODE_KINDS, CATEGORIES, nodeName, batchQuality, parseBatchKey, pulseTimes, gradeOf, TUNE_LABEL, type TuneGrade,
} from '@rules';
import {
  useEcos, bagUsedOf, bagBatches, matchesObjective, batchLabel, knownNow, type RunPhase,
} from '../ecos/ecosStore';
import { findNode } from '../ecos/worldNodes';
import { quickGather } from '../ecos/quickGather';
import { useGame } from '../store';

const PHASE_LABEL: Record<RunPhase, string> = { andando: 'Indo até lá…', coletando: 'Coletando…', confirmando: 'Confirmando no servidor…', concluido: 'Concluído', interrompido: 'Interrompido', erro: 'Não deu' };

/** Quantos lotes da mochila atendem o objetivo. */
function objectiveCount(): number {
  const s = useEcos.getState();
  if (!s.objective) return 0;
  if (s.objective.source === 'intencao') return s.auto.got;
  return bagBatches(s.view).filter((b) => matchesObjective(s.objective!.match, b)).reduce((a, b) => a + b.qty, 0);
}

export function EcosHud({ panelOpen = false }: { panelOpen?: boolean }) {
  const inWorld = useEcos((s) => s.inWorld), run = useEcos((s) => s.run), auto = useEcos((s) => s.auto.on);
  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force((x) => x + 1), 500); return () => clearInterval(t); }, []);
  // Esc cancela a ação
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { const s = useEcos.getState(); if (s.run && ['andando', 'coletando', 'confirmando'].includes(s.run.phase)) { s.cancel(); e.preventDefault(); } else if (s.selected) s.select(null); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);
  if (!inWorld && !run && !auto) return null;
  return (
    <div className="ecos-hud" aria-label="Coleta: Ecos da Terra">
      {!panelOpen && <GoalPill />}
      <ActionBar />
      <RecentLoot />
    </div>
  );
}

/** Com um objetivo de coleta: um botão pequeno (objetivo e mochila); tocar abre o painel de Coleta do menu. */
function GoalPill() {
  const obj = useEcos((s) => s.objective), auto = useEcos((s) => s.auto), view = useEcos((s) => s.view), conn = useEcos((s) => s.conn);
  const used = bagUsedOf(view), cap = view?.config.bag ?? 60;
  const count = objectiveCount();
  if (!obj && !auto.on) return null;
  return (
    <button type="button" className="ecos-pill ecos-card" onClick={() => useGame.getState().setTab('ecos')} aria-label="Abrir o painel de Coleta">
      <span className="pill-title">🌿 Coleta</span>
      <span className="pill-info">
        {obj ? `${obj.label} ${Math.min(count, obj.qty)}/${obj.qty}` : auto.on ? '✦ coletando por conta' : 'toque num recurso'}
        {' · '}🎒 {used}/{cap}{conn === 'perdida' ? ' · sem conexão' : ''}
      </span>
    </button>
  );
}

/** Resumo para o painel: objetivo, coleta por conta e mochila. */
export function ObjectiveSummary() {
  const obj = useEcos((s) => s.objective), auto = useEcos((s) => s.auto), view = useEcos((s) => s.view), conn = useEcos((s) => s.conn);
  const used = bagUsedOf(view), cap = view?.config.bag ?? 60;
  const count = objectiveCount();
  return (
    <section className="ecos-summary" aria-live="polite">
      {obj ? (
        <>
          <b>{obj.label} — {Math.min(count, obj.qty)}/{obj.qty}</b>
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={obj.qty} aria-valuenow={Math.min(count, obj.qty)}><i style={{ width: `${Math.min(100, (count / obj.qty) * 100)}%` }} /></div>
          <button type="button" className="link" onClick={() => useEcos.getState().setObjective(null)}>tirar objetivo</button>
        </>
      ) : <b>Toque num recurso do mundo (árvore, erva, pedra…) para ver o que dá para coletar.</b>}
      {auto.on && <p className="ecos-auto">✦ Coletando por conta{auto.last ? `: ${auto.last}` : '…'} <button type="button" className="link" onClick={() => useEcos.getState().stopIntent()}>parar</button></p>}
      <small className="ecos-bagline">Mochila {used}/{cap}{used >= cap ? ' · cheia' : ''}{conn === 'perdida' ? ' · conexão perdida (tentando de novo)' : ''}</small>
      <AutoTuneToggle />
    </section>
  );
}

/** sem o desafio de ritmo: a coleta conta como três "bom" */
function AutoTuneToggle() {
  const on = useEcos((s) => s.autoTune);
  return <label className="ecos-autotune"><input type="checkbox" checked={on} onChange={(e) => useEcos.getState().setAutoTune(e.target.checked)} /> Afinação automática (sem o desafio de ritmo)</label>;
}

function ActionBar() {
  const run = useEcos((s) => s.run), conn = useEcos((s) => s.conn);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (run?.phase !== 'coletando') return; const t = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(t); }, [run?.phase]);
  useEffect(() => {
    if (!run || !['concluido', 'interrompido', 'erro'].includes(run.phase)) return;
    const t = setTimeout(() => { const s = useEcos.getState(); if (s.run?.request === run.request) useEcos.setState({ run: null }); }, run.phase === 'concluido' ? 1800 : 4500);
    return () => clearTimeout(t);
  }, [run]);
  if (!run) return null;
  const n = findNode(run.node);
  if (!n) return null;
  const ap = NODE_KINDS[n.kind].approaches.find((a) => a.id === run.approach);
  const active = ['andando', 'coletando', 'confirmando'].includes(run.phase);
  const pct = run.phase === 'coletando' ? Math.min(100, ((now - run.started) / (run.seconds * 1000)) * 100) : run.phase === 'confirmando' || run.phase === 'concluido' ? 100 : 0;
  const lost = conn === 'perdida' && active;
  return (
    <div className={'ecos-action ecos-card ' + run.phase} role="status" aria-live="polite">
      <div className="ea-top">
        <b>{run.inspect ? 'Observar' : ap?.label ?? run.approach} · {nodeName(n)}</b>
        <span className="ea-phase">{lost ? 'Conexão perdida — tentando de novo (nada se perde)' : PHASE_LABEL[run.phase]}{run.by === 'companion' ? ' · pela Companion' : ''}</span>
      </div>
      {run.phase === 'coletando' && run.by === 'pessoa' && !run.inspect && !useEcos.getState().autoTune
        ? <TuneRing started={run.started} seconds={run.seconds} tune={run.tune ?? []} />
        : <div className="bar"><i style={{ width: pct + '%' }} /></div>}
      {run.phase === 'concluido' && run.result && <TuneResultLine grades={run.result.grades} pure={run.result.pure} />}
      {run.message && <small className="ea-msg">{run.message}</small>}
      {active && <button type="button" className="ghost" onClick={() => useEcos.getState().cancel()} aria-keyshortcuts="Escape">Cancelar (Esc)</button>}
    </div>
  );
}

/**
 * Afinar o eco: três pulsos de luz crescem até o anel; toque (clique, toque ou Espaço) quando encostarem.
 * Perfeito/Bom melhoram o material; errar não tira nada. Com movimento reduzido, os pulsos piscam no lugar.
 */
function TuneRing({ started, seconds, tune }: { started: number; seconds: number; tune: (number | null)[] }) {
  const [now, setNow] = useState(Date.now());
  const [flash, setFlash] = useState<{ grade: TuneGrade; at: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => { let f = 0; const loop = () => { setNow(Date.now()); f = requestAnimationFrame(loop); }; f = requestAnimationFrame(loop); return () => cancelAnimationFrame(f); }, []);
  const tap = () => { const g = useEcos.getState().tap(); if (g) setFlash({ grade: g, at: Date.now() }); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.code === 'Space' && !(e.target as HTMLElement).closest('input, textarea, select')) { e.preventDefault(); tap(); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);
  useEffect(() => { btn.current?.focus({ preventScroll: true }); }, []);
  const at = now - started, times = pulseTimes(seconds), LEAD = 1300, R = 44;
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <div className="tune">
      <button ref={btn} type="button" className="tune-ring" onPointerDown={(e) => { e.preventDefault(); tap(); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); tap(); } }}
        aria-label="Afinar o eco: toque quando o pulso encostar no anel (Espaço)" aria-keyshortcuts="Space">
        <svg viewBox="0 0 120 120" aria-hidden>
          <circle cx="60" cy="60" r={R} className="tune-target" />
          <circle cx="60" cy="60" r={R} className="tune-zone" strokeWidth={10} />
          {times.map((t, i) => {
            if (tune[i] !== undefined) return null;
            const d = t - at;
            if (d > LEAD || d < -260) return null;
            const k = 1 - Math.max(0, d) / LEAD;
            return reduce
              ? <circle key={i} cx="60" cy="60" r={R} className="tune-pulse" style={{ opacity: Math.abs(d) < 260 ? 1 : 0.25 }} />
              : <circle key={i} cx="60" cy="60" r={Math.max(4, R * k)} className="tune-pulse" style={{ opacity: d < 0 ? 0.4 : 0.35 + 0.65 * k }} />;
          })}
          <circle cx="60" cy="60" r="10" className="tune-core" />
        </svg>
        {flash && now - flash.at < 700 && <b className={'tune-flash ' + flash.grade}>{TUNE_LABEL[flash.grade]}</b>}
      </button>
      <ol className="tune-marks" aria-label="Pulsos afinados">
        {times.map((t, i) => { const g = tune[i] !== undefined ? gradeOf(tune[i]) : at > t + 260 ? 'fora' : null; return <li key={i} className={g ?? 'wait'}>{g ? TUNE_LABEL[g] : `Pulso ${i + 1}`}</li>; })}
      </ol>
      <small className="tune-hint">Toque quando o pulso encostar no anel. Afinar melhora o material; errar não tira nada.</small>
    </div>
  );
}

function TuneResultLine({ grades, pure }: { grades: TuneGrade[]; pure: boolean }) {
  return <p className={'tune-result' + (pure ? ' pure' : '')}>{pure ? 'Eco puro! O material saiu no melhor que o recurso dá.' : `Afinação: ${grades.map((g) => TUNE_LABEL[g]).join(' · ')}`}</p>;
}

function RecentLoot() {
  const recent = useEcos((s) => s.recent);
  const grouped = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of recent.filter((x) => Date.now() - x.at < 60_000)) m.set(r.key, (m.get(r.key) ?? 0) + r.qty);
    return [...m.entries()].slice(0, 5);
  }, [recent]);
  if (!grouped.length) return null;
  return (
    <ul className="ecos-recent" aria-label="Últimos materiais">
      {grouped.map(([key, qty]) => { const p = parseBatchKey(key); return <li key={key}>+{qty} {batchLabel(key)}{p ? <em> · {batchQuality(p)}</em> : null}</li>; })}
    </ul>
  );
}

/** Lista acessível dos recursos por perto (alternativa a clicar na cena). */
export function NearbyList() {
  const view = useEcos((s) => s.view);
  const list = knownNow(view).sort((a, b) => a.dist - b.dist).slice(0, 8);
  if (!list.length) return <p className="hint">Nenhum recurso à vista. Ande pelo Companion World: árvores, ervas e pedras nascem em todas as regiões.</p>;
  return (
    <ul className="ecos-near">
      {list.map(({ node, dist }) => <li key={node.id}><button type="button" className="ghost" onClick={() => quickGather(node.id)}>{CATEGORIES[NODE_KINDS[node.kind].category].icon} {nodeName(node)} · {Math.round(dist)} m</button></li>)}
    </ul>
  );
}
