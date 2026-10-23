/**
 * Estado das habilidades compartilhado entre a árvore (painel Habilidades) e a barra de atalhos (1–9):
 * catálogo publicado na Forja, distribuição de pontos e o que está em cada espaço da barra.
 * - Distribuição: online na tabela companion_skill_alloc; offline neste navegador.
 * - Barra: neste navegador, por Companion. Habilidade nova entra sozinha no primeiro espaço livre; tirar da barra
 *   é respeitado (não volta sozinha).
 */
import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import {
  DEFAULT_SKILLS, ELEMENTS, RANK_COOLDOWN, RANK_POWER, buildSkillTree, validateAllocation, treeEffects, skillPoints, sanitizeSkill,
  type Allocation, type SkillDef, type SkillTree,
} from '@rules';
import { useGame } from '../store';
import { castSkill } from '../build/combatStats';
import { supabase } from '../backend/online';

export const BAR_SIZE = 9;
const allocKey = (id: string) => 'companion-core:skill-alloc:' + id;
const barKey = (id: string) => 'companion-core:skill-bar:' + id;

interface BarSave { slots: (string | null)[]; removed: string[] }

interface SkillState {
  catalog: SkillDef[];
  alloc: Allocation;
  bar: (string | null)[];
  removed: string[];
  /** quando cada habilidade volta (ms, performance.now) */
  ready: Record<string, number>;
  saving: boolean;
  /** animação escolhida pelo ADM por habilidade ("__basic" = ataque básico): "clip:<nome>" | "kind:<tipo>" */
  animMap: Record<string, string>;
  /** habilidades abertas (com nível) — para a Companion usar sozinha */
  unlocked: { skill: SkillDef; level: number }[];
  setCatalog: (c: SkillDef[]) => void;
  setAlloc: (a: Allocation) => void;
  setBar: (slots: (string | null)[], removed?: string[]) => void;
  setReady: (slug: string, at: number) => void;
  setSaving: (v: boolean) => void;
}

const empty = () => Array.from({ length: BAR_SIZE }, () => null as string | null);

export const useSkills = create<SkillState>((set) => ({
  catalog: DEFAULT_SKILLS,
  alloc: {},
  bar: empty(),
  removed: [],
  ready: {},
  saving: false,
  animMap: {},
  unlocked: [],
  setCatalog: (catalog) => set({ catalog }),
  setAlloc: (alloc) => set({ alloc }),
  setBar: (bar, removed) => set((s) => ({ bar, removed: removed ?? s.removed })),
  setReady: (slug, at) => set((s) => ({ ready: { ...s.ready, [slug]: at } })),
  setSaving: (saving) => set({ saving }),
}));

/** Árvore, pontos e habilidades abertas do Companion atual. */
export function useSkillData() {
  const snap = useGame((s) => s.snap);
  const c = snap?.companion;
  const species = c?.discoveries.form ?? null, essence = c?.discoveries.element ?? null;
  const secrets = snap?.secrets?.length ?? 0;
  const bond = c?.bond.level ?? 1, points = skillPoints(bond, 0, secrets);
  const catalog = useSkills((s) => s.catalog), alloc = useSkills((s) => s.alloc);
  const tree: SkillTree | null = useMemo(() => (species ? buildSkillTree(catalog, { essence, species }) : null), [catalog, essence, species]);
  const fx = useMemo(() => (tree ? treeEffects(tree, alloc) : null), [tree, alloc]);
  /** habilidades abertas, na ordem da árvore, com o nível */
  const unlocked = useMemo(() => {
    if (!fx) return [] as { skill: SkillDef; level: number }[];
    return [...fx.skills.entries()].map(([slug, level]) => ({ skill: catalog.find((s) => s.slug === slug)!, level })).filter((x) => !!x.skill);
  }, [fx, catalog]);
  return { companion: c ?? null, species, essence, bond, points, secrets, tree, fx, unlocked, catalog, alloc };
}

/** Grava a distribuição (online ou neste navegador). */
export async function persistAlloc(companionId: string, next: Allocation) {
  const st = useSkills.getState();
  st.setAlloc(next);
  st.setSaving(true);
  try {
    if (useGame.getState().backend?.kind === 'online') await supabase().from('companion_skill_alloc').upsert({ companion_id: companionId, alloc: next, updated_at: new Date().toISOString() });
    else localStorage.setItem(allocKey(companionId), JSON.stringify(next));
  } catch { /* fica só nesta sessão */ } finally { useSkills.getState().setSaving(false); }
}

export function saveBar(companionId: string, slots: (string | null)[], removed: string[]) {
  useSkills.getState().setBar(slots, removed);
  try { localStorage.setItem(barKey(companionId), JSON.stringify({ slots, removed } satisfies BarSave)); } catch { /* só nesta sessão */ }
}

/** Carrega catálogo, distribuição e barra; mantém a barra em dia com as habilidades abertas. Usar uma vez (App). */
export function useSkillSync() {
  const backend = useGame((s) => s.backend);
  const { companion: c, tree, bond, points, unlocked } = useSkillData();

  useEffect(() => {
    let alive = true;
    supabase().from('skills').select('slug,name,data').eq('status', 'published').then(({ data }) => {
      const list = (data ?? []).map((r) => sanitizeSkill({ ...(r.data as object), slug: r.slug, name: r.name })).filter((x): x is SkillDef => !!x);
      if (alive && list.length) useSkills.getState().setCatalog(list);
    }, () => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!c || !tree) return;
    let alive = true;
    (async () => {
      let raw: Allocation = {};
      try {
        if (backend?.kind === 'online') raw = ((await supabase().from('companion_skill_alloc').select('alloc').eq('companion_id', c.id).maybeSingle()).data?.alloc ?? {}) as Allocation;
        else raw = JSON.parse(localStorage.getItem(allocKey(c.id)) ?? '{}');
      } catch { /* começa vazio */ }
      if (alive) useSkills.getState().setAlloc(validateAllocation(tree, raw, bond, points));
    })();
    return () => { alive = false; };
  }, [c?.id, tree, backend?.kind, bond, points]); // eslint-disable-line react-hooks/exhaustive-deps

  // animações escolhidas no Administrador para este Companion
  useEffect(() => {
    if (!c || backend?.kind !== 'online') { useSkills.setState({ animMap: {} }); return; }
    let alive = true;
    supabase().from('companion_skill_anims').select('anims').eq('companion_id', c.id).maybeSingle().then(({ data }) => {
      if (alive) useSkills.setState({ animMap: (data?.anims ?? {}) as Record<string, string> });
    }, () => {});
    return () => { alive = false; };
  }, [c?.id, backend?.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  // barra salva deste Companion
  useEffect(() => {
    if (!c) return;
    let save: BarSave = { slots: empty(), removed: [] };
    try { const v = JSON.parse(localStorage.getItem(barKey(c.id)) ?? 'null'); if (v && Array.isArray(v.slots)) save = { slots: empty().map((_, i) => (typeof v.slots[i] === 'string' ? v.slots[i] : null)), removed: Array.isArray(v.removed) ? v.removed : [] }; } catch { /* vazia */ }
    useSkills.getState().setBar(save.slots, save.removed);
  }, [c?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // habilidade nova → primeiro espaço livre; habilidade que saiu da árvore → some da barra
  const open = unlocked.map((u) => u.skill.slug).join(',');
  useEffect(() => { useSkills.setState({ unlocked }); }, [open, unlocked]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!c) return;
    const { bar, removed } = useSkills.getState();
    const has = new Set(unlocked.map((u) => u.skill.slug));
    const slots = bar.map((s) => (s && has.has(s) ? s : null));
    for (const u of unlocked) {
      if (slots.includes(u.skill.slug) || removed.includes(u.skill.slug)) continue;
      const i = slots.indexOf(null); if (i < 0) break;
      slots[i] = u.skill.slug;
    }
    if (slots.join() !== bar.join()) saveBar(c.id, slots, removed);
  }, [open, c?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}

// testes no navegador (só no dev)
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __skills: unknown }).__skills = { useSkills, DEFAULT_SKILLS, useGame, buildSkillTree, persistAlloc };

/** Cor do efeito de uma habilidade (do Companion, da essência ou fixa). */
export function skillColor(s: SkillDef, companion: string): string {
  if (s.vfx.color === 'companion') return companion;
  if (s.vfx.color === 'essence') return s.essence ? ELEMENTS[s.essence].glow : companion;
  return s.vfx.color;
}
export const skillCooldown = (s: SkillDef, level: number) => Math.max(0.3, s.cooldown * (1 - RANK_COOLDOWN * (level - 1)));

/**
 * A Companion lutando sozinha: usa uma habilidade da barra que esteja pronta, caiba no SP e alcance o alvo
 * (as de cura só com a vida abaixo de 60%). Mesmas regras de SP e recarga do jogador.
 */
export function aiCast(dist: number, aimAt: { x: number; z: number }, companionColor: string, hpRatio: number, sp: number, spend: (n: number) => boolean, request: (c: { skill: SkillDef; level: number; color: string; aimAt: { x: number; z: number }; frozen: ReturnType<typeof castSkill> }) => void): SkillDef | null {
  const st = useSkills.getState(), now = performance.now();
  const options = st.bar.map((slug) => st.unlocked.find((u) => u.skill.slug === slug)).filter((u): u is { skill: SkillDef; level: number } => !!u)
    .filter(({ skill: s }) => (st.ready[s.slug] ?? 0) <= now && castSkill(s, 1).cost <= sp)
    .filter(({ skill: s }) => (s.heal > 0 && s.power <= 0 ? hpRatio < 0.6 : s.shape === 'aura' ? dist <= s.radius + 0.6 : dist <= Math.max(s.range, 1.2) + 0.6))
    .sort((a, b) => (b.skill.heal > 0 && hpRatio < 0.4 ? 1 : 0) - (a.skill.heal > 0 && hpRatio < 0.4 ? 1 : 0) || b.skill.power - a.skill.power);
  const pick = options[0];
  if (!pick) return null;
  const frozen = castSkill(pick.skill, 1 + RANK_POWER * (pick.level - 1));
  if (!spend(frozen.cost)) return null;
  st.setReady(pick.skill.slug, now + (skillCooldown(pick.skill, pick.level) + frozen.windup) * 1000);
  request({ skill: pick.skill, level: pick.level, color: skillColor(pick.skill, companionColor), aimAt, frozen });
  return pick.skill;
}
