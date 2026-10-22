// Pacto das Cinco no servidor: valida classe (ofício e Forja), capacidade da oficina, recursos, tempo, pagamentos e
// resultados; grava por funções SQL atômicas e idempotentes. A IA não autoriza nada.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  SPECIES, OFFICES, CLASS_LABEL, canCompleteEquipment, transformationById, checkTransformation, blueprintById, forgePreview, resolvePacto, coreCost,
  meetsRequirements, cancelSettlement, payout, recycleReturn, REPAIR_KIT_AMOUNT, parseComponentKey, COMPONENTS, cleanRequestId, nodeById, NODE_KINDS,
  canExtractSuperior, SOURCE_LABEL, type PactoConfig, type ForgePlan, type SpeciesKey, type Element, type IdentityContractV1, type Discoveries,
  type OrderRequirements, type EcosConfig, type Conduct, type Temper, type SourceKind,
} from './rules/index.ts';

export class PactoError extends Error { constructor(public status: number, msg: string) { super(msg); } }

const REASON: Record<string, string> = {
  'oficina-cheia': 'A oficina pública está cheia agora. Tente daqui a pouco.',
  'limite-artesao': 'Você já está no limite de trabalhos ao mesmo tempo.',
  'faltam-materiais': 'Faltam materiais na mochila.',
  'sem-lumes': 'Lumes insuficientes.',
  'encomenda-invalida': 'Essa encomenda não está com você.',
  'deposito-insuficiente': 'O depósito da encomenda não tem esse material.',
  'nao-iniciada': 'Esse trabalho não existe (ou não é seu).',
  'cedo': 'Ainda está trabalhando…',
  'mochila-cheia': 'A mochila está cheia: nada foi entregue (nem perdido). Libere espaço.',
  'nao-existe': 'Encomenda não encontrada.',
  'indisponivel': 'Essa encomenda não está disponível.',
  'propria': 'Você não pode aceitar a própria encomenda.',
  'expirada': 'A encomenda expirou.',
  'peca-invalida': 'Peça inválida.',
  'forja-em-andamento': 'Termine (ou cancele) a forja antes de entregar.',
  'ja-entregue': 'Já foi entregue.',
  'divisao-invalida': 'Divisão inválida.',
  'inteira': 'A peça já está inteira.',
  'sem-kit': 'Você não tem um Kit de Reparo.',
};
const reason = (r?: string) => (r && REASON[r]) || 'Não deu certo.';
const KIT_KEY = 'item:kit-de-reparo';

async function rpc<T = Record<string, unknown>>(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new PactoError(500, 'Falha no servidor (' + fn + ').');
  return data as T;
}

/** Classe real (da identidade) e a efetiva (com a classe de teste, só para admin). A identidade nunca muda. */
export async function classInfo(db: SupabaseClient, c: Record<string, unknown>, admin: boolean) {
  const real = ((c.identity_contract as IdentityContractV1 | null)?.species?.family ?? null) as SpeciesKey | null;
  const { data } = await db.from('pacto_profile').select('test_class').eq('companion_id', c.id).maybeSingle();
  const test = admin ? ((data?.test_class as SpeciesKey | null) ?? null) : null;
  const essence = ((c.discoveries as Discoveries).element ?? null) as Element | null;
  return { real, effective: test ?? real, test, essence };
}

/** Ferramentas que o Companion tem (forjadas, ativas e com durabilidade). */
export async function ownedTools(db: SupabaseClient, cid: string): Promise<string[]> {
  const { data } = await db.from('pacto_equipment').select('tool').eq('owner', cid).eq('status', 'ativo').eq('kind', 'ferramenta').gt('durability', 0);
  return [...new Set((data ?? []).map((r) => r.tool as string).filter(Boolean))];
}
export async function wearTool(db: SupabaseClient, cid: string, tool: string) { await rpc(db, 'pacto_equipment_wear', { p_cid: cid, p_tool: tool, p_item: null, p_amount: 1 }).catch(() => null); }

/** Fonte superior: só a classe da fonte extrai (Taurina nunca). */
export function superiorBlock(nodeId: string, effective: SpeciesKey | null): string | null {
  const n = nodeById(nodeId); const src = n ? NODE_KINDS[n.kind].source as SourceKind | undefined : undefined;
  if (!src) return null;
  if (canExtractSuperior(effective, src)) return null;
  const who = Object.values(OFFICES).find((o) => o.cls !== 'touro' && canExtractSuperior(o.cls, src));
  return `Fonte superior (${SOURCE_LABEL[src]}): só ${who ? CLASS_LABEL[who.cls] : 'outra classe'} extrai daqui.${effective === 'touro' ? ' Você pode anunciar a oportunidade no quadro.' : ''}`;
}

export async function lumes(db: SupabaseClient, request: string, cid: string, delta: number, why: string, ref: string | null) {
  if (!delta) return null;
  return rpc(db, 'pacto_lumes', { p_request: request, p_cid: cid, p_delta: delta, p_reason: why, p_ref: ref }).catch(() => null);
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

async function expireOrders(db: SupabaseClient) {
  const { data } = await db.from('pacto_orders').select('id,payment,status').in('status', ['aberta', 'aceita']).lt('deadline', new Date().toISOString()).limit(20);
  for (const o of data ?? []) await rpc(db, 'pacto_order_cancel', { p_id: o.id, p_by: null, p_status: 'expirada', p_to_client: o.payment, p_to_artisan: 0, p_request: crypto.randomUUID() }).catch(() => null);
}

export async function pactoState(db: SupabaseClient, c: Record<string, unknown>, admin: boolean, pcfg: PactoConfig) {
  const cid = c.id as string;
  await rpc(db, 'pacto_starter', { p_cid: cid, p_amount: pcfg.starterLumes }).catch(() => null);
  await expireOrders(db);
  const [cls, prof, eq, jobs, open, mine, board] = await Promise.all([
    classInfo(db, c, admin),
    db.from('pacto_profile').select('lumes').eq('companion_id', cid).maybeSingle(),
    db.from('pacto_equipment').select('id,blueprint,kind,tool,data,durability,max_durability,created_at').eq('owner', cid).eq('status', 'ativo').order('created_at', { ascending: false }),
    db.from('pacto_jobs').select('request_id,kind,ref,order_id,started_at,seconds,status,plan').eq('artisan', cid).eq('status', 'running'),
    db.from('pacto_orders').select('id,client,artisan,blueprint,requirements,deposit,substitutions,payment,deadline,status,history,item,created_at').eq('status', 'aberta').order('created_at', { ascending: false }).limit(30),
    db.from('pacto_orders').select('id,client,artisan,blueprint,requirements,deposit,substitutions,payment,deadline,status,history,item,created_at').or(`client.eq.${cid},artisan.eq.${cid}`).order('updated_at', { ascending: false }).limit(30),
    db.from('pacto_board').select('id,companion_id,kind,text,node_id,created_at').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(30),
  ]);
  // nomes de quem aparece (clientes, artesãos, anúncios)
  const ids = new Set<string>();
  for (const o of [...(open.data ?? []), ...(mine.data ?? [])]) { ids.add(o.client as string); if (o.artisan) ids.add(o.artisan as string); }
  for (const b of board.data ?? []) ids.add(b.companion_id as string);
  const { data: people } = ids.size ? await db.from('companions').select('id,discoveries,identity_contract').in('id', [...ids]) : { data: [] };
  const names = Object.fromEntries((people ?? []).map((p) => [p.id, { name: (p.discoveries as Discoveries).name ?? 'Companion', cls: (p.identity_contract as IdentityContractV1 | null)?.species?.family ?? null }]));
  // atividade recente do artesão (para "artesão ausente")
  const now = Date.now();
  return {
    serverNow: now,
    me: cid,
    lumes: Number(prof.data?.lumes ?? 0),
    cls: { real: cls.real, effective: cls.effective, test: cls.test, essence: cls.essence, admin },
    equipment: (eq.data ?? []).map((e) => ({ id: e.id, blueprint: e.blueprint, kind: e.kind, tool: e.tool, durability: e.durability, maxDurability: e.max_durability, createdAt: e.created_at, ...(e.data as Record<string, unknown>) })),
    jobs: (jobs.data ?? []).map((j) => ({ request: j.request_id, kind: j.kind, ref: j.ref, order: j.order_id, startedAt: Date.parse(j.started_at as string), seconds: Number(j.seconds) })),
    orders: { open: open.data ?? [], mine: mine.data ?? [] },
    board: board.data ?? [],
    names,
    config: pcfg,
  };
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

interface Ctx { db: SupabaseClient; c: Record<string, unknown>; admin: boolean; pcfg: PactoConfig; ecfg: EcosConfig; event: (kind: string, payload: unknown) => Promise<number> }

async function bagOf(db: SupabaseClient, cid: string) {
  const { data } = await db.from('ecos_bag').select('batch_key,qty').eq('companion_id', cid);
  return (data ?? []).map((b) => ({ key: b.batch_key as string, qty: b.qty as number })).filter((b) => b.qty > 0);
}
const rid = (x: unknown) => { const r = cleanRequestId(x); if (!r) throw new PactoError(400, 'Pedido inválido.'); return r; };

/** Nomes dos autores dos componentes (pela procedência na chave). */
async function contributorNames(db: SupabaseClient, keys: string[]) {
  const out: { office: string; component: string; maker: string; name: string }[] = [];
  for (const key of keys) {
    const pc = parseComponentKey(key); if (!pc) continue;
    const { data } = await db.from('pacto_jobs').select('artisan').eq('kind', 'oficio').eq('status', 'done').contains('result', { gave: [{ key }] }).limit(1);
    let name = 'artesão(ã)';
    if (data?.[0]) { const { data: c } = await db.from('companions').select('discoveries').eq('id', data[0].artisan).maybeSingle(); name = (c?.discoveries as Discoveries | undefined)?.name ?? name; }
    out.push({ office: COMPONENTS[pc.component].office, component: pc.component, maker: pc.maker, name });
  }
  return out;
}

export async function pactoAction(action: string, body: Record<string, unknown>, ctx: Ctx): Promise<Record<string, unknown>> {
  const { db, c, admin, pcfg, ecfg } = ctx;
  const cid = c.id as string;
  if (c.stage !== 'awakened') throw new PactoError(409, 'O Pacto começa depois do despertar.');
  const state = async () => pactoState(db, c, admin, pcfg);
  const me = (c.discoveries as Discoveries).name ?? 'Companion';

  if (action === 'pacto.state') return { pacto: await state() };

  if (action === 'pacto.testClass') {
    if (!admin) throw new PactoError(403, 'Só para administradores (teste).');
    const v = typeof body.cls === 'string' && body.cls in SPECIES ? body.cls : null;
    await db.from('pacto_profile').upsert({ companion_id: cid, test_class: v, updated_at: new Date().toISOString() }, { onConflict: 'companion_id' });
    return { pacto: await state() };
  }

  const cls = await classInfo(db, c, admin);

  // ---- ofício (transformação)
  if (action === 'pacto.office.start') {
    const request = rid(body.request);
    const t = transformationById(String(body.transformation)); if (!t) throw new PactoError(400, 'Transformação inexistente.');
    const office = cls.effective ? OFFICES[cls.effective].key : null;
    if (office !== t.office) throw new PactoError(403, `Só quem tem o ofício ${Object.values(OFFICES).find((o) => o.key === t.office)!.name} faz isso.`);
    const picks = Array.isArray(body.picks) ? (body.picks as Record<string, unknown>[]).slice(0, 12).map((p) => ({ slot: Number(p.slot), key: String(p.key), qty: Number(p.qty) })) : [];
    const chk = checkTransformation(t, picks, await bagOf(db, cid), String(body.choice), cls.essence, body.useEssence === true, cid);
    if (!chk.ok) throw new PactoError(409, chk.reason);
    const r = await rpc<{ ok: boolean; reason?: string; started_at?: string; seconds?: number; repeat?: boolean }>(db, 'pacto_job_start', {
      p_request: request, p_cid: cid, p_kind: 'oficio', p_ref: t.id, p_plan: { output: chk.output, bands: chk.bands, choice: body.choice, essence: body.useEssence === true ? cls.essence : null },
      p_bag: chk.consume, p_deposit: [], p_order: null, p_fee: 0, p_seconds: t.seconds, p_slots: pcfg.workshopSlots, p_per_artisan: pcfg.perArtisan,
    });
    if (!r.ok) throw new PactoError(409, reason(r.reason));
    return { started: { request, seconds: t.seconds }, pacto: await state() };
  }

  // ---- forja (só Taurina)
  if (action === 'pacto.forge.start') {
    const request = rid(body.request);
    if (!canCompleteEquipment(cls.effective)) throw new PactoError(403, 'Só Taurinas forjam e concluem equipamentos.');
    const plan = body.plan as ForgePlan;
    const bp = plan && blueprintById(String(plan.blueprint)); if (!bp) throw new PactoError(400, 'Projeto inexistente.');
    const clean: ForgePlan = { blueprint: bp.id, picks: (Array.isArray(plan.picks) ? plan.picks : []).slice(0, 16).map((p) => ({ slot: Number(p.slot), key: String(p.key), qty: Number(p.qty) })), conduct: plan.conduct === 'leveza' ? 'leveza' : 'resistencia', temper: plan.temper === 'reativa' ? 'reativa' : 'estavel', name: typeof plan.name === 'string' ? plan.name.slice(0, 40) : undefined };
    const orderId = typeof body.order === 'string' && cleanRequestId(body.order) ? body.order : null;
    const bag = await bagOf(db, cid);
    // com encomenda: usa primeiro o depósito, depois a mochila do artesão (só se a encomenda permitir substituições)
    let deposit: { key: string; qty: number }[] = [];
    if (orderId) {
      const { data: o } = await db.from('pacto_orders').select('deposit,artisan,status,blueprint,substitutions').eq('id', orderId).maybeSingle();
      if (!o || o.artisan !== cid || o.status !== 'aceita' || o.blueprint !== bp.id) throw new PactoError(409, 'Essa encomenda não está pronta para forjar com você.');
      deposit = (o.deposit as { key: string; qty: number }[]).filter((d) => d.qty > 0);
      if (!o.substitutions && clean.picks.some((p) => !deposit.some((d) => d.key === p.key))) throw new PactoError(409, 'Esta encomenda não autoriza substituições: use só o que o cliente depositou.');
    }
    const union = [...bag];
    for (const d of deposit) { const b = union.find((x) => x.key === d.key); if (b) b.qty += d.qty; else union.push({ ...d }); }
    const pv = forgePreview(clean, union, { barrier: pcfg.barrier });
    if (!pv.ok) throw new PactoError(409, pv.reason + (pv.missing ? ': ' + pv.missing.join(', ') : ''));
    const fromDeposit: { key: string; qty: number }[] = [], fromBag: { key: string; qty: number }[] = [];
    for (const k of pv.consume) {
      const d = deposit.find((x) => x.key === k.key)?.qty ?? 0, take = Math.min(d, k.qty);
      if (take) fromDeposit.push({ key: k.key, qty: take });
      if (k.qty - take) fromBag.push({ key: k.key, qty: k.qty - take });
    }
    const fee = coreCost(cls.essence, pcfg).total;
    const r = await rpc<{ ok: boolean; reason?: string }>(db, 'pacto_job_start', {
      p_request: request, p_cid: cid, p_kind: 'forja', p_ref: bp.id, p_plan: clean, p_bag: fromBag, p_deposit: fromDeposit, p_order: orderId,
      p_fee: fee, p_seconds: bp.seconds, p_slots: pcfg.workshopSlots, p_per_artisan: pcfg.perArtisan,
    });
    if (!r.ok) throw new PactoError(409, reason(r.reason));
    return { started: { request, seconds: bp.seconds, fee }, pacto: await state() };
  }

  if (action === 'pacto.job.finish') {
    const request = rid(body.request);
    const { data: j } = await db.from('pacto_jobs').select('*').eq('request_id', request).maybeSingle();
    if (!j || j.artisan !== cid) throw new PactoError(404, reason('nao-iniciada'));
    let give: { key: string; qty: number }[] = [], equipment: Record<string, unknown> | null = null, label = '';
    if (j.kind === 'oficio') {
      const out = (j.plan as { output: { key: string; qty: number } }).output;
      give = [out]; label = COMPONENTS[parseComponentKey(out.key)?.component ?? '']?.name ?? 'Componente';
    } else {
      const plan = j.plan as ForgePlan, bp = blueprintById(plan.blueprint)!;
      const reserved = [...(j.reserved_bag as { key: string; qty: number }[])];
      for (const d of j.reserved_deposit as { key: string; qty: number }[]) { const b = reserved.find((x) => x.key === d.key); if (b) b.qty += d.qty; else reserved.push({ ...d }); }
      const pv = forgePreview(plan, reserved, { barrier: pcfg.barrier });
      if (!pv.ok) throw new PactoError(500, 'Plano inválido na conclusão.');
      label = plan.name || bp.name;
      if (bp.kind === 'consumivel') give = [{ key: KIT_KEY, qty: 1 }];
      else {
        const contributors = await contributorNames(db, pv.consume.map((x) => x.key));
        equipment = {
          id: crypto.randomUUID(), blueprint: bp.id, kind: bp.kind, tool: bp.tool ?? null, durability: pv.durability,
          data: {
            name: label, itemType: bp.itemType ?? null, stats: pv.stats, weight: pv.weight, affinity: pv.affinity, mark: pv.mark, rarity: pv.rarity, layers: pv.layers,
            consumed: pv.consume, plan, signature: { artisan: cid, artisanName: me, at: new Date().toISOString(), contributors }, history: [{ at: new Date().toISOString(), what: `forjado por ${me}` }],
          },
        };
      }
    }
    const r = await rpc<{ ok: boolean; reason?: string; wait?: number; repeat?: boolean; equipment?: string }>(db, 'pacto_job_finish', {
      p_request: request, p_cid: cid, p_min_seconds: Number(j.seconds) * ecfg.timeSlack, p_give: give, p_equipment: equipment, p_bag_cap: ecfg.bag,
    });
    if (!r.ok && r.reason === 'cedo') return { job: { ok: false, wait: r.wait } };
    if (!r.ok) throw new PactoError(409, reason(r.reason));
    if (!r.repeat) await ctx.event(j.kind === 'oficio' ? 'pacto.oficio' : 'pacto.forja', { ref: j.ref, label });
    return { job: { ok: true, kind: j.kind, label, repeat: !!r.repeat, equipment: r.equipment ?? null }, pacto: await state() };
  }

  if (action === 'pacto.job.cancel') {
    const r = await rpc<{ ok: boolean; reason?: string }>(db, 'pacto_job_cancel', { p_request: rid(body.request), p_cid: cid });
    if (!r.ok) throw new PactoError(409, reason(r.reason));
    return { pacto: await state() };
  }

  // ---- encomendas
  if (action === 'pacto.order.create') {
    const id = rid(body.id);
    const bp = blueprintById(String(body.blueprint)); if (!bp || bp.kind === 'consumivel') throw new PactoError(400, 'Projeto inválido.');
    const payment = Math.max(0, Math.min(100000, Math.round(Number(body.payment) || 0)));
    const hours = Math.max(1, Math.min(24 * 14, Number(body.deadlineHours) || 48));
    const deposit = Array.isArray(body.deposit) ? (body.deposit as Record<string, unknown>[]).slice(0, 12).map((d) => ({ key: String(d.key), qty: Math.max(1, Math.round(Number(d.qty) || 0)) })) : [];
    const rq = (body.requirements ?? {}) as Record<string, unknown>;
    const req: OrderRequirements = {
      minStats: Object.fromEntries(Object.entries((rq.minStats ?? {}) as Record<string, unknown>).filter(([k]) => ['vida', 'energia', 'poder', 'defesa', 'agilidade', 'sintonia'].includes(k)).map(([k, v]) => [k, Math.max(0, Math.min(50, Number(v) || 0))])),
      maxWeight: rq.maxWeight === 'leve' || rq.maxWeight === 'medio' || rq.maxWeight === 'pesado' ? rq.maxWeight : null,
      mark: rq.mark === 'barreira-breve' || rq.mark === 'afinidade-agua' ? rq.mark : null,
    };
    const r = await rpc<{ ok: boolean; reason?: string }>(db, 'pacto_order_create', { p_id: id, p_cid: cid, p_blueprint: bp.id, p_requirements: req, p_deposit: deposit, p_substitutions: body.substitutions === true, p_payment: payment, p_deadline: new Date(Date.now() + hours * 3_600_000).toISOString() });
    if (!r.ok) throw new PactoError(409, reason(r.reason));
    return { pacto: await state() };
  }
  if (action === 'pacto.order.accept') {
    if (!canCompleteEquipment(cls.effective)) throw new PactoError(403, 'Só Taurinas aceitam encomendas de equipamento.');
    const r = await rpc<{ ok: boolean; reason?: string }>(db, 'pacto_order_accept', { p_id: rid(body.id), p_artisan: cid, p_max_active: pcfg.perArtisan * 2 });
    if (!r.ok) throw new PactoError(409, reason(r.reason));
    return { pacto: await state() };
  }
  if (action === 'pacto.order.deliver') {
    const id = rid(body.id);
    const { data: o } = await db.from('pacto_orders').select('*').eq('id', id).maybeSingle();
    if (!o || o.artisan !== cid) throw new PactoError(409, reason('indisponivel'));
    const item = String(body.item ?? o.item ?? '');
    if (o.item !== item) throw new PactoError(409, 'Entregue a peça forjada para esta encomenda (a que saiu da forja com o depósito).');
    const { data: e } = await db.from('pacto_equipment').select('data').eq('id', item).maybeSingle();
    if (!e) throw new PactoError(409, reason('peca-invalida'));
    const fails = meetsRequirements(o.requirements as OrderRequirements, e.data as never);
    if (fails.length) throw new PactoError(409, 'A peça não cumpre o contrato: ' + fails.join(', ') + '. Reforje ou cancele.');
    const fee = payout(Number(o.payment), pcfg).fee;
    const r = await rpc<{ ok: boolean; reason?: string }>(db, 'pacto_order_deliver', { p_id: id, p_artisan: cid, p_item: item, p_fee: fee, p_request: crypto.randomUUID() });
    if (!r.ok) throw new PactoError(409, reason(r.reason));
    await ctx.event('pacto.entrega', { order: id });
    return { delivered: true, pacto: await state() };
  }
  if (action === 'pacto.order.cancel') {
    const id = rid(body.id);
    const { data: o } = await db.from('pacto_orders').select('*').eq('id', id).maybeSingle();
    if (!o) throw new PactoError(404, reason('nao-existe'));
    let st: ReturnType<typeof cancelSettlement>;
    if (o.client === cid) {
      // artesão ausente: sem atividade no prazo configurado (ou prazo vencido)
      let absent = Date.parse(o.deadline) < Date.now();
      if (o.artisan && !absent) {
        const { data: last } = await db.from('pacto_jobs').select('started_at').eq('artisan', o.artisan).order('started_at', { ascending: false }).limit(1);
        const lastAt = last?.[0] ? Date.parse(last[0].started_at as string) : Date.parse(o.updated_at);
        absent = Date.now() - lastAt > pcfg.artisanIdleHours * 3_600_000;
      }
      st = cancelSettlement(o.status, Number(o.payment), pcfg, absent);
    } else if (o.artisan === cid) {
      // o artesão desiste: tudo volta ao cliente, sem compensação
      st = cancelSettlement(o.status, Number(o.payment), pcfg, true);
    } else throw new PactoError(403, 'Só o cliente ou o artesão podem cancelar.');
    if (!st) throw new PactoError(409, 'Essa encomenda não pode mais ser cancelada.');
    const r = await rpc<{ ok: boolean; reason?: string }>(db, 'pacto_order_cancel', { p_id: id, p_by: cid, p_status: 'cancelada', p_to_client: st.toClient, p_to_artisan: st.toArtisan, p_request: crypto.randomUUID() });
    if (!r.ok) throw new PactoError(409, reason(r.reason));
    return { cancelled: st, pacto: await state() };
  }

  // ---- ciclo de vida
  if (action === 'pacto.item.repair') {
    const r = await rpc<{ ok: boolean; reason?: string; durability?: number }>(db, 'pacto_equipment_repair', { p_cid: cid, p_item: rid(body.item), p_kit: KIT_KEY, p_amount: REPAIR_KIT_AMOUNT });
    if (!r.ok) throw new PactoError(409, reason(r.reason));
    return { repaired: r.durability, pacto: await state() };
  }
  if (action === 'pacto.item.recycle') {
    const item = rid(body.item);
    const [{ data: e }, { data: eqp }] = await Promise.all([
      db.from('pacto_equipment').select('data,owner,status').eq('id', item).maybeSingle(),
      db.from('companion_equipment').select('equipped').eq('companion_id', cid).maybeSingle(),
    ]);
    if (!e || e.owner !== cid) throw new PactoError(409, reason('peca-invalida'));
    if (Object.values((eqp?.equipped ?? {}) as Record<string, string>).some((s) => s === 'inst-' + item.replace(/-/g, '').slice(0, 12))) throw new PactoError(409, 'Desequipe a peça antes de reciclar.');
    const give = recycleReturn(((e.data as { consumed?: { key: string; qty: number }[] }).consumed) ?? []);
    const r = await rpc<{ ok: boolean; reason?: string }>(db, 'pacto_equipment_recycle', { p_cid: cid, p_item: item, p_give: give, p_bag_cap: ecfg.bag });
    if (!r.ok) throw new PactoError(409, reason(r.reason));
    return { recycled: give, pacto: await state() };
  }
  if (action === 'pacto.item.reforge') {
    if (!canCompleteEquipment(cls.effective)) throw new PactoError(403, 'Reforja estrutural é da Taurina.');
    const item = rid(body.item);
    const { data: e } = await db.from('pacto_equipment').select('data,owner,status,blueprint').eq('id', item).maybeSingle();
    if (!e || e.owner !== cid || e.status !== 'ativo') throw new PactoError(409, 'Só dá para reforjar uma peça sua (para a de outra pessoa, use uma encomenda).');
    const data = e.data as Record<string, unknown> & { plan: ForgePlan; consumed: { key: string; qty: number }[]; history: { at: string; what: string }[] };
    const conduct: Conduct = body.conduct === 'leveza' ? 'leveza' : 'resistencia', temper: Temper = body.temper === 'reativa' ? 'reativa' : 'estavel';
    const plan = { ...data.plan, conduct, temper };
    const pv = forgePreview(plan, data.consumed, { barrier: pcfg.barrier });
    if (!pv.ok) throw new PactoError(409, pv.reason);
    // custo limitado: 1 material básico igual a um do corpo (o primeiro que a pessoa tiver)
    const bag = await bagOf(db, cid);
    const cost = data.consumed.filter((k) => !k.key.startsWith('cmp:')).find((k) => bag.some((b) => b.key === k.key));
    if (!cost) throw new PactoError(409, 'Reforjar pede 1 material igual a um do corpo da peça (você não tem nenhum).');
    const next = { ...data, plan, stats: pv.stats, weight: pv.weight, mark: pv.mark, history: [...(data.history ?? []), { at: new Date().toISOString(), what: `reforjado por ${me} (${conduct}, ${temper})` }] };
    const r = await rpc<{ ok: boolean; reason?: string }>(db, 'pacto_equipment_update', { p_cid: cid, p_item: item, p_data: next, p_take: [{ key: cost.key, qty: 1 }] });
    if (!r.ok) throw new PactoError(409, reason(r.reason));
    return { reforged: true, pacto: await state() };
  }

  if (action === 'pacto.board.post') {
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, 200) : '';
    const kind = body.kind === 'servico' ? 'servico' : 'oportunidade';
    if (!text) throw new PactoError(400, 'Escreva o anúncio.');
    const node = typeof body.node === 'string' && nodeById(body.node) ? body.node : null;
    const { count } = await db.from('pacto_board').select('id', { count: 'exact', head: true }).eq('companion_id', cid).gt('expires_at', new Date().toISOString());
    if ((count ?? 0) >= 5) throw new PactoError(429, 'Você já tem 5 anúncios ativos.');
    await db.from('pacto_board').insert({ id: crypto.randomUUID(), companion_id: cid, kind, text, node_id: node, expires_at: new Date(Date.now() + 72 * 3_600_000).toISOString() });
    return { pacto: await state() };
  }

  throw new PactoError(404, 'Ação desconhecida.');
}

export { resolvePacto };
