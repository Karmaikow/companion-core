// Constelação Viva no servidor: o cliente mostra prévias; aqui se validam orçamento, valores, Ressonância e
// elegibilidade (fora de combate, sem coleta ou trabalho na oficina) antes de gravar por build_write (atômica,
// com versão e request_id). Redistribuir é de graça e não toca classe, essência, ofício, memórias nem Vínculo.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  levelForXp, budget, checkAllocation, parseAllocation, parseResonance, migrateBuild, demoProfiles, applyBlockers, cleanRequestId, clampText,
  progressionStage, secretBonus, MAX_PROFILES, PROFILE_NAME, type BalanceConfig, type BuildProfile, type BuildState, type GameConfig, type SpeciesKey, type Discoveries,
} from './rules/index.ts';

export class BuildError extends Error { constructor(public status: number, msg: string) { super(msg); } }

interface Ctx { db: SupabaseClient; c: Record<string, unknown>; cfg: GameConfig; bcfg: BalanceConfig; event: (kind: string, payload: unknown) => Promise<number> }

async function rpc<T = Record<string, unknown>>(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new BuildError(500, 'Falha no servidor (' + fn + ').');
  return data as T;
}

const speciesOf = (c: Record<string, unknown>) => ((c.discoveries as Discoveries | null)?.form ?? null) as SpeciesKey | null;
const stageOf = (c: Record<string, unknown>, cfg: GameConfig) => progressionStage(levelForXp(Number(c.bond_xp) || 0, cfg));

function toState(row: Record<string, unknown>): BuildState {
  return {
    version: Number(row.version) || 1,
    active: { alloc: parseAllocation(row.alloc) ?? migrateBuild(null, 1).active.alloc, resonance: parseResonance(row.resonance) ?? null },
    profiles: Array.isArray(row.profiles) ? (row.profiles as BuildProfile[]) : [],
    pending: (row.pending as BuildState['pending']) ?? null,
    migrated: row.migrated ?? undefined,
  };
}

/** Lê a build; na primeira vez, cria pela migração (distribuição sugerida da classe). */
export async function loadBuild(db: SupabaseClient, c: Record<string, unknown>, cfg: GameConfig, bcfg: BalanceConfig): Promise<BuildState> {
  const cid = c.id as string;
  const { data } = await db.from('companion_build').select('*').eq('companion_id', cid).maybeSingle();
  if (data) return toState(data);
  const m = migrateBuild(speciesOf(c), stageOf(c, cfg), bcfg);
  return toState(await rpc(db, 'build_init', { p_cid: cid, p_alloc: m.active.alloc, p_migrated: m.migrated }));
}

/** O que impede aplicar agora, segundo o que o servidor sabe. */
async function blockers(db: SupabaseClient, cid: string, bcfg: BalanceConfig, clientSaysCombat: boolean) {
  const since = new Date(Date.now() - bcfg.combatCooldown * 1000).toISOString();
  const recent = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const [kill, gather, craft] = await Promise.all([
    db.from('companion_events').select('id').eq('companion_id', cid).eq('kind', 'combat.kill').gte('created_at', since).limit(1),
    db.from('ecos_actions').select('request_id').eq('companion_id', cid).eq('status', 'running').gte('created_at', recent).limit(1),
    db.from('pacto_jobs').select('request_id').eq('artisan', cid).eq('status', 'running').limit(1),
  ]);
  return applyBlockers({ inCombat: clientSaysCombat || !!kill.data?.length, gathering: !!gather.data?.length, crafting: !!craft.data?.length });
}

/** Pontos extras de Constelação pelas quests secretas (+10 a cada 10). */
export async function secretPoints(db: SupabaseClient, cid: string) {
  const { count } = await db.from('companion_secrets').select('companion_id', { count: 'exact', head: true }).eq('companion_id', cid);
  return { count: count ?? 0, ...secretBonus(count ?? 0) };
}

export async function buildView(ctx: Ctx, clientSaysCombat = false) {
  const { db, c, cfg, bcfg } = ctx;
  const state = await loadBuild(db, c, cfg, bcfg);
  const stage = stageOf(c, cfg);
  const sec = await secretPoints(db, c.id as string);
  return { build: { ...state, stage, budget: budget(stage, bcfg, sec.constellationPoints), bonus: { secrets: sec.count, points: sec.constellationPoints, nextIn: sec.nextIn }, blockers: await blockers(db, c.id as string, bcfg, clientSaysCombat), config: bcfg } };
}

function validProfile(p: unknown, stage: number, bcfg: BalanceConfig, bonus: number, keepId?: string): BuildProfile {
  const o = (p ?? {}) as Record<string, unknown>;
  const name = clampText(o.name, 24).trim();
  if (!PROFILE_NAME.test(name)) throw new BuildError(400, 'Nome do perfil inválido (até 24 letras, números e espaços).');
  const alloc = parseAllocation(o.alloc);
  const chk = checkAllocation(alloc, stage, bcfg, bonus);
  if (!chk.ok) throw new BuildError(400, chk.reason);
  const resonance = parseResonance(o.resonance);
  if (resonance === undefined) throw new BuildError(400, 'Ressonância indisponível.');
  return { id: keepId ?? crypto.randomUUID(), name, alloc: alloc!, resonance };
}

export async function buildAction(action: string, body: Record<string, unknown>, ctx: Ctx) {
  const { db, c, cfg, bcfg } = ctx;
  const cid = c.id as string;
  const request = cleanRequestId(body.request);
  if (action === 'build.state') return buildView(ctx, body.inCombat === true);
  if (!request) throw new BuildError(400, 'Pedido sem identificador.');
  const state = await loadBuild(db, c, cfg, bcfg);
  const version = Number.isInteger(body.version) ? Number(body.version) : state.version;
  const stage = stageOf(c, cfg);
  const bonus = (await secretPoints(db, cid)).constellationPoints;
  const write = async (kind: string, patch: Record<string, unknown>) => {
    const r = await rpc<{ ok: boolean; reason?: string; repeat?: boolean; version?: number }>(db, 'build_write', { p_cid: cid, p_request: request, p_kind: kind, p_version: version, p_patch: patch });
    if (!r.ok && r.reason === 'versao') throw new BuildError(409, 'A build mudou em outro lugar. Recarreguei a versão atual.');
    if (!r.ok) throw new BuildError(400, 'Não deu para salvar.');
    return r;
  };

  if (action === 'build.apply') {
    const alloc = parseAllocation(body.alloc);
    const chk = checkAllocation(alloc, stage, bcfg, bonus);
    if (!chk.ok) throw new BuildError(400, chk.reason);
    const resonance = parseResonance(body.resonance);
    if (resonance === undefined) throw new BuildError(400, 'Ressonância indisponível.');
    const why = await blockers(db, cid, bcfg, body.inCombat === true);
    if (why.length) {
      // guarda como pendente: aplica sozinho quando der (o cliente tenta de novo) e pode ser cancelada
      const r = await write('pending', { pending: { alloc, resonance, at: new Date().toISOString(), reason: why[0] } });
      return { ...(await buildView(ctx, body.inCombat === true)), applied: false, pending: true, reason: why[0], repeat: !!r.repeat };
    }
    const r = await write('apply', { alloc, ...(resonance ? { resonance } : { resonance_clear: true }), pending_clear: true, applied: true });
    if (!r.repeat) await ctx.event('build.applied', { alloc, resonance, stage, budget: budget(stage, bcfg, bonus), version: r.version });
    return { ...(await buildView(ctx)), applied: true, repeat: !!r.repeat };
  }
  if (action === 'build.cancelPending') {
    await write('cancel', { pending_clear: true });
    return { ...(await buildView(ctx)), cancelled: true };
  }
  if (action === 'build.profile.save') {
    const id = typeof (body.profile as Record<string, unknown> | undefined)?.id === 'string' ? String((body.profile as Record<string, unknown>).id) : undefined;
    const exists = id ? state.profiles.find((p) => p.id === id) : undefined;
    const prof = validProfile(body.profile, stage, bcfg, bonus, exists?.id);
    const profiles = exists ? state.profiles.map((p) => (p.id === prof.id ? prof : p)) : [...state.profiles, prof];
    if (profiles.length > MAX_PROFILES) throw new BuildError(400, `No máximo ${MAX_PROFILES} perfis.`);
    await write('profile.save', { profiles });
    return { ...(await buildView(ctx)), saved: prof.id };
  }
  if (action === 'build.profile.duplicate') {
    const src = state.profiles.find((p) => p.id === body.id);
    if (!src) throw new BuildError(404, 'Perfil não encontrado.');
    if (state.profiles.length >= MAX_PROFILES) throw new BuildError(400, `No máximo ${MAX_PROFILES} perfis.`);
    const copy = { ...src, id: crypto.randomUUID(), name: clampText(src.name + ' (cópia)', 24) };
    await write('profile.duplicate', { profiles: [...state.profiles, copy] });
    return { ...(await buildView(ctx)), saved: copy.id };
  }
  if (action === 'build.profile.delete') {
    if (!state.profiles.some((p) => p.id === body.id)) throw new BuildError(404, 'Perfil não encontrado.');
    await write('profile.delete', { profiles: state.profiles.filter((p) => p.id !== body.id) });
    return buildView(ctx);
  }
  if (action === 'build.demo') {
    // três perfis de Dracônico para demonstração (proporções; o orçamento é o do estágio atual)
    const demo = demoProfiles(stage, bcfg).filter((d) => !state.profiles.some((p) => p.name === d.name)).map((d) => ({ ...d, id: crypto.randomUUID() }));
    const profiles = [...state.profiles, ...demo].slice(0, MAX_PROFILES);
    await write('profile.demo', { profiles });
    return buildView(ctx);
  }
  throw new BuildError(404, 'Ação desconhecida.');
}
