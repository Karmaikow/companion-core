/**
 * O Administrador → Companions: todos os Companions como ícones redondos (imagem e nome). Clicar abre a ficha:
 * identidade, progressão (nível, XP), coleta (materiais na mochila do Ecos), Pacto, Constelação e os pedidos de
 * arte da Fábrica (prompts, envio de imagem/modelo/animações, habilidades e animações, Refúgio, aprovação).
 */
import { useEffect, useMemo, useState } from 'react';
import { ELEMENTS, SPECIES, STATS, STAT_KEYS, RESONANCES, QUESTS, type Discoveries, type IdentityContractV1, type SpeciesKey, type StatKey } from '@rules';
import { supabase } from '../backend/online';
import { keyLabel } from './PactoPanel';
import type { Job } from './AdminPanel';

interface Card { id: string; owner: string; name: string; stage: string; form: SpeciesKey | null; element: keyof typeof ELEMENTS | null; color: string; level: number; xp: number; createdAt: string; updatedAt: string; job: string | null; artUrl: string | null }
interface Detail {
  companion: { id: string; owner: string; stage: string; discoveries: Discoveries; contract: IdentityContractV1 | null; createdAt: string; awakenedAt: string | null; updatedAt: string; lastActivity: string | null; lastEvent: string | null };
  progress: { level: number; xp: number; from: number; to: number; boost: number; questsDone: number; questsTotal: number; quests: { key: string; status: string }[]; memories: number; diary: number; recipes: number; secrets: number; events: number; kills: number; species: number };
  gathering: { totalItems: number; stacks: number; bag: { batch_key: string; qty: number }[]; tools: string[]; knownMaterials: number; techniques: string[] };
  pacto: { lumes: number; testClass: string | null; equipment: { blueprint: string; kind: string; durability: number; max_durability: number; status: string }[] };
  build: null | { version: number; stage: number; budget: number; active: { alloc: Record<StatKey, number>; resonance: keyof typeof RESONANCES | null }; profiles: { id: string; name: string }[]; pending: unknown; derived: { hpMax: number; spMax: number; physPower: number; magPower: number; physReduction: number; magReduction: number; attackSpeed: number; castTime: number; moveSpeed: number } | null };
}

async function call<T>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase().functions.invoke('refuge', { body: { action, ...extra } });
  if (error) {
    let msg = 'Falha ao falar com o servidor.';
    try { const b = await (error as { context?: Response }).context?.json(); if (b?.error) msg = b.error; } catch { /* mantém */ }
    throw new Error(msg);
  }
  return data as T;
}

const STAGE: Record<string, string> = { particles: 'Partículas', awakened: 'Primeira forma' };
const JOB: Record<string, string> = { queued: 'Arte na fila', generating: 'Gerando', review: 'Em revisão', approved: 'No jogo', failed: 'Falhou' };
const date = (s?: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

type Filter = 'todos' | 'pendentes' | 'despertos' | 'particulas';

export function CompanionsAdmin({ jobs, renderJob, reloadKey }: { jobs: Job[]; renderJob: (j: Job) => React.ReactElement; reloadKey: unknown }) {
  const [list, setList] = useState<Card[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('c'));
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('todos');
  const load = () => { setErr(null); call<{ companions: Card[] }>('admin.companions').then((r) => setList(r.companions), (e) => setErr((e as Error).message)); };
  useEffect(load, [reloadKey]);
  const shown = useMemo(() => (list ?? []).filter((c) =>
    (!q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase())) &&
    (filter === 'todos' || (filter === 'pendentes' ? !!c.job && c.job !== 'approved' : filter === 'despertos' ? c.stage === 'awakened' : c.stage === 'particles')),
  ), [list, q, filter]);
  const pending = (list ?? []).filter((c) => c.job && c.job !== 'approved').length;
  const pick = (id: string | null) => { setSel(id); history.replaceState(null, '', '#/admin' + (id ? '?c=' + id : '')); };

  return (
    <div className="adm-comps">
      <div className="adm-comps-bar">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pelo nome" aria-label="Buscar Companion" />
        <div className="adm-chips" role="radiogroup" aria-label="Filtro">
          {([['todos', `Todos (${list?.length ?? 0})`], ['pendentes', `Arte pendente (${pending})`], ['despertos', 'Despertos'], ['particulas', 'Partículas']] as [Filter, string][]).map(([k, l]) => (
            <button key={k} role="radio" aria-checked={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <button className="ghost" onClick={load}>Atualizar</button>
      </div>
      {err && <p className="msg err">{err}</p>}
      {!list && !err && <p className="empty">Carregando Companions…</p>}
      <ul className="adm-gallery">
        {shown.map((c) => (
          <li key={c.id}>
            <button className={'adm-avatar' + (sel === c.id ? ' on' : '')} onClick={() => pick(sel === c.id ? null : c.id)} aria-pressed={sel === c.id} title={`${c.name} · ${STAGE[c.stage] ?? c.stage} · vínculo ${c.level}`}>
              <span className="adm-face" style={c.artUrl ? { backgroundImage: `url("${c.artUrl}")` } : { background: `radial-gradient(circle at 50% 42%, #fff 0 10%, ${c.color} 42%, #101828 74%)` }}>
                {c.job && c.job !== 'approved' && <i className="adm-dot" aria-label="arte pendente" />}
              </span>
              <b>{c.name}</b>
              <small>{c.form ? SPECIES[c.form].label : STAGE[c.stage] ?? c.stage} · nv {c.level}</small>
            </button>
          </li>
        ))}
        {list && !shown.length && <li className="empty">Nenhum Companion com esse filtro.</li>}
      </ul>
      {sel && <CompanionDetail id={sel} jobs={jobs.filter((j) => j.companionId === sel)} renderJob={renderJob} onClose={() => pick(null)} />}
    </div>
  );
}

function CompanionDetail({ id, jobs, renderJob, onClose }: { id: string; jobs: Job[]; renderJob: (j: Job) => React.ReactElement; onClose: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'ficha' | 'fabrica'>('ficha');
  useEffect(() => { setD(null); setErr(null); call<Detail>('admin.companion', { companionId: id }).then(setD, (e) => setErr((e as Error).message)); }, [id]);
  if (err) return <section className="adm-detail"><p className="msg err">{err}</p></section>;
  if (!d) return <section className="adm-detail"><p className="empty">Abrindo a ficha…</p></section>;
  const c = d.companion, ds = c.discoveries, k = c.contract, p = d.progress;
  const sp = ds.form ? SPECIES[ds.form] : null;
  const pct = Math.round(((p.xp - p.from) / Math.max(1, p.to - p.from)) * 100);
  const art = jobs.find((j) => j.artUrl)?.artUrl;
  return (
    <section className="adm-detail" aria-label={`Ficha de ${ds.name ?? 'Companion'}`}>
      <header className="adm-detail-head">
        <span className="adm-face big" style={art ? { backgroundImage: `url("${art}")` } : { background: `radial-gradient(circle at 50% 42%, #fff 0 10%, ${ds.color ?? '#9fb4ff'} 42%, #101828 74%)` }} />
        <div>
          <h2>{ds.name ?? 'Sem nome'}</h2>
          <p>{STAGE[c.stage] ?? c.stage}{sp ? ` · ${sp.label}` : ''}{ds.element ? ` · ${ELEMENTS[ds.element].label}` : ''} · {ds.pronoun === 'ele' ? 'ele' : 'ela'} · de {ds.playerName ?? '—'} <small>(conta {c.owner}…)</small></p>
        </div>
        <button className="close" onClick={onClose} aria-label="Fechar a ficha">×</button>
      </header>
      <nav className="st-tabs" aria-label="Ficha">
        <button className={tab === 'ficha' ? 'on' : ''} onClick={() => setTab('ficha')}>Ficha</button>
        <button className={tab === 'fabrica' ? 'on' : ''} onClick={() => setTab('fabrica')}>Fábrica (arte, modelo, animações){jobs.length ? <em>{jobs.length}</em> : null}</button>
      </nav>

      {tab === 'ficha' ? (
        <div className="adm-cards">
          <article className="adm-card">
            <h3>Progressão</h3>
            <div className="adm-big"><span><small>Nível (vínculo)</small><b>{p.level}</b></span><span><small>XP</small><b>{p.xp}</b></span><span><small>Estágio</small><b>{d.build?.stage ?? p.level}</b></span></div>
            <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: pct + '%' }} /></div>
            <small>{p.xp - p.from} / {p.to - p.from} XP até o nível {p.level + 1}{p.boost ? ` · impulso: ${p.boost} mensagens` : ''}</small>
            <dl className="adm-dl">
              <dt>Quests</dt><dd>{p.questsDone}/{p.questsTotal} {QUESTS.map((qd) => <span key={qd.key} className={'adm-q' + (p.quests.find((x) => x.key === qd.key)?.status === 'done' ? ' ok' : '')} title={qd.title}>{qd.title}</span>)}</dd>
              <dt>Memórias · diário · receitas · segredos</dt><dd>{p.memories} · {p.diary} · {p.recipes} · {p.secrets}</dd>
              <dt>Combate</dt><dd>{p.kills} criaturas acalmadas · {p.species} espécies no bestiário</dd>
              <dt>Eventos</dt><dd>{p.events} · último: {c.lastEvent ?? '—'} ({date(c.lastActivity)})</dd>
              <dt>Datas</dt><dd>nasceu {date(c.createdAt)}{c.awakenedAt ? ` · despertou ${date(c.awakenedAt)}` : ''}</dd>
            </dl>
          </article>

          <article className="adm-card">
            <h3>Coleta (Ecos da Terra)</h3>
            <div className="adm-big"><span><small>Materiais</small><b>{d.gathering.totalItems}</b></span><span><small>Pilhas</small><b>{d.gathering.stacks}</b></span><span><small>Lumes</small><b>{d.pacto.lumes}</b></span></div>
            {d.gathering.bag.length ? (
              <ul className="adm-bag">{d.gathering.bag.slice(0, 30).map((b) => <li key={b.batch_key}><span>{keyLabel(b.batch_key)}</span><b>{b.qty}</b></li>)}</ul>
            ) : <p className="empty">Mochila vazia (a coleta acontece no Vale dos Ecos).</p>}
            <small>Ferramentas: {d.gathering.tools.join(', ') || 'nenhuma'} · materiais conhecidos: {d.gathering.knownMaterials} · técnicas: {d.gathering.techniques.join(', ') || '—'}</small>
            <small>Peças forjadas: {d.pacto.equipment.length ? d.pacto.equipment.map((e) => `${e.blueprint} (${e.durability}/${e.max_durability})`).join(', ') : 'nenhuma'}{d.pacto.testClass ? ` · classe de teste: ${d.pacto.testClass}` : ''}</small>
          </article>

          <article className="adm-card">
            <h3>Identidade</h3>
            <dl className="adm-dl">
              <dt>Classe</dt><dd>{sp ? `${sp.label} — ${sp.lineage}` : 'ainda não descoberta'}{ds.species ? ` (“${ds.species}”)` : ''}</dd>
              <dt>Essência</dt><dd>{ds.element ? ELEMENTS[ds.element].label : '—'}</dd>
              <dt>Cor</dt><dd>{ds.color ? <><i className="adm-swatch" style={{ background: ds.color }} /> {ds.colorName ?? ds.color}</> : '—'}</dd>
              <dt>Traços</dt><dd>{ds.traits?.join(', ') || '—'}</dd>
              <dt>Sonho</dt><dd>{ds.dream ?? '—'}</dd>
              <dt>Chama a pessoa de</dt><dd>{ds.playerAddress ?? '—'}</dd>
              {k && <><dt>Forma no contrato</dt><dd>{k.species.description}</dd></>}
            </dl>
            {k && <div className="palette" aria-label="Paleta">{Object.entries(k.palette).map(([n, v]) => <span key={n} title={`${n} ${v}`} style={{ background: v }} />)}</div>}
          </article>

          <article className="adm-card">
            <h3>Constelação</h3>
            {d.build ? (<>
              <p className="adm-stats">{STAT_KEYS.map((s) => <span key={s}>{STATS[s].short} <b>{d.build!.active.alloc[s]}</b></span>)}</p>
              <small>{Object.values(d.build.active.alloc).reduce((t, v) => t + v, 0)} de {d.build.budget} pontos · Ressonância: {d.build.active.resonance ? RESONANCES[d.build.active.resonance].name : 'nenhuma'} · {d.build.profiles.length} perfil(is) · versão {d.build.version}{d.build.pending ? ' · troca pendente' : ''}</small>
              {d.build.derived && <p className="adm-derived">HP {d.build.derived.hpMax} · SP {d.build.derived.spMax} · física {d.build.derived.physPower}% · mágica {d.build.derived.magPower}% · defesa {Math.round(d.build.derived.physReduction * 100)}% · resist. {Math.round(d.build.derived.magReduction * 100)}% · ataque ×{d.build.derived.attackSpeed} · conjuração ×{d.build.derived.castTime} · movimento ×{d.build.derived.moveSpeed}</p>}
            </>) : <p className="empty">Sem build ainda.</p>}
          </article>
        </div>
      ) : (
        <div className="jobs">
          {jobs.length ? jobs.map((j) => <div key={j.id}>{renderJob(j)}</div>) : <p className="empty">Nenhum pedido de arte: o pedido nasce quando o Companion desperta.</p>}
        </div>
      )}
    </section>
  );
}
