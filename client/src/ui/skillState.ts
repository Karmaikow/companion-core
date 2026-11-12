/**
 * Estado das habilidades compartilhado entre a árvore (painel Habilidades) e a barra de atalhos (1–9):
 * catálogo publicado na Forja, distribuição de pontos e o que está em cada espaço da barra.
 * - Distribuição: online na tabela companion_skill_alloc; offline neste navegador.
 * - Barra: neste navegador, por Companion. Habilidade nova entra sozinha no primeiro espaço livre; tirar da barra
 *   é respeitado (não volta sozinha).
 */
import { useEffect, useMemo, useRef } from 'react';
import { fetchCatalog } from '../backend/catalog';
import { create } from 'zustand';
import {
  DEFAULT_SKILLS, ELEMENTS, RANK_COOLDOWN, buildSkillTree, validateAllocation, treeEffects, skillPoints, sanitizeSkill, skillPowerMult,
  companionElement, studiesAt, schoolSkills, techniquesFor, equippedItems, ITEM_TYPES, WEAPON_KINDS, TIERS, tierOf, type Tier, type WeaponKind, type Allocation, type SkillDef, type SkillTree, type CitySchool,
} from '@rules';
import { usePacto } from '../pacto/pactoStore';
import { useGame } from '../store';
import { castSkill } from '../build/combatStats';
import { supabase } from '../backend/online';
import { useGod } from './godMode';

export const BAR_SIZE = 9;
const allocKey = (id: string) => 'companion-core:skill-alloc:' + id;
const barKey = (id: string) => 'companion-core:skill-bar:' + id;
const pathKey = (id: string) => 'companion-core:tech-path:' + id;

interface BarSave { slots: (string | null)[]; removed: string[] }
/** `mult`: efeito final (níveis + focos + corrente da essência) */
export interface Unlocked { skill: SkillDef; level: number; mult: number }

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
  unlocked: Unlocked[];
  /** caminho escolhido na evolução de cada técnica de arma (T3+) */
  paths: Record<string, 'a' | 'b'>;
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
  paths: {},
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
  const admin = useGod((g) => g.admin), profile = useGod((g) => g.treeProfile);
  const testing = admin && !!c && profile?.companionId === c.id;
  const species = testing ? profile.species : c?.discoveries.form ?? null;
  const essence = companionElement(testing ? profile.essence : c?.discoveries.element);
  // técnicas das escolas de Áster (ex.: Escola do Veneno) — valem enquanto a matrícula valer
  const pacto = usePacto((s) => s.view);
  const schoolKey = pacto ? (pacto.schools ?? []).filter((k) => studiesAt(k, pacto.schools ?? [], pacto.cls.forms?.length ? pacto.cls.forms : species ? [species] : [], pacto.cls.essences?.length ? pacto.cls.essences : [essence])).join(',') : '';
  const testKey = testing ? `${c.id}:${profile.testId}` : null;
  const secrets = snap?.secrets?.length ?? 0;
  const bond = c?.bond.level ?? 1, points = skillPoints(bond, 0, secrets);
  const catalog = useSkills((s) => s.catalog), savedAlloc = useSkills((s) => s.alloc);
  const alloc = testing ? profile.alloc : savedAlloc;
  const granted = useGod((g) => g.skills);
  // técnicas de arma: as do tipo da arma na mão direita, com o elemento do Companion
  const equipped = useGame((s) => s.equipped), items = useGame((s) => s.items);
  const { weapon, weaponTier } = useMemo<{ weapon: WeaponKind | null; weaponTier: Tier }>(() => {
    const w = equippedItems(equipped, items).find((x) => x.slot === 'mainhand' && ITEM_TYPES[x.item.type].weapon)?.item;
    return w && (WEAPON_KINDS as readonly string[]).includes(w.type) ? { weapon: w.type as WeaponKind, weaponTier: tierOf(w) } : { weapon: null, weaponTier: 1 };
  }, [equipped, items]);
  // evoluídas pelo tier da arma (T3: caminho escolhido; T5: forma final)
  const paths = useSkills((s) => s.paths);
  const techniques = useMemo(() => techniquesFor(catalog, weapon, essence, bond, { tier: weaponTier, paths, schools: schoolKey ? schoolKey.split(',') : [] }), [catalog, weapon, essence, bond, weaponTier, paths, schoolKey]);
  const tree: SkillTree | null = useMemo(() => (species ? buildSkillTree(catalog, { essence, species }) : null), [catalog, essence, species]);
  const fx = useMemo(() => (tree ? treeEffects(tree, alloc) : null), [tree, alloc]);
  /** habilidades abertas, na ordem da árvore, com o nível */
  // catálogo da Forja + as fusões que só existem na árvore
  const known = useMemo(() => (tree?.extra.length ? [...catalog, ...tree.extra] : catalog), [catalog, tree]);
  const unlocked = useMemo(() => {
    const base: Unlocked[] = [];
    for (const [slug, level] of fx?.skills ?? []) { const sk = known.find((s) => s.slug === slug); if (sk) base.push({ skill: sk, level, mult: skillPowerMult(fx, sk, level) }); }
    for (const sk of schoolSkills(catalog, schoolKey ? (schoolKey.split(',') as CitySchool[]) : [])) {
      if (sk.unlockBond <= bond && !base.some((b) => b.skill.slug === sk.slug)) base.push({ skill: sk, level: 1, mult: skillPowerMult(fx, sk, 1) });
    }
    for (const sk of techniques) if (!base.some((b) => b.skill.slug === sk.slug)) base.push({ skill: sk, level: 1, mult: skillPowerMult(fx, sk, 1) * TIERS[weaponTier].power });
    // Modo GOD: habilidades dadas pelo painel do Administrador (valem mesmo fora da árvore)
    for (const [slug, level] of Object.entries(granted)) {
      const sk = known.find((x) => x.slug === slug), at = base.findIndex((b) => b.skill.slug === slug);
      if (!sk) continue;
      const lv = at >= 0 ? Math.max(level, base[at].level) : level, u = { skill: sk, level: lv, mult: skillPowerMult(fx, sk, lv) };
      if (at >= 0) base[at] = u; else base.push(u);
    }
    return base;
  }, [fx, known, granted, catalog, schoolKey, bond, techniques, weaponTier]);
  return { companion: c ?? null, species, essence, bond, points, secrets, tree, fx, unlocked, catalog: known, alloc, testing, testKey, weapon, weaponTier, schools: schoolKey ? schoolKey.split(',') : [] };
}

/** Grava a distribuição (online ou neste navegador). */
export async function persistAlloc(companionId: string, next: Allocation) {
  const god = useGod.getState();
  if (god.admin && god.treeProfile?.companionId === companionId) { god.setTestAlloc(next); return; }
  const st = useSkills.getState();
  st.setAlloc(next);
  st.setSaving(true);
  try {
    if (useGame.getState().backend?.kind === 'online') await supabase().from('companion_skill_alloc').upsert({ companion_id: companionId, alloc: next, updated_at: new Date().toISOString() });
    else localStorage.setItem(allocKey(companionId), JSON.stringify(next));
  } catch { /* fica só nesta sessão */ } finally { useSkills.getState().setSaving(false); }
}

/** Escolhe o caminho da evolução de uma técnica de arma (fica salvo neste navegador, por Companion). */
export function setTechPath(companionId: string, slug: string, path: 'a' | 'b') {
  const paths = { ...useSkills.getState().paths, [slug]: path };
  useSkills.setState({ paths });
  try { localStorage.setItem(pathKey(companionId), JSON.stringify(paths)); } catch { /* só nesta sessão */ }
}

export function saveBar(companionId: string, slots: (string | null)[], removed: string[]) {
  useSkills.getState().setBar(slots, removed);
  const god = useGod.getState();
  if (god.admin && god.treeProfile?.companionId === companionId) return;
  try { localStorage.setItem(barKey(companionId), JSON.stringify({ slots, removed } satisfies BarSave)); } catch { /* só nesta sessão */ }
}

/** Carrega catálogo, distribuição e barra; mantém a barra em dia com as habilidades abertas. Usar uma vez (App). */
export function useSkillSync() {
  const backend = useGame((s) => s.backend);
  const visualModel = useGame(s => s.snap?.visualJob?.model);
  // Signed URL refreshes do not change the model; a new model/package does.
  const visualKey = [visualModel?.url.split('?')[0] ?? '', ...(visualModel?.anims ?? []).map(a => a.url.split('?')[0])].join('|');
  const { companion: c, tree, bond, points, unlocked, testing, testKey } = useSkillData();
  // matrículas das escolas (técnicas de escola) chegam com o estado do Pacto
  useEffect(() => { if (c?.stage === 'awakened' && !usePacto.getState().view) void usePacto.getState().refresh(); }, [c?.id, c?.stage]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    fetchCatalog<{ slug: string; name: string; data: unknown }>('skills').then((data) => {
      const list = (data ?? []).map((r) => sanitizeSkill({ ...(r.data as object), slug: r.slug, name: r.name })).filter((x): x is SkillDef => !!x);
      if (alive && list.length) useSkills.getState().setCatalog(list);
    }, () => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!c || !tree || testing) return;
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
  }, [c?.id, tree, backend?.kind, bond, points, testing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh mappings for the current model and when returning from the Admin tab.
  useEffect(() => {
    if (!c || backend?.kind !== 'online') { useSkills.setState({ animMap: {} }); return; }
    let alive = true, version = 0;
    useSkills.setState({ animMap: {} });
    const refresh = () => {
      const request = ++version;
      supabase().from('companion_skill_anims').select('anims').eq('companion_id', c.id).maybeSingle().then(({ data, error }) => {
        if (alive && request === version && !error) useSkills.setState({ animMap: (data?.anims ?? {}) as Record<string, string> });
      }, () => {});
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => { alive = false; window.removeEventListener('focus', refresh); };
  }, [c?.id, backend?.kind, visualKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // caminhos de evolução das técnicas deste Companion
  useEffect(() => {
    if (!c) return;
    let p: Record<string, 'a' | 'b'> = {};
    try { const v = JSON.parse(localStorage.getItem(pathKey(c.id)) ?? '{}'); for (const [k, x] of Object.entries(v ?? {})) if (x === 'a' || x === 'b') p[k] = x; } catch { p = {}; }
    useSkills.setState({ paths: p });
  }, [c?.id]);

  // barra salva deste Companion
  useEffect(() => {
    if (!c) return;
    if (testing) { useSkills.getState().setBar(empty(), []); return; }
    let save: BarSave = { slots: empty(), removed: [] };
    try { const v = JSON.parse(localStorage.getItem(barKey(c.id)) ?? 'null'); if (v && Array.isArray(v.slots)) save = { slots: empty().map((_, i) => (typeof v.slots[i] === 'string' ? v.slots[i] : null)), removed: Array.isArray(v.removed) ? v.removed : [] }; } catch { /* vazia */ }
    useSkills.getState().setBar(save.slots, save.removed);
  }, [c?.id, testKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // habilidade nova → primeiro espaço livre; habilidade que saiu da árvore → some da barra
  const open = unlocked.map((u) => u.skill.slug).join(',');
  const prevTech = useRef(new Set<string>());
  useEffect(() => { useSkills.setState({ unlocked }); }, [open, unlocked]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!c) return;
    const { bar, removed } = useSkills.getState();
    const has = new Set(unlocked.map((u) => u.skill.slug));
    // trocou de arma: as técnicas novas entram nos espaços onde estavam as da arma anterior
    const freed = bar.map((s, i) => (s && !has.has(s) && prevTech.current.has(s) ? i : -1)).filter((i) => i >= 0);
    prevTech.current = new Set(unlocked.filter((u) => u.skill.slot === 'technique').map((u) => u.skill.slug));
    const slots = bar.map((s) => (s && has.has(s) ? s : null));
    for (const u of unlocked) {
      if (slots.includes(u.skill.slug) || removed.includes(u.skill.slug)) continue;
      const i = u.skill.slot === 'technique' && freed.length ? freed.shift()! : slots.indexOf(null); if (i < 0) break;
      slots[i] = u.skill.slug;
    }
    if (slots.join() !== bar.join()) saveBar(c.id, slots, removed);
  }, [open, c?.id, testKey]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const options = st.bar.map((slug) => st.unlocked.find((u) => u.skill.slug === slug)).filter((u): u is Unlocked => !!u)
    .filter(({ skill: s }) => (st.ready[s.slug] ?? 0) <= now && castSkill(s, 1).cost <= sp)
    .filter(({ skill: s }) => (s.heal > 0 && s.power <= 0 ? hpRatio < 0.6 : s.shape === 'aura' ? dist <= s.radius + 0.6 : dist <= Math.max(s.range, 1.2) + 0.6))
    .sort((a, b) => (b.skill.heal > 0 && hpRatio < 0.4 ? 1 : 0) - (a.skill.heal > 0 && hpRatio < 0.4 ? 1 : 0) || b.skill.power - a.skill.power);
  const pick = options[0];
  if (!pick) return null;
  const frozen = castSkill(pick.skill, pick.mult);
  if (!spend(frozen.cost)) return null;
  st.setReady(pick.skill.slug, now + (skillCooldown(pick.skill, pick.level) + frozen.windup) * 1000);
  request({ skill: pick.skill, level: pick.level, color: skillColor(pick.skill, companionColor), aimAt, frozen });
  return pick.skill;
}
