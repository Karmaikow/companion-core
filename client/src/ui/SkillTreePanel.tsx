/**
 * Árvore de habilidades do Companion: pontos (1 por nível de vínculo) para distribuir em quatro galhos — Essência,
 * Classe, Vínculo e Fusão (que pede pontos em galhos diferentes). Montada a partir do catálogo publicado na Forja.
 * Online, a distribuição fica na tabela companion_skill_alloc; offline, neste navegador. Redistribuir é de graça.
 * "Conquistar" compra o caminho inteiro até o nó (pré-requisitos com os pontos mínimos) ou diz quantos pontos faltam.
 */
import { BRANCH_COLOR, SkillTreeGraph } from './SkillTreeGraph';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ELEMENTS, SPECIES, STATUSES, SHAPES, canSpend, validateAllocation, treeEffects, spent, planTo, applyPlan, needOf, nodeBond,
  type Allocation, type TreeBranch, type TreeNode, type SkillTree, type SkillDef,
} from '@rules';
import { useSkillData, useSkills, persistAlloc } from './skillState';
import { useGame } from '../store';

const ATTR_LABEL: Record<string, string> = { vida: 'Vida', energia: 'Energia', poder: 'Poder', defesa: 'Defesa', agilidade: 'Agilidade', sintonia: 'Sintonia' };
const KIND_LABEL: Record<TreeNode['kind'], string> = { skill: 'Habilidade', rank: 'Nível', passive: 'Passiva', boost: 'Buff' };
const BRANCHES: TreeBranch[] = ['essencia', 'classe', 'vinculo', 'fusao'];

function NodeDetail({ node, tree, alloc, bond, points, catalog, saving, notice, add, remove, conquer }: {
  node: TreeNode; tree: SkillTree; alloc: Allocation; bond: number; points: number; catalog: SkillDef[]; saving: boolean;
  notice: { text: string; tone: 'ok' | 'warn' } | null;
  add: (n: TreeNode) => void; remove: (n: TreeNode) => void; conquer: (n: TreeNode) => void;
}) {
  const skill = node.skill && node.kind === 'skill' ? catalog.find((s) => s.slug === node.skill) : undefined;
  const blocked = canSpend(tree, alloc, node.id, bond, points);
  const rank = alloc[node.id] ?? 0, full = rank >= node.maxRank;
  const plan = full ? null : planTo(tree, alloc, node.id, bond);
  const free = Math.max(0, points - spent(alloc));
  const short = plan && !plan.blocked ? plan.cost - free : 0;
  return (
    <div className="st-detail" style={{ ['--branch' as string]: BRANCH_COLOR[node.branch] }}>
      <div className="st-detail-top">
        <span className="st-kind">{KIND_LABEL[node.kind]} · {tree.branches[node.branch].label}</span>
        <strong className="st-detail-name">{node.name}</strong>
        <div className="st-pips" aria-label={`${rank} de ${node.maxRank} pontos`}>{Array.from({ length: node.maxRank }, (_, i) => <i key={i} className={i < rank ? 'f' : ''} />)}</div>
      </div>
      <p className="st-detail-meta">Abre no vínculo {nodeBond(node)}{bond < nodeBond(node) ? ' 🔒' : ''} · Pontos: {rank}/{node.maxRank}</p>
      <p className="st-detail-desc">{node.description}</p>
      {skill && <small className="st-detail-skill">{SHAPES[skill.shape]}{skill.power ? ` · dano ${skill.power}` : ''}{skill.heal ? ` · cura ${skill.heal}` : ''}{skill.energy ? ` · energia ${skill.energy}` : ''} · recarga {skill.cooldown}s{skill.status ? ` · ${STATUSES[skill.status.key].label}` : ''}</small>}

      {node.requires.length > 0 && (
        <ul className="st-reqs" aria-label="Pré-requisitos">
          {node.requires.map((r) => {
            const rn = tree.nodes.find((x) => x.id === r)!, need = needOf(node, r), have = alloc[r] ?? 0;
            return <li key={r} className={have >= need ? 'ok' : ''}><i style={{ background: BRANCH_COLOR[rn.branch] }} />{rn.name}<b>{Math.min(have, need)}/{need}</b></li>;
          })}
        </ul>
      )}

      {plan && (
        <button type="button" className={'st-btn-conquer' + (plan.blocked || short > 0 ? ' short' : '')} disabled={saving || !!plan.blocked || short > 0} onClick={() => conquer(node)}>
          <span aria-hidden>⚜</span>
          {plan.blocked ? plan.blocked : short > 0 ? `Faltam ${short} ponto${short > 1 ? 's' : ''} para conquistar` : rank ? `Evoluir · ${plan.cost} ponto${plan.cost > 1 ? 's' : ''}` : `Conquistar · ${plan.cost} ponto${plan.cost > 1 ? 's' : ''}`}
        </button>
      )}
      <div className="st-detail-actions">
        <button type="button" className="st-btn-remove" disabled={saving || !(rank > 0)} onClick={() => remove(node)}>
          <span aria-hidden>−</span> Retirar ponto
        </button>
        <button type="button" className="st-btn-learn" disabled={saving || !!blocked} onClick={() => add(node)}>
          <span aria-hidden>✦</span> +1 ponto
        </button>
      </div>
      {blocked && !full && <small className="why">{blocked}</small>}
      {notice && <p className={'st-notice ' + notice.tone} role="status">{notice.text}</p>}
    </div>
  );
}

function SkillTreeContent({ large = false }: { large?: boolean }) {
  const { companion: c, species, essence, bond, points, secrets, tree, catalog, alloc, testing } = useSkillData();
  const saving = useSkills((s) => s.saving);
  const toast = useGame((s) => s.toast);
  const [sel, setSel] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ branch: TreeBranch; at: number } | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  useEffect(() => setNotice(null), [sel]);
  const persist = (next: Allocation) => (c ? persistAlloc(c.id, next) : Promise.resolve());

  if (!tree || !species) return null;
  const free = points - spent(alloc);
  const fx = treeEffects(tree, alloc);
  const sp = SPECIES[species];
  const node = sel ? tree.nodes.find((n) => n.id === sel) ?? null : null;

  const add = (n: TreeNode) => { if (!canSpend(tree, alloc, n.id, bond, points)) void persist({ ...alloc, [n.id]: (alloc[n.id] ?? 0) + 1 }); };
  const remove = (n: TreeNode) => {
    if (!(alloc[n.id] > 0)) return;
    // tirar um ponto pode soltar os nós que dependem dele: confere a árvore inteira de novo
    const next = { ...alloc, [n.id]: alloc[n.id] - 1 };
    if (!next[n.id]) delete next[n.id];
    void persist(validateAllocation(tree, next, bond, points));
  };
  const conquer = (n: TreeNode) => {
    setSel(n.id);
    const plan = planTo(tree, alloc, n.id, bond);
    const say = (text: string, tone: 'ok' | 'warn') => { setNotice({ text, tone }); toast(text, tone === 'ok' ? 'gold' : 'warn'); };
    if (plan.blocked) return say(`${n.name}: ${plan.blocked}`, 'warn');
    if (plan.cost > free) return say(`Faltam ${plan.cost - free} ponto${plan.cost - free > 1 ? 's' : ''} para conquistar ${n.name} (o caminho custa ${plan.cost}, você tem ${free}).`, 'warn');
    void persist(applyPlan(tree, alloc, plan.add, bond, points));
    say(`${n.name} conquistada! ${plan.cost} ponto${plan.cost > 1 ? 's' : ''} distribuído${plan.cost > 1 ? 's' : ''} no caminho.`, 'ok');
  };

  const head = (
    <div className="st-head">
      <div>
        {testing && <small role="status">Teste GOD · pontos temporários · restaure em GOD → Classe e essência</small>}
        <strong>{sp.label}</strong>{essence && <> · {ELEMENTS[essence].label}</>}
        <small>{sp.lineage} · afinidade com {sp.affinities.map((e) => ELEMENTS[e].label).join(' e ')} (−{Math.round(fx.classAffinity * 100)}% de SP) · velocidade {sp.speed.toLocaleString('pt-BR')}×</small>
      </div>
      <div className={'st-points' + (free > 0 ? ' has' : '')} aria-live="polite">
        <b>{free}</b>
        <small>ponto{free === 1 ? '' : 's'} livre{free === 1 ? '' : 's'}{secrets ? ` · ${points} no total (+${secrets} de quests secretas)` : ''}{saving ? ' · salvando…' : ''}</small>
      </div>
    </div>
  );

  const tabs = (
    <nav className="st-tabs" aria-label="Ir para o galho">
      {BRANCHES.map((b) => {
        const used = tree.nodes.filter((n) => n.branch === b).reduce((t, n) => t + (alloc[n.id] ?? 0), 0);
        return <button key={b} style={{ ['--branch' as string]: BRANCH_COLOR[b] }} onClick={() => setFocus({ branch: b, at: Date.now() })}>{tree.branches[b].label}{used > 0 && <em>{used}</em>}</button>;
      })}
    </nav>
  );

  const pct = Object.entries(fx.skillPct).filter(([, v]) => v);
  const ePct = Object.entries(fx.elementPct).filter(([, v]) => v);
  const summary = (
    <div className="st-summary">
      <div><span>Habilidades</span>{[...fx.skills.entries()].map(([slug, lv]) => { const s = catalog.find((x) => x.slug === slug); return s ? <b key={slug}>{s.name}{lv > 1 ? ` +${lv - 1}` : ''}</b> : null; })}{!fx.skills.size && <i>nenhuma ainda</i>}</div>
      <div><span>Bônus</span>{Object.entries(fx.bonus).filter(([, v]) => v).map(([k, v]) => <b key={k}>{ATTR_LABEL[k]} +{v}%</b>)}{!Object.values(fx.bonus).some(Boolean) && <i>nenhum ainda</i>}</div>
      {(pct.length > 0 || ePct.length > 0) && <div><span>Buffs</span>{ePct.map(([k, v]) => <b key={k}>{ELEMENTS[k as keyof typeof ELEMENTS].label} +{v}%</b>)}{pct.map(([slug, v]) => <b key={slug}>{catalog.find((s) => s.slug === slug)?.name ?? slug} +{v}%</b>)}</div>}
      <small className="hint">1 ponto por nível de vínculo (+1 por quest secreta). Tirar pontos é de graça. As habilidades abertas entram na barra de atalhos (teclas 1–9).</small>
    </div>
  );

  const graph = <SkillTreeGraph tree={tree} alloc={alloc} catalog={catalog} bond={bond} points={points} selected={sel} focus={focus} large={large} onSelect={(id) => setSel(id === sel ? null : id)} onConquer={(id) => { const n = tree.nodes.find((x) => x.id === id); if (n) conquer(n); }} />;
  const detail = node ? <NodeDetail node={node} tree={tree} alloc={alloc} bond={bond} points={points} catalog={catalog} saving={saving} notice={notice} add={add} remove={remove} conquer={conquer} /> : null;

  if (large) {
    return (
      <div className="st-screen-body">
        <div className="st-screen-left">
          {head}
          {tabs}
          {graph}
        </div>
        <div className="st-screen-right">
          {detail ?? <p className="hint st-no-sel">Clique num nó para ver o caminho até ele. Duplo clique conquista o caminho inteiro.</p>}
          {summary}
        </div>
      </div>
    );
  }

  return (
    <>
      {head}
      {tabs}
      {graph}
      {detail}
      {summary}
    </>
  );
}

export function SkillTreePanel() {
  const { companion: c, species, tree, points, testKey } = useSkillData();
  const d = c?.discoveries;
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [fullscreen]);

  if (!c) return null;
  if (!tree || !species) {
    return (
      <div className="skill-tree">
        <p className="empty">A árvore de habilidades abre quando {d?.name ?? 'o Companion'} descobrir a forma (a classe) na conversa. Pontos guardados: <b>{points}</b>.</p>
      </div>
    );
  }

  return (
    <div className="skill-tree">
      <button type="button" className="st-btn-expand" onClick={() => setFullscreen(true)} title="Abrir em tela cheia">
        ⛶ Tela cheia
      </button>
      <SkillTreeContent key={testKey ?? "original"} />
      {fullscreen && createPortal(
        <div className="st-screen game-ui" role="dialog" aria-modal="true" aria-label="Árvore de habilidades" tabIndex={-1}>
          <header className="st-screen-head deco">
            <div>
              <h2>Habilidades</h2>
              <small>{d?.name ?? 'Companion'} · Essência, classe, vínculo e fusão · Esc para fechar</small>
            </div>
            <button type="button" className="st-screen-close" onClick={() => setFullscreen(false)} aria-label="Fechar tela cheia">×</button>
          </header>
          <SkillTreeContent key={testKey ?? "original"} large />
        </div>,
        document.body
      )}
    </div>
  );
}
