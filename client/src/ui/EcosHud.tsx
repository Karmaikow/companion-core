/**
 * Interface do Ecos da Terra na cena (no Companion World, onde os recursos nascem por todas as regiões):
 *  - topo esquerdo: objetivo da coleta (e a Companion coletando por conta), só quando há um;
 *  - direita (no celular, bandeja de baixo): o recurso selecionado, propriedades conhecidas, adequação e abordagens;
 *  - embaixo: a ação em andamento com cancelar (Esc); embaixo à esquerda: últimos materiais.
 * Tudo funciona com teclado (Tab/Enter/Esc) e toque, e o estado nunca depende só de cor.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MATERIALS, NODE_KINDS, CATEGORIES, TOOLS, PROP_LABEL, BAND_LABEL, nodeName, RESOURCE_TIMES, WEATHERS,
  expectedOutcome, msUntilAvailable, batchQuality, parseBatchKey, slotFit, RECIPES, superiorBlockFor, pulseTimes, gradeOf, TUNE_LABEL,
  type ResourceNode, type Approach, type PropKey, type Band, type TuneGrade,
} from '@rules';
import {
  useEcos, amountOf, bagUsedOf, bagBatches, matchesObjective, batchLabel, knownNow, suggestionsNow,
  type RunPhase,
} from '../ecos/ecosStore';
import { findNode, ecosWorld } from '../ecos/worldNodes';
import { usePacto } from '../pacto/pactoStore';
import { useGame } from '../store';

const PHASE_LABEL: Record<RunPhase, string> = { andando: 'Indo até lá…', coletando: 'Coletando…', confirmando: 'Confirmando no servidor…', concluido: 'Concluído', interrompido: 'Interrompido', erro: 'Não deu' };
const fmtTime = (ms: number) => { const m = Math.ceil(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + ' min' : ''}` : `${m} min`; };

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
      {!panelOpen && <ContextPanel />}
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

function ApproachRow({ node, ap, state }: { node: ResourceNode; ap: Approach; state: { blocked: string | null } }) {
  const view = useEcos((s) => s.view), obj = useEcos((s) => s.objective);
  const [info, setInfo] = useState(false);
  const known = view?.profile.knownMaterials ?? [];
  const outs = expectedOutcome(node, ap);
  const fits = obj ? outs.some((o) => { const m = MATERIALS[o.material]; const bands = obj.match.prop ? (o.bands[obj.match.prop] ?? []) : ['alta' as Band]; return bands.some((b) => matchesObjective(obj.match, { material: m.id, bands: obj.match.prop ? { [obj.match.prop]: b } : {} })); }) : null;
  return (
    <li className={'ecos-ap' + (state.blocked ? ' blocked' : '')}>
      <div className="ap-head">
        <b>{ap.label}</b><span className="ap-time">{ap.seconds} s</span>
        {ap.tool && <span className="ap-tool" title={TOOLS[ap.tool].label}>{TOOLS[ap.tool].icon} {TOOLS[ap.tool].label}</span>}
      </div>
      <p className="ap-short">
        {outs.map((o) => { const m = MATERIALS[o.material]; const qty = o.chance !== undefined ? `às vezes` : o.qty[0] === o.qty[1] ? `×${o.qty[0]}` : `×${o.qty[0]}–${o.qty[1]}`; return <span key={o.material}>{CATEGORIES[m.category].icon} {m.name} {qty}</span>; })}
        {fits !== null && <span className={'fit ' + (fits ? 'ok' : 'no')}>{fits ? '✓ objetivo' : '✗ objetivo'}</span>}
        <button type="button" className="link" aria-expanded={info} onClick={() => setInfo(!info)}>{info ? 'menos' : 'detalhes'}</button>
      </p>
      {info && <>
        <ul className="ap-out">
          {outs.map((o) => {
            const m = MATERIALS[o.material], k = known.includes(o.material);
            const qty = o.qty[0] === o.qty[1] ? `${o.qty[0]}` : `${o.qty[0]}–${o.qty[1]}`;
            return (
              <li key={o.material}>
                {CATEGORIES[m.category].icon} {m.name}: {o.chance !== undefined ? <><em>às vezes</em> ({Math.round(o.chance * 100)}%) </> : <>garantido {o.guaranteed}{o.qty[1] > o.guaranteed ? <>, <em>estimado</em> {qty}</> : null} </>}
                {Object.keys(o.bands).length > 0 && <span className="ap-bands">{k ? Object.entries(o.bands).map(([p, b]) => `${PROP_LABEL[p as PropKey].toLowerCase()} ${(b as Band[]).map((x) => BAND_LABEL[x]).join('–')}`).join(' · ') : 'propriedades desconhecidas (colete uma vez)'}</span>}
              </li>
            );
          })}
        </ul>
        <p className="ap-meta"><span>{ap.pitch}</span> <span>Ambiente: {ap.effect}</span> {ap.risk !== 'nenhum' && <span>Risco: {ap.risk}</span>}</p>
      </>}
      <button type="button" className="primary" disabled={!!state.blocked} onClick={() => useEcos.getState().gather(node.id, ap.id)} aria-describedby={state.blocked ? `why-${node.id}-${ap.id}` : undefined}>
        {state.blocked ? 'Indisponível' : 'Coletar'}
      </button>
      {state.blocked && <small id={`why-${node.id}-${ap.id}`} className="ap-why">{state.blocked}</small>}
    </li>
  );
}

function ContextPanel() {
  const selected = useEcos((s) => s.selected), view = useEcos((s) => s.view), intent = useEcos((s) => s.intent);
  const [more, setMore] = useState(false);
  const cls = usePacto((s) => (s.view?.cls.forms?.length ? s.view.cls.forms : s.view?.cls.effective ?? null));
  const node = selected ? findNode(selected) : null;
  const sugg = useMemo(() => (node && view ? suggestionsNow(view, intent ?? { mode: 'abastecer', target: null, risk: 1, reserve: 4, tools: [], prefer: null, gentle: true }).find((x) => x.node.id === node.id && !x.blocked) : null), [node, view, intent]);
  if (!node) return null;
  const k = NODE_KINDS[node.kind], amount = amountOf(view, node), now = Date.now();
  const free = (view?.config.bag ?? 60) - bagUsedOf(view);
  const tools = view?.profile.tools ?? [];
  const superior = superiorBlockFor(node.id, cls);
  const states = k.approaches.map((ap) => {
    if (superior) return superior;
    if (ap.tool && !tools.includes(ap.tool)) return `precisa de ${TOOLS[ap.tool].label} (forjada por uma Taurina — encomende na Oficina)`;
    const wait = msUntilAvailable(node, ap, view?.nodes[node.id] ?? null, now);
    if (wait > 0) return `esgotado: volta em ~${fmtTime(wait)}`;
    if (free < ap.yields.reduce((a, y) => a + y.qty[1], 0)) return 'mochila cheia (ou quase): libere espaço';
    return null;
  });
  const anyOk = states.some((x) => !x);
  const mats = [...new Set(k.approaches.flatMap((a) => a.yields.map((y) => y.material)))];
  return (
    <aside className="ecos-panel ecos-card" aria-label={`Recurso: ${nodeName(node)}`}>
      <header>
        <div><small className="ecos-eyebrow">{CATEGORIES[k.category].icon} {CATEGORIES[k.category].label} · {ecosWorld()?.biomes.find((b) => b.slug === node.biome)?.name ?? 'Mundo'}</small><h3>{nodeName(node)}</h3></div>
        <button type="button" className="close" aria-label="Fechar" onClick={() => useEcos.getState().select(null)}>×</button>
      </header>
      <p className="ecos-state"><span className={'pill ' + (anyOk ? 'ok' : 'off')}>{anyOk ? 'Disponível' : 'Indisponível'}</span> Abundância {Math.floor(amount)}/{k.capacity} · <em>{k.sign}</em></p>
      {(node.time !== 'sempre' || node.weather.length > 0) && <p className="hint">Aparece {[node.time !== 'sempre' ? RESOURCE_TIMES[node.time].toLowerCase() : '', node.weather.length ? 'com ' + node.weather.map((w) => WEATHERS[w].label.toLowerCase()).join(' ou ') : ''].filter(Boolean).join(', ')}.</p>}
      {sugg && <p className="ecos-sugg">💬 {sugg.reason}</p>}
      <button type="button" className="ghost ecos-more" aria-expanded={more} onClick={() => setMore(!more)}>{more ? 'Menos detalhes' : 'Para que serve'}</button>
      {more && (
        <ul className="ecos-uses">
          {mats.map((id) => <li key={id}><b>{MATERIALS[id].name}</b> (raridade {['', 'comum', 'incomum', 'rara'][MATERIALS[id].rarity]}): {MATERIALS[id].uses.join('; ')}.{RECIPES.some((r) => r.slots.some((s) => slotFit(s, { material: id, bands: Object.fromEntries(Object.keys(MATERIALS[id].ranges).map((p) => [p, 'alta'])) as Partial<Record<PropKey, Band>> }) !== 'nao-serve')) ? ' Entra em receita.' : ''}</li>)}
        </ul>
      )}
      <ul className="ecos-aps">
        {k.approaches.map((ap, i) => <ApproachRow key={ap.id} node={node} ap={ap} state={{ blocked: states[i] }} />)}
      </ul>
      {superior && (Array.isArray(cls) ? cls.includes('touro') : cls === 'touro') && !usePacto.getState().view?.simulated && <button type="button" className="ghost" onClick={() => void usePacto.getState().call('pacto.board.post', { kind: 'oportunidade', text: `${nodeName(node)} localizado em ${ecosWorld()?.biomes.find((b) => b.slug === node.biome)?.name ?? 'algum lugar do mundo'} (abundância ${Math.floor(amount)}/${k.capacity}).`, node: node.id }).then((r) => r && useGame.getState().toast('Oportunidade anunciada no quadro do Pacto', 'gold'))}>📣 Anunciar oportunidade</button>}
      <button type="button" className="ghost" onClick={() => useEcos.getState().inspect(node.id)}>👁 Observar com calma</button>
    </aside>
  );
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
      {list.map(({ node, dist }) => <li key={node.id}><button type="button" className="ghost" onClick={() => useEcos.getState().select(node.id)}>{CATEGORIES[NODE_KINDS[node.kind].category].icon} {nodeName(node)} · {Math.round(dist)} m</button></li>)}
    </ul>
  );
}
