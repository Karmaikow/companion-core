/**
 * Árvore de habilidades do Companion: pontos (1 por nível de vínculo) para distribuir em três galhos — Essência,
 * Classe e Vínculo. Montada a partir do catálogo publicado na Forja (sem ele, o catálogo inicial).
 * Online, a distribuição fica na tabela companion_skill_alloc; offline, neste navegador. Redistribuir é de graça.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_SKILLS, ELEMENTS, SPECIES, STATUSES, SHAPES, TIER_BOND, buildSkillTree, canSpend, validateAllocation, treeEffects, skillPoints, spent, sanitizeSkill,
  type Allocation, type SkillDef, type TreeBranch, type TreeNode,
} from '@rules';
import { useGame } from '../store';
import { supabase } from '../backend/online';

const ATTR_LABEL: Record<string, string> = { vida: 'Vida', energia: 'Energia', poder: 'Poder', defesa: 'Defesa', agilidade: 'Agilidade', sintonia: 'Sintonia' };
const localKey = (id: string) => 'companion-core:skill-alloc:' + id;

export function SkillTreePanel() {
  const snap = useGame((s) => s.snap);
  const backend = useGame((s) => s.backend);
  const c = snap?.companion;
  const d = c?.discoveries;
  const species = d?.form ?? null;
  const essence = d?.element ?? null;
  const bond = c?.bond.level ?? 1;
  const points = skillPoints(bond);

  const [catalog, setCatalog] = useState<SkillDef[]>(DEFAULT_SKILLS);
  useEffect(() => {
    let alive = true;
    supabase().from('skills').select('slug,name,data').eq('status', 'published').then(({ data }) => {
      const list = (data ?? []).map((r) => sanitizeSkill({ ...(r.data as object), slug: r.slug, name: r.name })).filter((x): x is SkillDef => !!x);
      if (alive && list.length) setCatalog(list);
    }, () => {});
    return () => { alive = false; };
  }, []);

  const tree = useMemo(() => (species ? buildSkillTree(catalog, { essence, species }) : null), [catalog, essence, species]);
  const [alloc, setAlloc] = useState<Allocation>({});
  const [branch, setBranch] = useState<TreeBranch>('essencia');
  const [sel, setSel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // carregar (e conferir pelas regras)
  useEffect(() => {
    if (!c || !tree) return;
    let alive = true;
    (async () => {
      let raw: Allocation = {};
      try {
        if (backend?.kind === 'online') raw = ((await supabase().from('companion_skill_alloc').select('alloc').eq('companion_id', c.id).maybeSingle()).data?.alloc ?? {}) as Allocation;
        else raw = JSON.parse(localStorage.getItem(localKey(c.id)) ?? '{}');
      } catch { /* começa vazio */ }
      if (alive) setAlloc(validateAllocation(tree, raw, bond, points));
    })();
    return () => { alive = false; };
  }, [c?.id, tree, backend?.kind, bond, points]); // eslint-disable-line react-hooks/exhaustive-deps

  async function persist(next: Allocation) {
    setAlloc(next);
    if (!c) return;
    setSaving(true);
    try {
      if (backend?.kind === 'online') await supabase().from('companion_skill_alloc').upsert({ companion_id: c.id, alloc: next, updated_at: new Date().toISOString() });
      else localStorage.setItem(localKey(c.id), JSON.stringify(next));
    } catch { /* fica só nesta sessão */ } finally { setSaving(false); }
  }

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
          <small>{sp.lineage} · afinidade com {sp.affinities.map((e) => ELEMENTS[e].label).join(' e ')} ({Math.round((fx.classAffinity - 1) * 100)}%)</small>
        </div>
        <div className={'st-points' + (free > 0 ? ' has' : '')} aria-live="polite"><b>{free}</b><small>ponto{free === 1 ? '' : 's'} livre{free === 1 ? '' : 's'}{saving ? ' · salvando…' : ''}</small></div>
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
        <small className="hint">1 ponto por nível de vínculo (a batalha vai somar mais). Tirar pontos é de graça.</small>
      </div>
    </div>
  );
}
