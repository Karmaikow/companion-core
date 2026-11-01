// Ecos da Terra no servidor: valida posição, alcance, ferramenta, tempo, disponibilidade, capacidade e elegibilidade,
// e grava tudo por funções SQL atômicas e idempotentes (request_id). A IA não participa: só as regras de shared/rules.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  NODE_KINDS, VALE_NODES, NASCENTE, nodeById, approachOf, rollGather, cleanRequestId, parseBatchKey, resolveEcos, abundanceNow, scoreTune, cleanTune, COMPANION_TUNE,
  SEIVA_AZUL, CHAINS, stepSatisfied, chainReward, JARDIM, siteStoredNow, recipeById, checkCraft, PONTE, needFits, scaledNeed, levelForXp,
  type EcosConfig, type MaterialBatch, type ChainChoice, type GameConfig, type Discoveries, type ToolKey,
  type PactoConfig,
} from './rules/index.ts';
import { ownedTools, wearTool, superiorBlock, classInfo, lumes } from './pacto.ts';

export class EcosError extends Error { constructor(public status: number, msg: string) { super(msg); } }

const REASON: Record<string, string> = {
  'esgotado': 'Esse recurso está esgotado por enquanto — ele volta sozinho.',
  'mochila-cheia': 'A mochila está cheia: nada foi coletado (nem gasto). Libere espaço.',
  'cedo': 'Ainda está coletando…',
  'nao-iniciada': 'Essa coleta não foi começada (ou expirou). Tente de novo.',
  'pedido-invalido': 'Pedido inválido.',
  'faltam-materiais': 'Faltam materiais na mochila.',
  'etapas-pendentes': 'Ainda faltam etapas da descoberta.',
  'ja-concluida': 'Essa descoberta já foi concluída.',
  'sem-jardim': 'Você ainda não tem esse jardim.',
  'nada-pronto': 'Nada pronto para colher ainda.',
  'ja-cuidado': 'O jardim já foi cuidado hoje.',
  'obra-concluida': 'A obra já está pronta!',
  'etapa-mudou': 'A etapa da obra acabou de mudar — veja o que falta agora.',
  'ja-completo': 'Essa parte da obra já está completa.',
  'cota-pessoal': 'Você já entregou sua parte desta etapa; deixe espaço para outras pessoas (a cota abre depois de um tempo).',
};
export const reasonText = (r: string | undefined) => (r && REASON[r]) || 'Não deu certo.';


async function rpc<T = Record<string, unknown>>(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new EcosError(500, 'Falha no servidor (' + fn + ').');
  return data as T;
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

export async function ecosState(db: SupabaseClient, cid: string, ecfg: EcosConfig) {
  const toolsP = ownedTools(db, cid);
  await db.from('ecos_profile').upsert({ companion_id: cid }, { onConflict: 'companion_id', ignoreDuplicates: true });
  const [prof, bag, nodes, sites, proj, mine] = await Promise.all([
    db.from('ecos_profile').select('tools,seen,known_materials,techniques,chain').eq('companion_id', cid).maybeSingle(),
    db.from('ecos_bag').select('batch_key,qty').eq('companion_id', cid),
    db.from('ecos_nodes').select('node_id,amount,at').eq('companion_id', cid),
    db.from('ecos_sites').select('site_id,stored,at,cared_at,created_at').eq('companion_id', cid),
    db.from('ecos_projects').select('project_id,stage,progress,started_at,completed_at').eq('project_id', PONTE.id).maybeSingle(),
    db.from('ecos_contributions').select('stage,need,qty').eq('companion_id', cid).eq('project_id', PONTE.id),
  ]);
  const now = Date.now();
  const tools = await toolsP;
  const p = prof.data ?? { tools: [], seen: [], known_materials: [], techniques: [], chain: {} };
  const pr = proj.data ?? { project_id: PONTE.id, stage: 0, progress: PONTE.stages[0].needs.map(() => 0), started_at: new Date(now).toISOString(), completed_at: null };
  const stage = PONTE.stages[pr.stage as number];
  return {
    serverNow: now,
    profile: { tools: tools as ToolKey[], seen: p.seen as string[], knownMaterials: p.known_materials as string[], techniques: p.techniques as string[], chain: p.chain as Record<string, unknown> },
    bag: (bag.data ?? []).map((b) => ({ key: b.batch_key as string, qty: b.qty as number })).filter((b) => b.qty > 0),
    nodes: Object.fromEntries((nodes.data ?? []).map((n) => [n.node_id as string, { amount: Number(n.amount), at: Date.parse(n.at as string) }])),
    sites: (sites.data ?? []).map((s) => ({ id: s.site_id as string, stored: Number(s.stored), at: Date.parse(s.at as string), caredAt: s.cared_at ? Date.parse(s.cared_at as string) : null, createdAt: s.created_at as string,
      now: siteStoredNow(JARDIM, { stored: Number(s.stored), at: Date.parse(s.at as string), caredAt: s.cared_at ? Date.parse(s.cared_at as string) : null }, now) })),
    project: {
      id: PONTE.id, stage: pr.stage as number, progress: (pr.progress as number[]) ?? [], startedAt: Date.parse(pr.started_at as string), completedAt: pr.completed_at as string | null,
      goals: stage ? stage.needs.map((n) => scaledNeed(n, ecfg.projectScale)) : [],
      mine: (mine.data ?? []).filter((m) => m.stage === pr.stage).reduce((a, m) => a + (m.qty as number), 0),
      mineTotal: (mine.data ?? []).reduce((a, m) => a + (m.qty as number), 0),
      capTotal: stage ? Math.ceil(stage.needs.reduce((a, n) => a + scaledNeed(n, ecfg.projectScale), 0) * ecfg.capShare) : 0,
    },
    config: ecfg,
  };
}
export type EcosState = Awaited<ReturnType<typeof ecosState>>;

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

interface Ctx { db: SupabaseClient; c: Record<string, unknown>; cfg: GameConfig; ecfg: EcosConfig; pcfg: PactoConfig; admin: boolean; event: (kind: string, payload: unknown) => Promise<number> }

const pos = (b: Record<string, unknown>) => {
  const x = Number(b.x), z = Number(b.z);
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 400 || Math.abs(z) > 400) throw new EcosError(400, 'Posição inválida.');
  return { x, z };
};

async function bridgeDone(db: SupabaseClient) {
  const { data } = await db.from('ecos_projects').select('stage').eq('project_id', PONTE.id).maybeSingle();
  return ((data?.stage as number) ?? 0) >= 2; // o tabuado (etapa 2) já permite atravessar
}

async function advanceChain(ctx: Ctx, act: { node?: string; approach?: string; inspect?: boolean; x?: number; z?: number }) {
  const { data } = await ctx.db.from('ecos_profile').select('chain').eq('companion_id', ctx.c.id).maybeSingle();
  const st = ((data?.chain as Record<string, unknown>)?.[SEIVA_AZUL.id] ?? null) as { step: number; completedAt?: string } | null;
  if (!stepSatisfied(SEIVA_AZUL, st, act)) return null;
  const from = st?.step ?? 0;
  const r = await rpc<{ ok: boolean; step: number }>(ctx.db, 'ecos_chain_advance', { p_cid: ctx.c.id, p_chain: SEIVA_AZUL.id, p_from: from });
  if (!r.ok) return null;
  const step = SEIVA_AZUL.steps[from];
  await ctx.event('ecos.clue', { chain: SEIVA_AZUL.id, step: step.id, evidence: step.evidence.text });
  return { chain: SEIVA_AZUL.id, step: r.step, title: step.title, evidence: step.evidence, knowledge: step.knowledge ?? null };
}

async function grantBond(ctx: Ctx, cid: string, xp: number, reason: string) {
  if (xp <= 0) return null;
  const { data } = await ctx.db.from('companions').select('bond_xp').eq('id', cid).maybeSingle();
  if (!data) return null;
  const before = data.bond_xp as number, after = before + Math.round(xp);
  const { error } = await ctx.db.from('companions').update({ bond_xp: after }).eq('id', cid).eq('bond_xp', before);
  if (error) return null;
  await ctx.db.from('companion_events').insert({ companion_id: cid, actor: 'system', kind: 'bond.xp', payload: { total: Math.round(xp), reason, meaningful: false } });
  const lb = levelForXp(before, ctx.cfg), la = levelForXp(after, ctx.cfg);
  return { xp: Math.round(xp), levelUp: la > lb ? la : null };
}

async function memory(ctx: Ctx, cid: string, content: string, importance = 3) {
  await ctx.db.from('companion_memories').insert({ companion_id: cid, subject: 'companion', content, importance, source_event_ids: [], origin: 'ecos' });
}

export async function ecosAction(action: string, body: Record<string, unknown>, ctx: Ctx): Promise<Record<string, unknown>> {
  const { db, c, ecfg } = ctx;
  const cid = c.id as string;
  if (c.stage !== 'awakened') throw new EcosError(409, 'As expedições começam depois do despertar.');
  const name = (c.discoveries as Discoveries).name ?? 'Seu Companion';

  if (action === 'ecos.state') return { ecos: await ecosState(db, cid, ecfg) };

  if (action === 'ecos.start') {
    const request = cleanRequestId(body.request); if (!request) throw new EcosError(400, 'Pedido inválido.');
    const node = nodeById(String(body.node)); if (!node) throw new EcosError(400, 'Recurso inexistente.');
    const ap = approachOf(node, String(body.approach)); if (!ap) throw new EcosError(400, 'Abordagem inexistente.');
    if (node.needs === 'ponte' && !(await bridgeDone(db))) throw new EcosError(409, 'Do outro lado do riacho — precisa da ponte.');
    const p = pos(body);
    if (Math.hypot(p.x - node.x, p.z - node.z) > ecfg.reach) throw new EcosError(409, 'Longe demais: chegue mais perto do recurso.');
    const block = superiorBlock(node.id, (await classInfo(db, c, ctx.admin)).forms);
    if (block) throw new EcosError(403, block);
    if (ap.tool && !(await ownedTools(db, cid)).includes(ap.tool)) throw new EcosError(409, `Precisa de uma ferramenta (${ap.tool}) — só Taurinas forjam ferramentas: peça uma no quadro de encomendas.`);
    const r = await rpc<{ ok: boolean; status: string; started_at: string; result: unknown; reason?: string }>(db, 'ecos_start', { p_request: request, p_cid: cid, p_node: node.id, p_approach: ap.id });
    if (!r.ok) throw new EcosError(400, reasonText(r.reason));
    return { started: { request, startedAt: Date.parse(r.started_at), status: r.status, result: r.result, seconds: ap.seconds * ecfg.timeSlack } };
  }

  if (action === 'ecos.finish') {
    const request = cleanRequestId(body.request); if (!request) throw new EcosError(400, 'Pedido inválido.');
    const node = nodeById(String(body.node)); if (!node) throw new EcosError(400, 'Recurso inexistente.');
    const ap = approachOf(node, String(body.approach)); if (!ap) throw new EcosError(400, 'Abordagem inexistente.');
    const kind = NODE_KINDS[node.kind];
    const block = superiorBlock(node.id, (await classInfo(db, c, ctx.admin)).forms);
    if (block) throw new EcosError(403, block);
    // afinar o eco: o servidor recalcula a nota dos três pulsos (com teto); a Companion sozinha afina como "bom"
    const tune = scoreTune(body.by === 'companion' ? COMPANION_TUNE : cleanTune(body.tune));
    const items = rollGather(node, ap, request, tune.bonus).map((b) => ({ key: b.key, qty: b.qty }));
    const r = await rpc<{ ok: boolean; reason?: string; items?: { key: string; qty: number }[]; repeat?: boolean; wait?: number }>(db, 'ecos_finish_gather', {
      p_request: request, p_cid: cid, p_node: node.id, p_approach: ap.id, p_cost: ap.cost, p_cap: kind.capacity, p_regen: kind.regenPerHour,
      p_min_seconds: ap.seconds * ecfg.timeSlack, p_items: items, p_bag_cap: ecfg.bag,
    });
    let clue = null;
    if (r.ok && !r.repeat) {
      if (ap.tool) await wearTool(db, cid, ap.tool);
      clue = await advanceChain(ctx, { node: node.id, approach: ap.id });
    }
    return { gather: { ok: r.ok, reason: r.reason ?? null, message: r.ok ? null : reasonText(r.reason), wait: r.wait ?? null, items: r.ok ? r.items : [], repeat: !!r.repeat, tune }, clue, ecos: await ecosState(db, cid, ecfg) };
  }

  if (action === 'ecos.inspect') {
    const node = nodeById(String(body.node)); if (!node) throw new EcosError(400, 'Recurso inexistente.');
    const p = pos(body);
    if (Math.hypot(p.x - node.x, p.z - node.z) > ecfg.reach + 2) throw new EcosError(409, 'Chegue mais perto para observar.');
    await db.from('ecos_profile').upsert({ companion_id: cid }, { onConflict: 'companion_id', ignoreDuplicates: true });
    const { data } = await db.from('ecos_profile').select('seen').eq('companion_id', cid).maybeSingle();
    const seen = new Set((data?.seen as string[] | undefined) ?? []); seen.add(node.id);
    await db.from('ecos_profile').update({ seen: [...seen] }).eq('companion_id', cid);
    const clue = await advanceChain(ctx, { node: node.id, inspect: true });
    return { clue, ecos: await ecosState(db, cid, ecfg) };
  }

  if (action === 'ecos.reach') {
    const p = pos(body);
    const clue = await advanceChain(ctx, { x: p.x, z: p.z });
    return { clue, ecos: clue ? await ecosState(db, cid, ecfg) : undefined };
  }

  if (action === 'ecos.choose') {
    const request = cleanRequestId(body.request); if (!request) throw new EcosError(400, 'Pedido inválido.');
    const chain = CHAINS[String(body.chain)]; if (!chain) throw new EcosError(400, 'Descoberta inexistente.');
    const choice = body.choice === 'extrair' || body.choice === 'preservar' ? body.choice as ChainChoice : null;
    if (!choice) throw new EcosError(400, 'Escolha inválida.');
    const p = pos(body);
    if (Math.hypot(p.x - NASCENTE.x, p.z - NASCENTE.z) > 8) throw new EcosError(409, 'Volte até a nascente para decidir.');
    const give = chainReward(choice).map((b) => ({ key: b.key, qty: b.qty }));
    const r = await rpc<{ ok: boolean; reason?: string; repeat?: boolean }>(db, 'ecos_chain_finish', {
      p_request: request, p_cid: cid, p_chain: chain.id, p_steps: chain.steps.length, p_choice: choice, p_give: give, p_bag_cap: ecfg.bag,
      p_site: choice === 'preservar' ? JARDIM.id : null, p_technique: 'leitura-de-inclusoes',
    });
    if (!r.ok) throw new EcosError(409, reasonText(r.reason));
    let bond = null;
    if (!r.repeat) {
      await ctx.event('ecos.discovery', { chain: chain.id, choice });
      await memory(ctx, cid, choice === 'preservar'
        ? `${name} descobriu a Nascente Azul do Vale dos Ecos e escolheu preservá-la: ali nasceu o Jardim da Nascente.`
        : `${name} descobriu a Nascente Azul do Vale dos Ecos e extraiu seus cristais de quartzo azul.`, 4);
      bond = await grantBond(ctx, cid, ctx.cfg.discoveryXp, 'descoberta');
      await lumes(db, 'disc:' + request, cid, ctx.pcfg.discoveryLumes, 'descoberta', chain.id);
    }
    return { chosen: { choice, gave: give, site: choice === 'preservar' ? JARDIM.id : null }, bond, ecos: await ecosState(db, cid, ecfg) };
  }

  if (action === 'ecos.craft') {
    const request = cleanRequestId(body.request); if (!request) throw new EcosError(400, 'Pedido inválido.');
    const recipe = recipeById(String(body.recipe)); if (!recipe) throw new EcosError(400, 'Receita inexistente.');
    const picks = Array.isArray(body.picks) ? (body.picks as Record<string, unknown>[]).slice(0, 12).map((x) => ({ slot: Number(x.slot), key: String(x.key), qty: Number(x.qty) })) : [];
    const { data } = await db.from('ecos_bag').select('batch_key,qty').eq('companion_id', cid);
    const bag: MaterialBatch[] = (data ?? []).map((b) => { const p = parseBatchKey(b.batch_key as string); return p ? { key: b.batch_key as string, qty: b.qty as number, ...p } : null; }).filter((x): x is MaterialBatch => !!x);
    const chk = checkCraft(recipe, picks, bag);
    if (!chk.ok) {
      // repetição de um pedido já feito: o rpc devolve o resultado guardado
      const prev = await db.from('ecos_actions').select('result').eq('request_id', request).maybeSingle();
      if (prev.data?.result) return { crafted: prev.data.result, ecos: await ecosState(db, cid, ecfg) };
      throw new EcosError(409, chk.reason);
    }
    const item = recipe.output.kind === 'item' ? { item_key: recipe.output.key, meta: { label: recipe.output.label, description: `${recipe.description} Qualidade: ${chk.quality}.`, quality: chk.quality, ecos: true } } : null;
    const r = await rpc<{ ok: boolean; reason?: string; repeat?: boolean }>(db, 'ecos_bag_apply', {
      p_request: request, p_cid: cid, p_kind: 'craft', p_take: chk.consume, p_give: [], p_bag_cap: ecfg.bag,
      p_tool: recipe.output.kind === 'tool' ? recipe.output.key : null, p_item: item,
    });
    if (!r.ok) throw new EcosError(409, reasonText(r.reason));
    if (!r.repeat) await ctx.event('ecos.craft', { recipe: recipe.id, quality: chk.quality });
    return { crafted: { recipe: recipe.id, label: recipe.output.label, quality: chk.quality, kind: recipe.output.kind }, ecos: await ecosState(db, cid, ecfg) };
  }

  if (action === 'ecos.drop') {
    const request = cleanRequestId(body.request); if (!request) throw new EcosError(400, 'Pedido inválido.');
    const key = String(body.key), qty = Math.max(1, Math.min(999, Math.round(Number(body.qty) || 1)));
    if (!parseBatchKey(key)) throw new EcosError(400, 'Material inválido.');
    const r = await rpc<{ ok: boolean; reason?: string }>(db, 'ecos_bag_apply', { p_request: request, p_cid: cid, p_kind: 'drop', p_take: [{ key, qty }], p_give: [], p_bag_cap: ecfg.bag, p_tool: null, p_item: null });
    if (!r.ok) throw new EcosError(409, reasonText(r.reason));
    return { dropped: { key, qty }, ecos: await ecosState(db, cid, ecfg) };
  }

  if (action === 'ecos.site.harvest' || action === 'ecos.site.care') {
    const p = pos(body);
    if (Math.hypot(p.x - NASCENTE.x, p.z - NASCENTE.z) > 9) throw new EcosError(409, 'Vá até o jardim.');
    if (action === 'ecos.site.care') {
      const r = await rpc<{ ok: boolean; reason?: string }>(db, 'ecos_site_care', { p_cid: cid, p_site: JARDIM.id, p_cap: JARDIM.capacity, p_regen: JARDIM.regenPerHour, p_boost: JARDIM.careBoost, p_care_hours: JARDIM.careHours, p_cooldown_hours: 20 });
      if (!r.ok) throw new EcosError(409, reasonText(r.reason));
      return { cared: true, ecos: await ecosState(db, cid, ecfg) };
    }
    const request = cleanRequestId(body.request); if (!request) throw new EcosError(400, 'Pedido inválido.');
    const r = await rpc<{ ok: boolean; reason?: string; items?: unknown }>(db, 'ecos_site_harvest', {
      p_request: request, p_cid: cid, p_site: JARDIM.id, p_cap: JARDIM.capacity, p_regen: JARDIM.regenPerHour, p_boost: JARDIM.careBoost, p_care_hours: JARDIM.careHours,
      p_max: JARDIM.harvestMax, p_key: JARDIM.produces.key, p_bag_cap: ecfg.bag,
    });
    if (!r.ok) throw new EcosError(409, reasonText(r.reason));
    return { harvested: r.items, ecos: await ecosState(db, cid, ecfg) };
  }

  if (action === 'ecos.contribute') {
    const request = cleanRequestId(body.request); if (!request) throw new EcosError(400, 'Pedido inválido.');
    const stage = Math.round(Number(body.stage)), need = Math.round(Number(body.need)), qty = Math.max(1, Math.min(999, Math.round(Number(body.qty) || 0)));
    const key = String(body.key), b = parseBatchKey(key);
    if (!b || !PONTE.stages[stage] || !PONTE.stages[stage].needs[need]) throw new EcosError(400, 'Contribuição inválida.');
    if (!needFits(PONTE, stage, need, b)) throw new EcosError(409, 'Esse material não serve para essa parte da obra.');
    const goals = PONTE.stages[stage].needs.map((n) => scaledNeed(n, ecfg.projectScale));
    const next = PONTE.stages[stage + 1]?.needs.map((n) => scaledNeed(n, ecfg.projectScale)) ?? [];
    const r = await rpc<{ ok: boolean; reason?: string; accepted?: number; stageDone?: boolean; contributors?: string[]; repeat?: boolean }>(db, 'ecos_contribute', {
      p_request: request, p_cid: cid, p_project: PONTE.id, p_stage: stage, p_need: need, p_key: key, p_qty: qty,
      p_goals: goals, p_next_goals: next, p_stages: PONTE.stages.length, p_cap_total: Math.ceil(goals.reduce((a, x) => a + x, 0) * ecfg.capShare), p_cap_hours: ecfg.capHours,
    });
    if (!r.ok) throw new EcosError(409, reasonText(r.reason));
    let bond = null;
    if (r.stageDone && !r.repeat) {
      const st = PONTE.stages[stage];
      await ctx.event('ecos.project', { project: PONTE.id, stage: st.id });
      // reconhece TODOS que contribuíram na etapa (não só quem entregou por último)
      for (const other of (r.contributors ?? []).slice(0, 200)) {
        const g = await grantBond(ctx, other, Math.round(ctx.cfg.discoveryXp / 2), 'obra');
        if (other === cid) bond = g;
        await lumes(db, `obra:${PONTE.id}:${stage}:${other}`, other, ctx.pcfg.projectStageLumes, 'obra', PONTE.id);
        await memory(ctx, other, `A etapa "${st.title}" da Ponte do Riacho ficou pronta, com a ajuda de quem passou pelo Vale dos Ecos. ${st.done}`, 3);
      }
    }
    return { contributed: { accepted: r.accepted ?? 0, stageDone: !!r.stageDone, requested: qty }, bond, ecos: await ecosState(db, cid, ecfg) };
  }

  throw new EcosError(404, 'Ação desconhecida.');
}

/** Para testes e para a interface: o nó existe e a abundância agora. */
export const nodeAbundance = (nodeId: string, st: { amount: number; at: number } | null) => { const n = nodeById(nodeId); return n ? abundanceNow(n, st, Date.now()) : 0; };
export { VALE_NODES };
