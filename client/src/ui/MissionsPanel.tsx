/**
 * Painel "Missões" (Jornada): prontas para receber, em andamento (com progresso e entrega de materiais), disponíveis e,
 * recolhidas, as bloqueadas e as concluídas. O progresso vem do servidor. Missões dadas por um prédio de Áster (Casa
 * dos Ecos, escolas) se pegam, entregam e recebem lá (`MissionList` com `at`); aqui elas só mostram o andamento.
 */
import { useEffect, useState } from 'react';
import {
  MISSION_RARITIES, MISSION_REPEATS, MISSION_GIVERS, CREATURE_FAMILIES, DEFAULT_CREATURES, objectiveLabel, batchFits, batchKey, parseBatchKey, unlockText,
  type MissionDef, type MissionGiver,
} from '@rules';
import { useMissions, type MissionEntry, type MissionStatus } from '../missions/missionsStore';
import { useEcos, bagBatches, batchLabel } from '../ecos/ecosStore';
import { ecosWorld } from '../ecos/worldNodes';
import { useGame } from '../store';

const rid = () => crypto.randomUUID();
const pretty = (s: string) => s.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
export const missionNames = (kind: 'creature' | 'family' | 'biome', slug: string) =>
  kind === 'family' ? CREATURE_FAMILIES.find((f) => f.id === slug)?.name ?? pretty(slug)
    : kind === 'biome' ? ecosWorld()?.biomes.find((b) => b.slug === slug)?.name ?? pretty(slug)
      : CREATURE_FAMILIES.flatMap((f) => f.creatures).find((m) => m.slug === slug)?.name ?? DEFAULT_CREATURES.find((c) => c.slug === slug)?.name ?? pretty(slug);

export function rewardText(rw: MissionDef['rewards']): string {
  const parts = [
    rw.lumes ? `${rw.lumes} Lumes` : '',
    rw.bond ? `+${rw.bond} de vínculo` : '',
    ...rw.materials.map((m) => { const p = parseBatchKey(m.key); return p ? `${m.qty}× ${batchLabel(m.key)}` : ''; }),
    ...rw.items.map((i) => `${i.qty}× ${pretty(i.item)}`),
    rw.unlock ? unlockText(rw.unlock) : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'reconhecimento';
}

const GROUPS: { status: MissionStatus; title: string; open: boolean }[] = [
  { status: 'pronta', title: 'Prontas para receber', open: true },
  { status: 'ativa', title: 'Em andamento', open: true },
  { status: 'disponivel', title: 'Disponíveis', open: true },
  { status: 'bloqueada', title: 'Ainda não dá', open: false },
  { status: 'concluida', title: 'Concluídas', open: false },
];

export function MissionsPanel() {
  const view = useMissions((s) => s.view), error = useMissions((s) => s.error);
  const stage = useGame((s) => s.snap?.companion?.stage);
  const online = useGame((s) => s.backend?.kind === 'online');
  useEffect(() => { if (stage === 'awakened' && online) { void useMissions.getState().refresh(); if (!useEcos.getState().view) void useEcos.getState().refresh(); } }, [stage, online]);
  if (stage !== 'awakened') return <p className="empty">As missões começam depois do despertar.</p>;
  if (!online) return <p className="empty">As missões funcionam só conectado (online).</p>;
  return (
    <div className="missions-tab">
      {error && <p className="ecos-error" role="alert">{error}</p>}
      {!view ? <p className="hint">Carregando as missões…</p> : !view.missions.length ? <p className="empty">Nenhuma missão publicada ainda.</p> : (
        <>
          <p className="hint">Em andamento: {view.active}/{view.maxActive}. O progresso conta o que acontecer depois de aceitar.</p>
          {GROUPS.map((g) => {
            const list = view.missions.filter((m) => m.status === g.status);
            if (!list.length) return null;
            const body = <ul className="mission-list">{list.map((m) => <MissionCard key={m.def.slug} m={m} at="livre" />)}</ul>;
            return g.open
              ? <section key={g.status} className="mission-group"><h4>{g.title} <small>{list.length}</small></h4>{body}</section>
              : <details key={g.status} className="mission-group"><summary>{g.title} <small>{list.length}</small></summary>{body}</details>;
          })}
        </>
      )}
    </div>
  );
}

/** Missões de um lugar (Casa dos Ecos, escolas): as que ele dá, prontas e em andamento primeiro. */
export function MissionList({ giver }: { giver: MissionGiver }) {
  const view = useMissions((s) => s.view), error = useMissions((s) => s.error);
  const online = useGame((s) => s.backend?.kind === 'online');
  useEffect(() => { if (online) void useMissions.getState().refresh(); }, [online]);
  if (!online) return <p className="empty">As missões funcionam só conectado (online).</p>;
  const order: MissionStatus[] = ['pronta', 'ativa', 'disponivel', 'bloqueada', 'concluida'];
  const list = (view?.missions ?? []).filter((m) => m.def.giver === giver).sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  return (
    <div className="missions-tab">
      {error && <p className="ecos-error" role="alert">{error}</p>}
      {!view ? <p className="hint">Carregando as missões…</p> : !list.length ? <p className="empty">Nenhuma missão por aqui agora. Volte depois.</p>
        : <ul className="mission-list">{list.map((m) => <MissionCard key={m.def.slug} m={m} at={giver} />)}</ul>}
    </div>
  );
}

function MissionCard({ m, at }: { m: MissionEntry; at: MissionGiver }) {
  const busy = useMissions((s) => s.busy === m.def.slug);
  const r = MISSION_RARITIES[m.def.rarity];
  const run = (action: string, body: Record<string, unknown> = {}) => void useMissions.getState().call(action, { mission: m.def.slug, at, ...body });
  const live = m.status === 'ativa' || m.status === 'pronta';
  // missão de um prédio: aqui só se ela for deste lugar
  const here = m.def.giver === 'livre' || m.def.giver === at;
  const where = MISSION_GIVERS[m.def.giver].replace(/ \(Áster\)$/, '');
  return (
    <li className={'mission-card ' + m.status + (m.def.rarity === 'lendaria' ? ' lendaria' : '')} style={{ ['--rarity' as string]: r.color }}>
      <header>
        <b><i className="look-dot" style={{ background: r.color }} />{m.def.name}</b>
        <small>{r.label} · {MISSION_REPEATS[m.def.repeat]} · {MISSION_GIVERS[m.def.giver]}</small>
      </header>
      {m.def.description && <p className="hint">{m.def.description}</p>}
      <ol className="mission-objs">
        {m.def.objectives.map((o, i) => {
          const have = m.progress[i] ?? 0, done = have >= o.qty;
          return (
            <li key={i} className={done ? 'done' : ''}>
              <span>{done ? '✓ ' : ''}{objectiveLabel(o, missionNames)}</span>
              {live && <><span className="mission-count">{have}/{o.qty}</span><div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={o.qty} aria-valuenow={have}><i style={{ width: `${Math.min(100, (have / o.qty) * 100)}%` }} /></div></>}
              {m.status === 'ativa' && o.kind === 'entregar' && !done && (here ? <Deliver m={m} idx={i} at={at} /> : <small className="hint">Entregue na {where}.</small>)}
              {m.status === 'ativa' && o.kind !== 'entregar' && !done && (o.kind === 'coletar') && (
                <button type="button" className="link" onClick={() => { useEcos.getState().setObjective({ label: objectiveLabel(o, missionNames), qty: o.qty - have, match: { category: o.category, materials: o.material ? [o.material] : undefined, prop: o.prop, min: o.min }, source: 'receita' }); useGame.getState().toast('Objetivo de coleta marcado', 'soft'); }}>marcar na coleta</button>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mission-reward">Prêmio: {rewardText(m.def.rewards)}</p>
      {m.block && <p className="ap-why">{m.block}</p>}
      {!here && (m.status === 'disponivel' || m.status === 'pronta') && <p className="hint">{m.status === 'pronta' ? 'Receba o prêmio' : 'Pegue esta missão'} na {where}, em Áster.</p>}
      <div className="row">
        {m.status === 'disponivel' && here && <button type="button" className="primary" disabled={busy} onClick={() => run('missions.accept')}>Aceitar</button>}
        {m.status === 'pronta' && here && <button type="button" className="primary" disabled={busy} onClick={() => run('missions.claim')}>Receber prêmio</button>}
        {live && <button type="button" className="link" disabled={busy} onClick={() => run('missions.abandon')}>largar</button>}
      </div>
    </li>
  );
}

/** Entregar: escolhe um lote da mochila de coleta que sirva e entrega até completar. */
function Deliver({ m, idx, at }: { m: MissionEntry; idx: number; at: MissionGiver }) {
  const ecos = useEcos((s) => s.view);
  const busy = useMissions((s) => s.busy === m.def.slug);
  const o = m.def.objectives[idx], need = o.qty - (m.progress[idx] ?? 0);
  const fits = bagBatches(ecos).filter((b) => batchFits(o, batchKey(b.material, b.bands)));
  const [key, setKey] = useState('');
  const sel = fits.find((b) => b.key === key) ?? fits[0];
  if (!fits.length) return <small className="hint">Nada na mochila de coleta serve aqui ainda.</small>;
  return (
    <div className="mission-deliver">
      <select value={sel?.key} onChange={(e) => setKey(e.target.value)} aria-label="Lote para entregar">
        {fits.map((b) => <option key={b.key} value={b.key}>{b.qty}× {batchLabel(b.key)}</option>)}
      </select>
      <button type="button" className="ghost" disabled={busy || !sel} onClick={async () => {
        const r = await useMissions.getState().call('missions.deliver', { mission: m.def.slug, at, request: rid(), objective: idx, key: sel!.key, qty: Math.min(need, sel!.qty) });
        if (r?.delivered) { useGame.getState().toast(`Entregue: ${r.delivered.accepted}`, 'soft'); void useEcos.getState().refresh(); }
      }}>Entregar {Math.min(need, sel?.qty ?? 0)}</button>
    </div>
  );
}
