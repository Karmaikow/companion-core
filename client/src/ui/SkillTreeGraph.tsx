/**
 * Árvore de habilidades desenhada como uma constelação radial: a raiz no centro, um setor por galho
 * (Vínculo em cima, Classe à direita, Fusão embaixo, Essência à esquerda) e um anel por profundidade. As fusões
 * ficam no vão entre os braços que unem; as linhas contornam o centro e as que cruzam galhos são pontilhadas.
 * Navegação: arrastar move, roda do mouse/pinça aproxima, botões +/−/enquadrar. Clique seleciona e destaca
 * o caminho até o nó; duplo clique conquista o caminho inteiro (onConquer).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { canSpend, needOf, nodeDepths, planTo, spent, tierBond, type Allocation, type SkillDef, type SkillTree, type TreeBranch, type TreeNode } from '@rules';
import './skill-tree-graph.css';

const BRANCH_ANGLE: Record<TreeBranch, number> = { vinculo: 0, classe: 90, fusao: 180, essencia: 270 };
export const BRANCH_COLOR: Record<TreeBranch, string> = { essencia: '#6debb9', classe: '#ffda79', vinculo: '#cf9dff', fusao: '#ff8fb1' };
const RING0 = 110, RING = 96, SPREAD = 40, MIN_GAP = 68, SWIRL = 7, MAX_SWIRL = 50;
/** braços em espiral: cada anel gira um pouco o galho, como uma galáxia (no total, no máximo MAX_SWIRL graus) */
const swirlFor = (maxD: number) => Math.min(SWIRL, MAX_SWIRL / Math.max(1, maxD - 1));
const armAngle = (b: TreeBranch, d: number, sw: number) => BRANCH_ANGLE[b] + (d - 1) * sw;
const ringR = (d: number) => RING0 + (d - 1) * RING;
const LOD_K = 0.62;
const NODE_R: Record<TreeNode['kind'], number> = { skill: 27, rank: 21, passive: 20, boost: 15 };
const GLYPH: Record<TreeNode['kind'], string> = { skill: '✦', rank: '▲', passive: '◆', boost: '+' };
const MIN_K = 0.22, MAX_K = 2.8;

/** `dev`: quanto o nó saiu do eixo do próprio braço (graus) */
interface P { x: number; y: number; a: number; r: number; b: TreeBranch; dev: number }
const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
const polar = (deg: number, r: number) => ({ x: Math.cos(rad(deg)) * r, y: Math.sin(rad(deg)) * r });
const offset = (deg: number, base: number) => ((deg - base + 540) % 360) - 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const centerOut = (n: number) => Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.abs(a - (n - 1) / 2) - Math.abs(b - (n - 1) / 2) || a - b);

function layout(tree: SkillTree): Map<string, P> {
  const depth = nodeDepths(tree);
  const kids = new Map<string, number>();
  for (const n of tree.nodes) for (const r of n.requires) kids.set(r, (kids.get(r) ?? 0) + 1);
  const groups = new Map<string, TreeNode[]>();
  for (const n of tree.nodes) { const k = `${n.branch}|${depth.get(n.id)}`; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(n); }
  const pos = new Map<string, P>();
  const maxD = Math.max(1, ...depth.values());
  const sw = swirlFor(maxD);
  for (let d = 1; d <= maxD; d++) for (const b of Object.keys(BRANCH_ANGLE) as TreeBranch[]) {
    const g = groups.get(`${b}|${d}`); if (!g) continue;
    if (b === 'fusao') { for (const n of g) placeFusion(n, d, pos, sw); continue; }
    const base = armAngle(b, d, sw), r = ringR(d);
    const items = g.map((n) => {
      const ps = n.requires.map((id) => pos.get(id)).filter((p): p is P => !!p);
      // pai do mesmo galho: segue o desvio dele (a espiral continua); de outro galho: puxa para o lado dele,
      // e o do lado oposto (±180°) não puxa
      const offs = ps.map((p) => (p.b === b ? p.dev : offset(p.a, base))).map((o) => (Math.abs(o) > 150 ? 0 : clamp(o, -SPREAD, SPREAD)));
      const off = offs.length ? offs.reduce((t, o) => t + o, 0) / offs.length : 0;
      return { n, off, kids: kids.get(n.id) ?? 0 };
    }).sort((a, b) => a.off - b.off);
    // mesmos pais: o nó que continua o galho fica no meio, os ramos dos lados
    if (items.every((i) => Math.abs(i.off - items[0].off) < 1)) {
      const byKids = [...items].sort((a, b) => b.kids - a.kids), slots = centerOut(items.length);
      byKids.forEach((it, i) => { items[slots[i]] = it; });
    }
    const minStep = (MIN_GAP / r) * (180 / Math.PI);
    const step = items.length > 1 ? Math.min(minStep * 1.15, (2 * SPREAD) / (items.length - 1)) : 0;
    const half = (step * (items.length - 1)) / 2;
    const mean = items.reduce((t, i) => t + i.off, 0) / items.length;
    const center = half >= SPREAD ? 0 : clamp(mean, -SPREAD + half, SPREAD - half);
    items.forEach((it, i) => { const dev = center - half + i * step, a = base + dev; pos.set(it.n.id, { ...polar(a, r), a, r, b, dev }); });
  }
  return pos;
}

/**
 * Fusões ficam no vão entre os braços que elas unem (as pontas da shuriken). Quem une os três braços, ou pede outra
 * fusão junto, vai para o braço de baixo; um foco de fusão segue a fusão dele, um anel para fora.
 */
function placeFusion(n: TreeNode, d: number, pos: Map<string, P>, sw: number) {
  const ps = n.requires.map((id) => pos.get(id)).filter((p): p is P => !!p);
  const fused = ps.filter((p) => p.b === 'fusao');
  let a: number, r: number;
  if (ps.length === 1 && fused.length === 1) { a = fused[0].a; r = fused[0].r + RING * 0.8; }
  else {
    const sx = ps.reduce((t, p) => t + Math.sin((p.a * Math.PI) / 180), 0), sy = ps.reduce((t, p) => t + Math.cos((p.a * Math.PI) / 180), 0);
    const together = ps.length ? Math.hypot(sx, sy) / ps.length : 0;
    const gap = !fused.length && together >= 0.5;
    a = gap ? (Math.atan2(sx, sy) * 180) / Math.PI : armAngle('fusao', d, sw);
    r = gap ? Math.max(ringR(d), ...ps.map((p) => p.r + RING * 0.7)) : ringR(d);
  }
  // não encosta em ninguém: empurra para fora até ter espaço
  for (let tries = 0; tries < 12; tries++) {
    const at = polar(a, r);
    if (![...pos.values()].some((p) => Math.hypot(p.x - at.x, p.y - at.y) < MIN_GAP)) break;
    r += RING * 0.55;
  }
  pos.set(n.id, { ...polar(a, r), a, r, b: 'fusao', dev: 0 });
}

/** Linha entre dois nós contornando o centro (ângulo e raio andam juntos), nunca atravessando o meio da árvore. */
function arc(from: P | null, to: P) {
  if (!from) {
    const at = (t: number) => ({ x: to.x * t, y: to.y * t });
    return { d: `M 0 0 L ${to.x} ${to.y}`, at };
  }
  const da = offset(to.a, from.a);
  const at = (t: number) => polar(from.a + da * t, from.r + (to.r - from.r) * t);
  const steps = Math.max(2, Math.ceil(Math.abs(da) / 6));
  const pts = Array.from({ length: steps + 1 }, (_, i) => at(i / steps));
  return { d: 'M ' + pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L '), at };
}

function stars(seed: number, count: number, radius: number) {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  return Array.from({ length: count }, () => { const a = rnd() * 360, r = Math.sqrt(rnd()) * radius; return { ...polar(a, r), s: 0.4 + rnd() * 1.4, o: 0.15 + rnd() * 0.55 }; });
}

/** quebra nomes longos em duas linhas, no espaço mais perto do meio */
function twoLines(name: string): [string, string?] {
  if (name.length <= 13) return [name];
  const spaces = [...name.matchAll(/ /g)].map((m) => m.index!);
  if (!spaces.length) return [name.length > 18 ? name.slice(0, 17) + '…' : name];
  const cut = spaces.reduce((a, b) => (Math.abs(b - name.length / 2) < Math.abs(a - name.length / 2) ? b : a));
  const tail = name.slice(cut + 1);
  return [name.slice(0, cut), tail.length > 16 ? tail.slice(0, 15) + '…' : tail];
}

export interface GraphProps {
  tree: SkillTree; alloc: Allocation; catalog: SkillDef[]; bond: number; points: number;
  selected: string | null; onSelect: (id: string) => void; onConquer?: (id: string) => void;
  /** muda para centralizar um galho */
  focus?: { branch: TreeBranch; at: number } | null;
  large?: boolean;
}

export function SkillTreeGraph({ tree, alloc, catalog, bond, points, selected, onSelect, onConquer, focus, large }: GraphProps) {
  const pos = useMemo(() => layout(tree), [tree]);
  const depths = useMemo(() => nodeDepths(tree), [tree]);
  const maxD = Math.max(1, ...depths.values()), sw = swirlFor(maxD);
  const outer = Math.max(ringR(maxD), ...[...pos.values()].map((p) => p.r)) + 120;
  const sky = useMemo(() => stars(7, large ? 260 : 160, outer), [outer, large]);
  const box = useMemo(() => {
    const xs = [0, ...[...pos.values()].map((p) => p.x)], ys = [0, ...[...pos.values()].map((p) => p.y)];
    return { x0: Math.min(...xs) - 90, x1: Math.max(...xs) + 90, y0: Math.min(...ys) - 70, y1: Math.max(...ys) + 80 };
  }, [pos]);
  // nebulosa de cada braço vai só até o último nó dele
  const arms = useMemo(() => (Object.keys(BRANCH_ANGLE) as TreeBranch[]).map((b) => {
    const own = tree.nodes.filter((n) => n.branch === b);
    const end = Math.max(2, ...own.map((n) => depths.get(n.id) ?? 1));
    const pts = Array.from({ length: end + 1 }, (_, i) => polar(armAngle(b, i, sw), i === 0 ? 40 : ringR(i)));
    return { b, d: 'M ' + pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L '), label: polar(armAngle(b, end + 0.7, sw), ringR(end) + 70) };
  }), [tree, depths, sw]);
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ x: 0, y: 0, k: 0.5 });
  const [hover, setHover] = useState<string | null>(null);
  const touched = useRef(false), moved = useRef(false);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; mx: number; my: number } | null>(null);

  const fit = useCallback(() => {
    if (!size.w || !size.h) return;
    const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
    const k = clamp(Math.min(size.w / bw, size.h / bh), MIN_K, MAX_K);
    setView({ k, x: size.w / 2 - ((box.x0 + box.x1) / 2) * k, y: size.h / 2 - ((box.y0 + box.y1) / 2) * k });
  }, [size.w, size.h, box]);

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { if (!touched.current) fit(); }, [fit]);

  const zoomAt = useCallback((px: number, py: number, factor: number) => {
    touched.current = true;
    setView((v) => { const k = clamp(v.k * factor, MIN_K, MAX_K), f = k / v.k; return { k, x: px - (px - v.x) * f, y: py - (py - v.y) * f }; });
  }, []);

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); const r = el.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-clamp(e.deltaY, -120, 120) * 0.0012)); };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [zoomAt]);

  useEffect(() => {
    if (!focus || !size.w) return;
    touched.current = true;
    const p = polar(armAngle(focus.branch, 3, sw), ringR(3)), k = Math.max(view.k, 0.8);
    setView({ k, x: size.w / 2 - p.x * k, y: size.h / 2 - p.y * k });
  }, [focus?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  const local = (e: { clientX: number; clientY: number }) => { const r = wrap.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.stg-controls')) return;
    if (!ptrs.current.size) moved.current = false;
    ptrs.current.set(e.pointerId, local(e));
    pinch.current = null;
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = ptrs.current.get(e.pointerId); if (!prev) return;
    const p = local(e);
    ptrs.current.set(e.pointerId, p);
    if (ptrs.current.size === 1) {
      const dx = p.x - prev.x, dy = p.y - prev.y;
      if (!moved.current && Math.hypot(dx, dy) < 3) { ptrs.current.set(e.pointerId, prev); return; }
      if (!moved.current) { moved.current = true; wrap.current?.setPointerCapture(e.pointerId); }
      touched.current = true;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    } else if (ptrs.current.size === 2) {
      moved.current = true;
      const [a, b] = [...ptrs.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (pinch.current) {
        const last = pinch.current;
        setView((v) => ({ ...v, x: v.x + mx - last.mx, y: v.y + my - last.my }));
        zoomAt(mx, my, dist / Math.max(1, last.dist));
      }
      pinch.current = { dist, mx, my };
    }
  };
  const onUp = (e: React.PointerEvent) => { ptrs.current.delete(e.pointerId); pinch.current = null; };

  const target = hover ?? selected;
  const plan = useMemo(() => (target ? planTo(tree, alloc, target, bond) : null), [tree, alloc, target, bond]);
  const onPath = (id: string) => !!plan && id in plan.add;
  const free = Math.max(0, points - spent(alloc));

  const zoomBtn = (f: number) => zoomAt(size.w / 2, size.h / 2, f);

  return (
    <div className={'skill-constellation' + (large ? ' large' : '')}>
      <div ref={wrap} className="stg-stage" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={(e) => { if (!moved.current) onUp(e); }}>
        <svg role="group" aria-label="Árvore de habilidades: essência, classe, vínculo e fusão" width="100%" height="100%">
          <defs>
            <radialGradient id="stg-sky" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#24406a" stopOpacity="0.55" />
              <stop offset="55%" stopColor="#101a36" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#070c1c" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="stg-root" cx="50%" cy="45%" r="60%">
              <stop offset="0%" stopColor="#fff6d8" />
              <stop offset="45%" stopColor="#f0c96a" />
              <stop offset="100%" stopColor="#7a5a24" />
            </radialGradient>
            <filter id="stg-glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            <filter id="stg-nebula" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="38" /></filter>
          </defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            <circle r={outer} fill="url(#stg-sky)" />
            {sky.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.s} fill="#dfe9ff" opacity={s.o} />)}
            {Array.from(new Set([...pos.values()].map((p) => p.r))).map((r) => <circle key={r} r={r} className="stg-ring" />)}
            {arms.map(({ b, d, label }) => (
              <g key={b}>
                <path d={d} fill="none" stroke={BRANCH_COLOR[b]} strokeOpacity=".2" strokeWidth="130" strokeLinecap="round" strokeLinejoin="round" filter="url(#stg-nebula)" />
                <path d={d} fill="none" stroke={BRANCH_COLOR[b]} strokeOpacity=".12" strokeWidth="1.2" strokeDasharray="1 9" />
                <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle" className="stg-sector" fill={BRANCH_COLOR[b]}>{tree.branches[b].label.toUpperCase()}</text>
              </g>
            ))}
            {tree.nodes.filter((n) => n.branch === 'fusao' && n.kind === 'skill').map((n) => {
              const p = pos.get(n.id)!;
              return <circle key={'neb-' + n.id} cx={p.x} cy={p.y} r="62" fill={BRANCH_COLOR.fusao} opacity=".16" filter="url(#stg-nebula)" />;
            })}

            {tree.nodes.map((n) => {
              const to = pos.get(n.id)!;
              return (n.requires.length ? n.requires : ['__root']).map((rid) => {
                const parent = pos.get(rid) ?? null;
                const { d, at } = arc(parent, to);
                const need = rid === '__root' ? 1 : needOf(n, rid), have = rid === '__root' ? 1 : alloc[rid] ?? 0;
                const lit = (alloc[n.id] ?? 0) > 0, ready = have >= need, path = onPath(n.id) && (rid === '__root' || onPath(rid) || ready);
                // ligação entre galhos diferentes: pontilhada e discreta até entrar no caminho ou ser comprada
                const cross = !!parent && parent.b !== n.branch;
                const badge = need > 1 ? at(0.8) : null;
                const color = path ? '#ffd98a' : cross ? BRANCH_COLOR[parent!.b] : BRANCH_COLOR[n.branch];
                const opacity = lit ? 0.95 : path ? 0.9 : cross ? (ready ? 0.42 : 0.22) : ready ? 0.45 : 0.16;
                const dash = path && !lit ? '6 5' : cross && !lit ? '1.5 6' : undefined;
                // ligação que daria meia volta na galáxia: só aparece no caminho ou comprada (o selo x/3 fica)
                const far = cross && Math.abs(offset(to.a, parent!.a)) > 100 && !lit && !path;
                return (
                  <g key={`${rid}-${n.id}`}>
                    {!far && <path d={d} fill="none" stroke={color} strokeOpacity={opacity} strokeWidth={lit ? 3 : path ? 2.4 : cross ? 1.8 : 1.4} strokeLinecap="round" strokeDasharray={dash} className={path && !lit ? 'stg-flow' : undefined} />}
                    {badge && (
                      <g className="stg-need">
                        <circle cx={badge.x} cy={badge.y} r="11" fill="#0b1330" stroke={ready ? '#7be36b' : '#ffd98a'} />
                        <text x={badge.x} y={badge.y + 3.5} textAnchor="middle" fill={ready ? '#b9f5a8' : '#ffe7b0'}>{Math.min(have, need)}/{need}</text>
                      </g>
                    )}
                  </g>
                );
              });
            })}

            <g className="stg-root">
              <circle r="46" fill="none" stroke="#f0c96a" strokeOpacity=".35" strokeDasharray="2 6" className="stg-spin" />
              <circle r="34" fill="url(#stg-root)" filter="url(#stg-glow)" />
              <text y="9" textAnchor="middle" fontSize="26" fill="#3a2608">✦</text>
            </g>

            {tree.nodes.map((n) => {
              const p = pos.get(n.id)!, color = BRANCH_COLOR[n.branch];
              const rank = alloc[n.id] ?? 0, full = rank >= n.maxRank, sel = selected === n.id;
              const avail = !full && !canSpend(tree, alloc, n.id, bond, points);
              const bondLock = bond < tierBond(n.tier);
              const r = NODE_R[n.kind] * (sel ? 1.15 : 1);
              const icon = n.kind === 'skill' ? catalog.find((s) => s.slug === n.skill)?.iconUrl : undefined;
              const cls = 'skill-graph-node' + (rank ? ' owned' : '') + (full ? ' full' : '') + (avail ? ' avail' : '') + (bondLock ? ' bond-lock' : '') + (onPath(n.id) ? ' on-path' : '') + (sel ? ' sel' : '');
              const shape = n.kind === 'passive'
                ? <rect x={p.x - r * 0.82} y={p.y - r * 0.82} width={r * 1.64} height={r * 1.64} rx="4" transform={`rotate(45 ${p.x} ${p.y})`} fill={rank ? '#1e3d4a' : '#0f1c30'} stroke={color} strokeWidth={sel ? 3.5 : 1.8} className="stg-body" />
                : <circle cx={p.x} cy={p.y} r={r} fill={rank ? '#1e3d4a' : '#0f1c30'} stroke={color} strokeWidth={sel ? 3.5 : 1.8} className="stg-body" />;
              // longe: só o nome das habilidades, em letra maior; perto: todos os nomes e os pontos
              const near = view.k >= LOD_K, showName = near || n.kind === 'skill' || sel;
              const fs = near ? 11 : 11 * Math.min(2.3, LOD_K / view.k);
              const [l1, l2] = twoLines(n.name);
              return (
                <g key={n.id} role="button" tabIndex={0} aria-label={`${n.name}, ${rank} de ${n.maxRank} pontos`} aria-pressed={sel} className={cls}
                  onClick={() => { if (!moved.current) onSelect(n.id); }}
                  onDoubleClick={() => { if (!moved.current) onConquer?.(n.id); }}
                  onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHover(n.id); }} onPointerLeave={() => setHover((h) => (h === n.id ? null : h))}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(n.id); } }}>
                  <title>{`${n.name} · ${rank}/${n.maxRank}${bondLock ? ` · abre no vínculo ${tierBond(n.tier)}` : ''}`}</title>
                  {(rank > 0 || sel) && <circle cx={p.x} cy={p.y} r={r + 7} fill={color} opacity={rank ? 0.16 : 0.08} filter="url(#stg-glow)" />}
                  {n.kind === 'skill' && <circle cx={p.x} cy={p.y} r={r + 5} fill="none" stroke={color} strokeOpacity=".35" strokeWidth="1" />}
                  {shape}
                  {icon
                    ? <image href={icon} x={p.x - r * 0.62} y={p.y - r * 0.62} width={r * 1.24} height={r * 1.24} preserveAspectRatio="xMidYMid meet" />
                    : <text x={p.x} y={p.y + r * 0.3} fill={rank ? '#fff6e0' : color} textAnchor="middle" fontSize={r * 0.85}>{GLYPH[n.kind]}</text>}
                  {bondLock && <text x={p.x + r * 0.75} y={p.y - r * 0.6} fontSize="11" textAnchor="middle" className="stg-lock">🔒</text>}
                  {showName && (
                    <text x={p.x} y={p.y + r + 4 + fs} textAnchor="middle" className="stg-name" fontSize={fs} strokeWidth={fs / 3.5}>
                      {l1}{l2 && <tspan x={p.x} dy={fs * 1.1}>{l2}</tspan>}
                    </text>
                  )}
                  {near && <text x={p.x} y={p.y + r + 4 + fs * (l2 ? 3.3 : 2.2)} textAnchor="middle" className="stg-rank">{rank}/{n.maxRank}</text>}
                </g>
              );
            })}
          </g>
        </svg>
        <div className="stg-controls">
          <button type="button" onClick={() => zoomBtn(1.25)} aria-label="Aproximar">+</button>
          <button type="button" onClick={() => zoomBtn(0.8)} aria-label="Afastar">−</button>
          <button type="button" onClick={() => { touched.current = false; fit(); }} aria-label="Enquadrar a árvore inteira" title="Ver a árvore inteira">⤢</button>
        </div>
        {plan && target && plan.cost > 0 && (
          <div className={'stg-plan' + (plan.blocked || plan.cost > free ? ' short' : '')} aria-live="polite">
            Caminho até <b>{tree.nodes.find((n) => n.id === target)?.name}</b>: {plan.cost} ponto{plan.cost > 1 ? 's' : ''}
            {plan.blocked ? <em> · {plan.blocked}</em> : plan.cost > free && <em> · faltam {plan.cost - free}</em>}
          </div>
        )}
      </div>
      <p className="stg-hint">Arraste para navegar · roda ou pinça para zoom · clique seleciona e mostra o caminho · <b>duplo clique conquista</b></p>
    </div>
  );
}
