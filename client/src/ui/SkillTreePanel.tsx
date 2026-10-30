/**
 * Árvore de habilidades do Companion: pontos (1 por nível de vínculo) para distribuir em três galhos — Essência,
 * Classe e Vínculo. Montada a partir do catálogo publicado na Forja (sem ele, o catálogo inicial).
 * Online, a distribuição fica na tabela companion_skill_alloc; offline, neste navegador. Redistribuir é de graça.
 */
import { SkillTreeGraph } from './SkillTreeGraph';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ELEMENTS, SPECIES, STATUSES, SHAPES, TIER_BOND, canSpend, validateAllocation, treeEffects, spent,
  type Allocation, type TreeBranch, type TreeNode, type SkillTree, type SkillDef,
} from '@rules';
import { useSkillData, useSkills, persistAlloc } from './skillState';

const ATTR_LABEL: Record<string, string> = { vida: 'Vida', energia: 'Energia', poder: 'Poder', defesa: 'Defesa', agilidade: 'Agilidade', sintonia: 'Sintonia' };

function NodeDetail({ node, tree, alloc, bond, points, catalog, saving, add, remove }: {
  node: TreeNode; tree: SkillTree; alloc: Allocation; bond: number; points: number;
  catalog: SkillDef[]; saving: boolean; add: (n: TreeNode) => void; remove: (n: TreeNode) => void;
}) {
  const skill = node.skill ? catalog.find((s) => s.slug === node.skill) : undefined;
  const blocked = canSpend(tree, alloc, node.id, bond, points);
  return (
    <div className="st-detail">
      <strong className="st-detail-name">{node.name}</strong>
      <p className="st-detail-meta">Vínculo mínimo: {TIER_BOND[node.tier]} · Pontos: {alloc[node.id] ?? 0}/{node.maxRank}</p>
      <div className="st-detail-actions">
        <button type="button" className="st-btn-remove" disabled={saving || !(alloc[node.id] > 0)} onClick={() => remove(node)}>
          <span aria-hidden>−</span> Retirar ponto
        </button>
        <button type="button" className="st-btn-learn" disabled={saving || !!blocked} onClick={() => add(node)}>
          <span aria-hidden>✦</span> Aprender / evoluir
        </button>
      </div>
      <p className="st-detail-desc">{node.description}</p>
      {skill && <small className="st-detail-skill">{SHAPES[skill.shape]}{skill.power ? ` · dano ${skill.power}` : ''}{skill.heal ? ` · cura ${skill.heal}` : ''}{skill.energy ? ` · energia ${skill.energy}` : ''} · recarga {skill.cooldown}s{skill.status ? ` · ${STATUSES[skill.status.key].label}` : ''}</small>}
      {blocked && <small className="why">{blocked}</small>}
    </div>
  );
}

function SkillTreeContent({ large = false }: { large?: boolean }) {
  const { companion: c, species, essence, bond, points, secrets, tree, catalog, alloc } = useSkillData();
  const saving = useSkills((s) => s.saving);
  const [branch, setBranch] = useState<TreeBranch>('essencia');
  const [sel, setSel] = useState<string | null>(null);
  const persist = (next: Allocation) => (c ? persistAlloc(c.id, next) : Promise.resolve());

  if (!tree || !species) return null;
  const free = points - spent(alloc);
  const fx = treeEffects(tree, alloc);
  const sp = SPECIES[species];
  const node = sel ? tree.nodes.find((n) => n.id === sel) ?? null : null;

  const add = (n: TreeNode) => { if (!canSpend(tree, alloc, n.id, bond, points)) void persist({ ...alloc, [n.id]: (alloc[n.id] ?? 0) + 1 }); };
  const remove = (n: TreeNode) => {
    if (!(alloc[n.id] > 0)) return;
    const next = { ...alloc, [n.id]: alloc[n.id] - 1 };
    if (!next[n.id]) delete next[n.id];
    void persist(validateAllocation(tree, next, bond, points));
  };

  const head = (
    <div className="st-head">
      <div>
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
    <nav className="st-tabs" aria-label="Galhos">
      {(Object.keys(tree.branches) as TreeBranch[]).map((b) => {
        const used = tree.nodes.filter((n) => n.branch === b).reduce((t, n) => t + (alloc[n.id] ?? 0), 0);
        return <button key={b} className={branch === b ? 'on' : ''} onClick={() => { setBranch(b); setSel(null); }}>{tree.branches[b].label}{used > 0 && <em>{used}</em>}</button>;
      })}
    </nav>
  );

  const summary = (
    <div className="st-summary">
      <div><span>Habilidades</span>{[...fx.skills.entries()].map(([slug, lv]) => { const s = catalog.find((x) => x.slug === slug); return s ? <b key={slug}>{s.name}{lv > 1 ? ` +${lv - 1}` : ''}</b> : null; })}{!fx.skills.size && <i>nenhuma ainda</i>}</div>
      <div><span>Bônus</span>{Object.entries(fx.bonus).filter(([, v]) => v).map(([k, v]) => <b key={k}>{ATTR_LABEL[k]} +{v}%</b>)}{!Object.values(fx.bonus).some(Boolean) && <i>nenhum ainda</i>}</div>
      <small className="hint">1 ponto por nível de vínculo (a batalha vai somar mais). Tirar pontos é de graça. As habilidades abertas entram na barra de atalhos (teclas 1–9).</small>
    </div>
  );

  const graph = <SkillTreeGraph tree={tree} alloc={alloc} catalog={catalog} selected={sel} large={large} onSelect={id => { setSel(id === sel ? null : id); const next = tree.nodes.find(n => n.id === id); if (next) setBranch(next.branch); }} />;

  if (large) {
    return (
      <div className="st-screen-body">
        <div className="st-screen-left">
          {head}
          {tabs}
          <small className="hint">{tree.branches[branch].hint}</small>
          {graph}
          {summary}
        </div>
        <div className="st-screen-right">
          {node
            ? <NodeDetail node={node} tree={tree} alloc={alloc} bond={bond} points={points} catalog={catalog} saving={saving} add={add} remove={remove} />
            : <p className="hint st-no-sel">Clique em um nó do grafo para ver os detalhes e distribuir pontos.</p>
          }
        </div>
      </div>
    );
  }

  return (
    <>
      {head}
      {tabs}
      <small className="hint">{tree.branches[branch].hint}</small>
      {graph}
      {node && <NodeDetail node={node} tree={tree} alloc={alloc} bond={bond} points={points} catalog={catalog} saving={saving} add={add} remove={remove} />}
      {summary}
    </>
  );
}

export function SkillTreePanel() {
  const { companion: c, species, tree, points } = useSkillData();
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
      <SkillTreeContent />
      {fullscreen && createPortal(
        <div className="st-screen game-ui" role="dialog" aria-modal="true" aria-label="Árvore de habilidades" tabIndex={-1}>
          <header className="st-screen-head deco">
            <div>
              <h2>Habilidades</h2>
              <small>{d?.name ?? 'Companion'} · Essência e evolução · Esc para fechar</small>
            </div>
            <button type="button" className="st-screen-close" onClick={() => setFullscreen(false)} aria-label="Fechar tela cheia">×</button>
          </header>
          <SkillTreeContent large />
        </div>,
        document.body
      )}
    </div>
  );
}
