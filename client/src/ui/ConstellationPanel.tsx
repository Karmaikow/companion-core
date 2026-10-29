/**
 * Constelação Viva: distribuir os seis atributos, escolher uma Ressonância, salvar perfis e aplicar.
 * - Painel (aba Habilidades → Constelação): resumo e o botão que abre a tela inteira.
 * - Tela: no PC, distribuição à esquerda, constelação no centro, comparação à direita, Ressonância embaixo e
 *   ações no rodapé; no celular, tudo em coluna, com botões grandes e a comparação recolhível.
 * Tudo que aparece vem dos cálculos reais (constellation.ts); a fala do Companion também (explainBuild, sem IA).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { SchoolJournalPanel } from './SchoolJournalPanel';
import { createPortal } from 'react-dom';
import {
  RESONANCES, RESONANCE_KEYS, STATS, STAT_KEYS, SPECIES, CLASS_SUGGESTION, explainBuild, distribute, resonanceStrength, usedPoints, buildReport,
  type DerivedStats, type ResonanceKey, type StatKey, type BuildProfile,
} from '@rules';
import { useGame } from '../store';
import { useBuild, useDraft, useDeriveInput, derive, freePoints, localBlockers } from '../build/buildStore';

const fmt = (n: number, d = 0) => n.toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d });
interface Row { key: string; label: string; get: (d: DerivedStats) => number; show: (n: number) => string; better: 'up' | 'down'; why: string }
const ROWS: Row[] = [
  { key: 'hpMax', label: 'HP máximo', get: (d) => d.hpMax, show: (n) => fmt(n), better: 'up', why: 'Vitalidade' },
  { key: 'spMax', label: 'SP máximo', get: (d) => d.spMax, show: (n) => fmt(n), better: 'up', why: 'Espírito' },
  { key: 'spRegen', label: 'SP por segundo', get: (d) => d.spRegen, show: (n) => fmt(n, 2), better: 'up', why: 'Espírito' },
  { key: 'physPower', label: 'Potência física', get: (d) => d.physPower, show: (n) => fmt(n, 1) + '%', better: 'up', why: 'Força' },
  { key: 'magPower', label: 'Potência mágica', get: (d) => d.magPower, show: (n) => fmt(n, 1) + '%', better: 'up', why: 'Magia' },
  { key: 'physReduction', label: 'Defesa física (redução)', get: (d) => d.physReduction, show: (n) => fmt(n * 100, 1) + '%', better: 'up', why: 'Vitalidade' },
  { key: 'magReduction', label: 'Resistência mágica', get: (d) => d.magReduction, show: (n) => fmt(n * 100, 1) + '%', better: 'up', why: 'Espírito' },
  { key: 'attackSpeed', label: 'Velocidade de ataque', get: (d) => d.attackSpeed, show: (n) => '×' + fmt(n, 2), better: 'up', why: 'Agilidade (frequência)' },
  { key: 'castTime', label: 'Tempo de conjuração', get: (d) => d.castTime, show: (n) => '×' + fmt(n, 2), better: 'down', why: 'Agilidade (duração)' },
  { key: 'moveSpeed', label: 'Movimento', get: (d) => d.moveSpeed, show: (n) => '×' + fmt(n, 2), better: 'up', why: 'Classe + um pouco de Agilidade' },
  { key: 'precision', label: 'Precisão', get: (d) => d.precision, show: (n) => fmt(n * 100, 0) + '%', better: 'up', why: 'Destreza' },
  { key: 'guard', label: 'Guarda contra magia', get: (d) => d.guard.magicCut, show: (n) => fmt(n * 100, 0) + '%', better: 'up', why: 'Defesa (E) · Bastião' },
];

/** Resumo dentro da aba Habilidades. */
export function ConstellationSummary({ onOpen }: { onOpen: () => void }) {
  const view = useBuild((s) => s.view);
  const inp = useDeriveInput();
  useEffect(() => { if (!view) void useBuild.getState().refresh(); }, [view]);
  if (!view) return <p className="empty">Abrindo a constelação…</p>;
  const d = derive(view.active, inp);
  const free = view.budget - usedPoints(view.active.alloc);
  return (
    <div className="cv-summary">
      <div className="cv-mini" aria-hidden><Constellation alloc={view.active.alloc} resonance={view.active.resonance} small /></div>
      <div>
        <p><b>{free > 0 ? `${free} ponto${free > 1 ? 's' : ''} livre${free > 1 ? 's' : ''}` : 'Todos os pontos distribuídos'}</b> · {view.budget} no estágio {view.stage}{view.bonus?.points ? ` (+${view.bonus.points} das quests secretas)` : ''}</p>
        {view.bonus && <p className="hint">Quests secretas: {view.bonus.secrets} · a cada 10, +10 pontos de Constelação (faltam {view.bonus.nextIn}).</p>}
        <p className="cv-stats">{STAT_KEYS.map((k) => <span key={k}>{STATS[k].short} <b>{view.active.alloc[k]}</b></span>)}</p>
        <p>HP {d.hpMax} · SP {d.spMax} · Física {fmt(d.physPower)}% · Mágica {fmt(d.magPower)}%{view.active.resonance ? ` · ${RESONANCES[view.active.resonance].name}` : ''}</p>
        {view.pending && <p className="cv-warn" role="status">Troca pendente: {view.pending.reason}</p>}
        {view.simulated && <p className="hint">Offline: simulado neste aparelho.</p>}
        <button className="primary" onClick={onOpen}>Abrir a Constelação</button>
      </div>
    </div>
  );
}

/** Desenho da constelação: seis estrelas em volta do Companion; o tamanho e o brilho seguem os pontos. Só visual. */
function Constellation({ alloc, prev, resonance, small, onStar }: { alloc: Record<StatKey, number>; prev?: Record<StatKey, number>; resonance: ResonanceKey | null; small?: boolean; onStar?: (k: StatKey) => void }) {
  const c = useGame((s) => s.snap?.companion);
  const R = 38, max = Math.max(6, ...STAT_KEYS.map((k) => alloc[k]));
  const pos = (i: number) => { const a = -Math.PI / 2 + (i * Math.PI * 2) / 6; return [50 + Math.cos(a) * R, 50 + Math.sin(a) * R] as const; };
  const linked = resonance ? (resonance === 'precisao' ? ['destreza', alloc.forca >= alloc.magia ? 'forca' : 'magia'] : RESONANCES[resonance].stats) : [];
  const shape = STAT_KEYS.map((k, i) => { const [x, y] = pos(i); const f = 0.18 + 0.82 * (alloc[k] / max); return `${50 + (x - 50) * f},${50 + (y - 50) * f}`; }).join(' ');
  return (
    <svg viewBox="0 0 100 100" className={'cv-svg' + (small ? ' small' : '')} role="img" aria-label={'Constelação: ' + STAT_KEYS.map((k) => `${STATS[k].label} ${alloc[k]}`).join(', ')}>
      <polygon points={STAT_KEYS.map((_, i) => pos(i).join(',')).join(' ')} className="cv-ring" />
      <polygon points={shape} className="cv-shape" />
      {linked.length >= 2 && (() => { const a = pos(STAT_KEYS.indexOf(linked[0] as StatKey)), b = pos(STAT_KEYS.indexOf(linked[1] as StatKey)); return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="cv-link" />; })()}
      <circle cx="50" cy="50" r="11" className="cv-core" style={{ fill: c?.discoveries.color ?? '#9fb4ff' }} />
      {STAT_KEYS.map((k, i) => {
        const [x, y] = pos(i), v = alloc[k], ch = prev ? v - prev[k] : 0;
        const rr = 2.4 + Math.min(4.5, Math.sqrt(v) * 0.9);
        return (
          <g key={k} className={'cv-star' + (linked.includes(k) ? ' linked' : '')} onClick={onStar ? () => onStar(k) : undefined}>
            <circle cx={x} cy={y} r={rr} />
            {!small && <text x={x} y={y + (y > 50 ? 10 : -7)} textAnchor="middle">{STATS[k].short} {v}{ch ? (ch > 0 ? ` +${ch}` : ` ${ch}`) : ''}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/** Tela inteira da Constelação. */
export function ConstellationScreen({ onClose }: { onClose: () => void }) {
  const view = useBuild((s) => s.view), busy = useBuild((s) => s.busy), error = useBuild((s) => s.error), notice = useBuild((s) => s.notice);
  const draft = useDraft();
  const editing = !!useBuild((s) => s.draft);
  const history = useBuild((s) => s.history);
  const inp = useDeriveInput();
  const c = useGame((s) => s.snap?.companion);
  const he = c?.discoveries.pronoun === 'ele';
  const [name, setName] = useState('');
  const [blockers, setBlockers] = useState<string[]>([]);
  const dlg = useRef<HTMLDivElement>(null);
  const [wide] = useState(() => typeof window === 'undefined' || window.matchMedia('(min-width: 901px)').matches);
  useEffect(() => { void useBuild.getState().refresh(); }, []);
  useEffect(() => { const t = window.setInterval(() => setBlockers(localBlockers()), 1000); setBlockers(localBlockers()); return () => window.clearInterval(t); }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key); dlg.current?.focus();
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const cur = useMemo(() => (view ? derive(view.active, inp) : null), [view, inp.species, inp.stage, inp.tree, inp.equipment]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = useMemo(() => (draft ? derive(draft, inp) : null), [draft, inp.species, inp.stage, inp.tree, inp.equipment]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!view || !draft || !cur || !next) return <div className="cv-screen" role="dialog" aria-modal="true"><p className="empty">Abrindo a constelação…</p></div>;
  const st = useBuild.getState();
  const free = freePoints(view, draft);
  const changed = editing && (STAT_KEYS.some((k) => draft.alloc[k] !== view.active.alloc[k]) || draft.resonance !== view.active.resonance);
  const allBlock = [...new Set([...blockers, ...(view.blockers ?? [])])];
  const words = explainBuild(cur, next, he);
  const rep = buildReport(next), repCur = buildReport(cur);
  const sp = inp.species ? SPECIES[inp.species] : null;
  const suggest = () => st.loadDraft({ alloc: distribute(view.budget, inp.species ? CLASS_SUGGESTION[inp.species] : { vitalidade: 1, forca: 1, magia: 1, agilidade: 1, destreza: 1, espirito: 1 }), resonance: draft.resonance });
  const profile = (p: BuildProfile) => st.loadDraft({ alloc: p.alloc, resonance: p.resonance });

  return (
    <div className="cv-screen" role="dialog" aria-modal="true" aria-labelledby="cv-title" ref={dlg} tabIndex={-1}>
      <header className="cv-head">
        <div>
          <h2 id="cv-title">Constelação Viva</h2>
          <small>{c?.discoveries.name ?? 'Companion'}{sp ? ` · ${sp.label}` : ''} · estágio {view.stage} · classe, essência, ofício e memórias não mudam com a build{view.simulated ? ' · offline (simulado)' : ''}</small>
        </div>
        <button className="close" onClick={onClose} aria-label="Fechar a Constelação">×</button>
      </header>
      {error && <p className="cv-error" role="alert" onClick={() => st.clear()}>{error}</p>}
      {notice && <p className="cv-notice" role="status" onClick={() => st.clear()}>{notice}</p>}
      {view.pending && (
        <p className="cv-warn" role="status">Troca pendente ({view.pending.reason}). Ela entra sozinha quando der. <button className="link" disabled={!!busy} onClick={() => void st.call('build.cancelPending')}>Cancelar a pendência</button></p>
      )}

      <div className="cv-grid">
        <section className="cv-left" aria-label="Distribuição">
          <div className={'cv-points' + (free > 0 ? ' has' : '')} aria-live="polite"><b>{free}</b> livre{free === 1 ? '' : 's'} · {usedPoints(draft.alloc)} de {view.budget} usados</div>
          <ul className="cv-attrs">
            {STAT_KEYS.map((k) => {
              const v = draft.alloc[k], was = view.active.alloc[k];
              return (
                <li key={k} className={v !== was ? 'changed' : ''}>
                  <div className="cv-attr-name"><span aria-hidden>{STATS[k].icon}</span> <b>{STATS[k].label}</b><small>{STATS[k].does}. {STATS[k].doesNot}.</small></div>
                  <div className="cv-step">
                    <button aria-label={`Tirar um ponto de ${STATS[k].label}`} disabled={v <= 0} onClick={() => st.setPoint(k, v - 1)}>−</button>
                    <input type="number" inputMode="numeric" min={0} max={v + free} value={v} aria-label={STATS[k].label} onChange={(e) => st.setPoint(k, Number(e.target.value))} />
                    <button aria-label={`Pôr um ponto em ${STATS[k].label}`} disabled={free <= 0} onClick={() => st.setPoint(k, v + 1)}>+</button>
                  </div>
                  {v !== was && <small className="cv-was">era {was}</small>}
                </li>
              );
            })}
          </ul>
          <div className="cv-row">
            <button className="ghost" onClick={suggest} title="Distribuição sugerida pela classe (editável; não é bônus)">Sugestão da classe</button>
            <button className="ghost" onClick={() => st.loadDraft({ alloc: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])) as never, resonance: draft.resonance })}>Zerar</button>
          </div>
        </section>

        <section className="cv-center" aria-label="Constelação">
          <Constellation alloc={draft.alloc} prev={view.active.alloc} resonance={draft.resonance} onStar={(k) => free > 0 && st.setPoint(k, draft.alloc[k] + 1)} />
          <div className="cv-voice" aria-live="polite">
            <b>{c?.discoveries.name ?? 'Companion'}:</b>
            <ul>{(changed ? words : ['Este é o meu jeito de lutar agora. Mexa nas estrelas para ver como eu mudaria.']).map((w, i) => <li key={i}>“{w}”</li>)}</ul>
          </div>
        </section>

        <section className="cv-right" aria-label="Comparação">
          <details open={wide} className="cv-compare">
            <summary>Atual → prévia</summary>
            <table>
              <thead><tr><th>Resultado</th><th>Atual</th><th>Prévia</th></tr></thead>
              <tbody>
                {ROWS.map((r) => {
                  const a = r.get(cur), b = r.get(next), diff = b - a, good = r.better === 'up' ? diff > 0 : diff < 0;
                  return (
                    <tr key={r.key} className={Math.abs(diff) > 1e-9 ? (good ? 'up' : 'down') : ''}>
                      <th scope="row" title={r.why}>{r.label}</th><td>{r.show(a)}</td>
                      <td>{r.show(b)}{Math.abs(diff) > 1e-9 && <em>{good ? ' ▲ melhor' : ' ▼ pior'}</em>}</td>
                    </tr>
                  );
                })}
                <tr><th scope="row">HP efetivo físico / mágico</th><td>{repCur.ehpPhys} / {repCur.ehpMag}</td><td>{rep.ehpPhys} / {rep.ehpMag}</td></tr>
                <tr><th scope="row">Dano sustentado golpe / magia</th><td>{fmt(repCur.sustainedPhys, 1)} / {fmt(repCur.sustainedMag, 1)}</td><td>{fmt(rep.sustainedPhys, 1)} / {fmt(rep.sustainedMag, 1)}</td></tr>
              </tbody>
            </table>
          </details>
          <details className="cv-sources">
            <summary>Valores exatos e origem</summary>
            <ul>{Object.entries(next.sources).map(([k, list]) => <li key={k}><b>{ROWS.find((r) => r.key === k)?.label ?? k}</b>: {(list ?? []).map((s) => `${s.label} ${s.value > 0 ? '+' : ''}${s.value}`).join(' · ')}</li>)}</ul>
            <p className="hint">Ordem: base do estágio → pontos (com retorno decrescente) → % de árvore e equipamento → Ressonância → efeitos temporários. Stamina tem base própria; HP e SP atuais nunca sobem pela troca.</p>
          </details>
        </section>
      </div>

      <section className="cv-res" aria-label="Ressonância">
        <h3>Ressonância <small>(opcional, uma só)</small></h3>
        <div className="cv-res-list" role="radiogroup" aria-label="Ressonância">
          <button role="radio" aria-checked={!draft.resonance} className={!draft.resonance ? 'on' : ''} onClick={() => st.setResonance(null)}>Nenhuma<small>Sem benefício e sem contrapartida.</small></button>
          {RESONANCE_KEYS.map((k) => {
            const r = RESONANCES[k], s = resonanceStrength(k, draft.alloc);
            return (
              <button key={k} role="radio" aria-checked={draft.resonance === k} className={(draft.resonance === k ? 'on' : '') + (r.available ? '' : ' off')} disabled={!r.available} onClick={() => st.setResonance(k)}>
                {r.name} <small className="cv-res-stats">{k === 'precisao' ? 'Destreza + Força ou Magia' : r.stats.map((x) => STATS[x as StatKey].label).join(' + ')}</small>
                <small>✔ {r.benefit}</small><small>✖ {r.cost}</small><small className="d">Vale para: {r.affects}</small>
                <small className="d">{r.available ? `Força agora: ${Math.round(s * 100)}% (cresce com o menor dos dois atributos)` : `Em breve: ${r.why}`}</small>
              </button>
            );
          })}
        </div>
      </section>

      <footer className="cv-foot">
        <div className="cv-profiles">
          <label>Perfis
            <select value="" onChange={(e) => { const p = view.profiles.find((x) => x.id === e.target.value); if (p) profile(p); }} aria-label="Carregar perfil no rascunho">
              <option value="">{view.profiles.length ? 'Carregar um perfil…' : 'Nenhum perfil salvo'}</option>
              {view.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}{p.resonance ? ` · ${RESONANCES[p.resonance].name}` : ''}</option>)}
            </select>
          </label>
          <input value={name} maxLength={24} placeholder="Nome do perfil" aria-label="Nome do perfil" onChange={(e) => setName(e.target.value)} />
          <button className="ghost" disabled={!name.trim() || !!busy} onClick={async () => { const r = await st.call('build.profile.save', { profile: { name: name.trim(), alloc: draft.alloc, resonance: draft.resonance } }); if (r) setName(''); }}>Salvar perfil</button>
          {view.profiles.length > 0 && (
            <details className="cv-manage"><summary>Gerenciar</summary>
              <ul>{view.profiles.map((p) => (
                <li key={p.id}><span>{p.name}</span>
                  <button className="link" onClick={() => profile(p)}>carregar</button>
                  <button className="link" onClick={() => void st.call('build.profile.save', { profile: { id: p.id, name: p.name, alloc: draft.alloc, resonance: draft.resonance } })}>atualizar com o rascunho</button>
                  <button className="link" onClick={() => void st.call('build.profile.duplicate', { id: p.id })}>duplicar</button>
                  <button className="link" onClick={() => { if (window.confirm(`Excluir o perfil ${p.name}? A build aplicada não muda.`)) void st.call('build.profile.delete', { id: p.id }); }}>excluir</button>
                </li>))}</ul>
            </details>
          )}
          {inp.species === 'serpente' && <button className="link" onClick={() => void st.call('build.demo')} title="Conjurador, Guardião e Combatente físico — demonstração, não é balanceamento final">+ perfis de demonstração</button>}
        </div>
        <div className="cv-actions">
          <button className="ghost" disabled={!history.length} onClick={() => st.undo()}>Desfazer</button>
          <button className="ghost" disabled={!editing} onClick={() => st.discard()}>Descartar</button>
          <button className="primary" disabled={!changed || !!busy} onClick={() => void st.apply()} title={allBlock.length ? 'Fica pendente e entra sozinha quando der' : 'Aplicar agora'}>
            {busy === 'build.apply' ? 'Aplicando…' : allBlock.length ? 'Aplicar quando der' : 'Aplicar'}
          </button>
          {changed && <small className="cv-unsaved">Alterações ainda não aplicadas.</small>}
          {allBlock.length > 0 && <small className="cv-block">Agora não dá: {allBlock.join(' ')}</small>}
          <small className="hint">Trocar é de graça: não cura, não recupera SP nem stamina, não limpa efeitos nem reinicia recargas.</small>
        </div>
      </footer>
    </div>
  );
}

/** Aba Habilidades: Constelação (atributos) e Árvore (habilidades). */
export function SkillsPanel({ Tree }: { Tree: () => React.ReactElement | null }) {
  const [sub, setSub] = useState<'constelacao' | 'arvore' | 'escolas'>('constelacao');
  const [open, setOpen] = useState(false);
  return (
    <div className="skills-panel">
      <nav className="st-tabs" aria-label="Habilidades">
        <button className={sub === 'constelacao' ? 'on' : ''} onClick={() => setSub('constelacao')}>Constelação</button>
        <button className={sub === 'arvore' ? 'on' : ''} onClick={() => setSub('arvore')}>Árvore</button>
        <button className={sub === 'escolas' ? 'on' : ''} onClick={() => setSub('escolas')}>Escolas</button>
      </nav>
      {sub === 'constelacao' ? <ConstellationSummary onOpen={() => setOpen(true)} /> : sub === 'escolas' ? <SchoolJournalPanel /> : <Tree />}
      {open && createPortal(<ConstellationScreen onClose={() => setOpen(false)} />, document.body)}
    </div>
  );
}
