/**
 * Árvore de habilidades do Companion: pontos (1 por nível de vínculo) para distribuir em três galhos — Essência,
 * Classe e Vínculo. Montada a partir do catálogo publicado na Forja (sem ele, o catálogo inicial).
 * Online, a distribuição fica na tabela companion_skill_alloc; offline, neste navegador. Redistribuir é de graça.
 */
import { useState } from 'react';
import {
  ELEMENTS, SPECIES, STATUSES, SHAPES, TIER_BOND, canSpend, validateAllocation, treeEffects, spent,
  type Allocation, type TreeBranch, type TreeNode,
} from '@rules';
import { useSkillData, useSkills, persistAlloc } from './skillState';

const ATTR_LABEL: Record<string, string> = { vida: 'Vida', energia: 'Energia', poder: 'Poder', defesa: 'Defesa', agilidade: 'Agilidade', sintonia: 'Sintonia' };

export function SkillTreePanel() {
  const { companion: c, species, essence, bond, points, secrets, tree, catalog, alloc } = useSkillData();
  const d = c?.discoveries;
  const saving = useSkills((s) => s.saving);
  const [branch, setBranch] = useState<TreeBranch>('essencia');
  const [sel, setSel] = useState<string | null>(null);
  const persist = (next: Allocation) => (c ? persistAlloc(c.id, next) : Promise.resolve());

  if (!c) return null;
  if (!tree || !species) {
    return (
      <div className="skill-tree">
        <p className="empty">A árvore de habilidades abre quando {d?.name ?? 'o Companion'} descobrir a forma (a classe) na conversa. Pontos guardados: <b>{points}</b>.</p>
      </div>
    );
  }
  const free = points - spent(alloc);
  const fx = treeEffects(tree, alloc);
  const sp = SPECIES[species];
  const nodes = tree.nodes.filter((n) => n.branch === branch);
  const node = sel ? tree.nodes.find((n) => n.id === sel) ?? null : null;
  const skillOf = (n: TreeNode) => (n.skill ? catalog.find((s) => s.slug === n.skill) : undefined);

  const add = (n: TreeNode) => { if (!canSpend(tree, alloc, n.id, bond, points)) void persist({ ...alloc, [n.id]: (alloc[n.id] ?? 0) + 1 }); };
  const remove = (n: TreeNode) => {
    if (!(alloc[n.id] > 0)) return;
    // tirar um ponto pode soltar os nós de baixo: confere a árvore inteira de novo
    const next = { ...alloc, [n.id]: alloc[n.id] - 1 };
    if (!next[n.id]) delete next[n.id];
    void persist(validateAllocation(tree, next, bond, points));
  };

  return (
    <div className="skill-tree">
      <div className="st-head">
        <div>
          <strong>{sp.label}</strong>{essence && <> · {ELEMENTS[essence].label}</>}
          <small>{sp.lineage} · afinidade com {sp.affinities.map((e) => ELEMENTS[e].label).join(' e ')} (−{Math.round(fx.classAffinity * 100)}% de SP) · velocidade {sp.speed.toLocaleString('pt-BR')}×</small>
        </div>
        <div className={'st-points' + (free > 0 ? ' has' : '')} aria-live="polite"><b>{free}</b><small>ponto{free === 1 ? '' : 's'} livre{free === 1 ? '' : 's'}{secrets ? ` · ${points} no total (+${secrets} de quests secretas)` : ''}{saving ? ' · salvando…' : ''}</small></div>
      </div>
      <nav className="st-tabs" aria-label="Galhos">
        {(Object.keys(tree.branches) as TreeBranch[]).map((b) => {
          const used = tree.nodes.filter((n) => n.branch === b).reduce((t, n) => t + (alloc[n.id] ?? 0), 0);
          return <button key={b} className={branch === b ? 'on' : ''} onClick={() => { setBranch(b); setSel(null); }}>{tree.branches[b].label}{used > 0 && <em>{used}</em>}</button>;
        })}
      </nav>
      <small className="hint">{tree.branches[branch].hint}</small>

      <ol className="st-branch">
        {nodes.map((n) => {
          const r = alloc[n.id] ?? 0, why = canSpend(tree, alloc, n.id, bond, points);
          const locked = bond < TIER_BOND[n.tier] || n.requires.some((q) => !(alloc[q] > 0));
          return (
            <li key={n.id} className={'st-node ' + n.kind + (r ? ' on' : '') + (locked ? ' locked' : '') + (sel === n.id ? ' sel' : '')}>
              <button className="st-main" onClick={() => setSel(sel === n.id ? null : n.id)} aria-expanded={sel === n.id}>
                <span className="st-icon" aria-hidden>{n.kind === 'skill' ? '✦' : n.kind === 'rank' ? '▲' : '◆'}</span>
                <span className="st-name">{n.name}<small>{n.kind === 'skill' ? 'habilidade' : n.kind === 'rank' ? 'melhoria' : 'passiva'} · vínculo {TIER_BOND[n.tier]}</small></span>
                <span className="st-pips" aria-label={`${r} de ${n.maxRank}`}>{Array.from({ length: n.maxRank }, (_, i) => <i key={i} className={i < r ? 'f' : ''} />)}</span>
              </button>
              <div className="st-act">
                <button className="st-minus" disabled={!r} onClick={() => remove(n)} aria-label={`Tirar ponto de ${n.name}`}>−</button>
                <button className="st-plus" disabled={!!why} title={why ?? 'Pôr um ponto'} onClick={() => add(n)} aria-label={`Pôr ponto em ${n.name}`}>+</button>
              </div>
            </li>
          );
        })}
      </ol>

      {node && (
        <div className="st-detail">
          <strong>{node.name}</strong>
          <p>{node.description}</p>
          {(() => {
            const s = skillOf(node);
            if (!s) return null;
            return <small>{SHAPES[s.shape]}{s.power ? ` · dano ${s.power}` : ''}{s.heal ? ` · cura ${s.heal}` : ''}{s.energy ? ` · energia ${s.energy}` : ''} · recarga {s.cooldown}s{s.status ? ` · ${STATUSES[s.status.key].label}` : ''}</small>;
          })()}
          {canSpend(tree, alloc, node.id, bond, points) && <small className="why">{canSpend(tree, alloc, node.id, bond, points)}</small>}
        </div>
      )}

      <div className="st-summary">
        <div><span>Habilidades</span>{[...fx.skills.entries()].map(([slug, lv]) => { const s = catalog.find((x) => x.slug === slug); return s ? <b key={slug}>{s.name}{lv > 1 ? ` +${lv - 1}` : ''}</b> : null; })}{!fx.skills.size && <i>nenhuma ainda</i>}</div>
        <div><span>Bônus</span>{Object.entries(fx.bonus).filter(([, v]) => v).map(([k, v]) => <b key={k}>{ATTR_LABEL[k]} +{v}%</b>)}{!Object.values(fx.bonus).some(Boolean) && <i>nenhum ainda</i>}</div>
        <small className="hint">1 ponto por nível de vínculo (a batalha vai somar mais). Tirar pontos é de graça. As habilidades abertas entram na barra de atalhos (teclas 1–9).</small>
      </div>
    </div>
  );
}
