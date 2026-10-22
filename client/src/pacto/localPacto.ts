/**
 * Pacto das Cinco offline (sem servidor): as MESMAS regras, simuladas neste aparelho. Ofícios, forja, reparo, reforja e
 * reciclagem funcionam; encomendas entre pessoas precisam do modo online. Nada daqui vale na economia online.
 */
import {
  SPECIES, OFFICES, canCompleteEquipment, transformationById, checkTransformation, blueprintById, forgePreview, DEFAULT_PACTO, coreCost,
  recycleReturn, REPAIR_KIT_AMOUNT, superiorBlockFor, lineageOf, officesOf, LINEAGE_LIMITS, ELEMENTS, type ForgePlan, type SpeciesKey, type Element, type ToolKey, type Conduct, type Temper,
} from '@rules';
import { useGame } from '../store';
import { localBag, localHooks } from '../ecos/localEcos';
import type { EquipmentView, JobView, PactoReply, PactoView } from './types';

const KEY = 'companion-core:pacto-local:v1';
const KIT = 'item:kit-de-reparo';
interface Save { lumes: number; testClass: SpeciesKey | null; lineage?: { forms: string[]; essences: string[] }; equipment: EquipmentView[]; jobs: (JobView & { plan: Record<string, unknown>; take: { key: string; qty: number }[]; fee: number; done?: Record<string, unknown> })[]; rewards: string[] }
const fresh = (): Save => ({ lumes: DEFAULT_PACTO.starterLumes, testClass: null, equipment: [], jobs: [], rewards: [] });
let mem: Save | null = null;
function load(): Save { if (mem) return mem; try { mem = { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) ?? 'null') }; } catch { mem = fresh(); } return mem!; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* só na memória */ } }
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)));

function me() {
  const c = useGame.getState().snap?.companion;
  return { id: c?.id ?? 'local', name: c?.discoveries.name ?? 'Companion', real: (c?.identityContract?.species?.family ?? c?.discoveries.form ?? null) as SpeciesKey | null, essence: (c?.discoveries.element ?? null) as Element | null };
}
const effective = () => load().testClass ?? me().real;
const lineage = () => { const m = me(); return lineageOf(m.real, m.essence, load().lineage ?? null); };
const forms = (): SpeciesKey[] => (load().testClass ? [load().testClass!] : lineage().forms);

// ganchos do Ecos offline: ferramentas forjadas, desgaste, bloqueio superior e Lumes por descoberta/obra
localHooks.tools = () => [...new Set(load().equipment.filter((e) => e.kind === 'ferramenta' && e.durability > 0 && e.tool).map((e) => e.tool as ToolKey))];
localHooks.wear = (tool) => { const s = load(); const e = s.equipment.filter((x) => x.tool === tool && x.durability > 0).sort((a, b) => a.durability - b.durability)[0]; if (e) { e.durability -= 1; save(); } };
localHooks.superior = (node) => superiorBlockFor(node, forms());
localHooks.reward = (key, kind) => { const s = load(); if (s.rewards.includes(key)) return; s.rewards.push(key); s.lumes += kind === 'descoberta' ? DEFAULT_PACTO.discoveryLumes : DEFAULT_PACTO.projectStageLumes; save(); };

function view(s: Save): PactoView {
  const m = me();
  return {
    serverNow: Date.now(), me: m.id, lumes: s.lumes, simulated: true,
    cls: { real: m.real, effective: effective(), test: s.testClass, essence: m.essence, admin: true, forms: forms(), essences: lineage().essences, lineage: lineage() },
    equipment: s.equipment, jobs: s.jobs.filter((j) => !j.done).map(({ request, kind, ref, order, startedAt, seconds }) => ({ request, kind, ref, order, startedAt, seconds })),
    orders: { open: [], mine: [] }, board: [], names: { [m.id]: { name: m.name, cls: m.real } }, config: DEFAULT_PACTO,
  };
}

class Fail extends Error {}

export async function localPacto(action: string, b: Record<string, unknown> = {}): Promise<PactoReply> {
  const s = load();
  const m = me(), cls = forms(), essAll = lineage().essences;
  try {
    switch (action) {
      case 'pacto.state': return { pacto: view(s) };
      case 'pacto.testClass': s.testClass = typeof b.cls === 'string' && b.cls in SPECIES ? b.cls as SpeciesKey : null; save(); return { pacto: view(s) };
      case 'pacto.lineage.set': {
        const kind = b.kind === 'form' ? 'forms' : 'essences', v = String(b.value);
        if (kind === 'forms' ? !(v in SPECIES) : !(v in ELEMENTS)) throw new Fail('Valor inválido.');
        const l = (s.lineage ??= { forms: [], essences: [] });
        if (b.on === false) l[kind] = l[kind].filter((x) => x !== v);
        else if (!l[kind].includes(v)) { if (l[kind].length >= (kind === 'forms' ? LINEAGE_LIMITS.forms : LINEAGE_LIMITS.essences) - 1) throw new Fail('Já tem o máximo.'); l[kind].push(v); }
        save(); return { pacto: view(s) };
      }
      case 'pacto.office.start': {
        const req = String(b.request); if (s.jobs.some((j) => j.request === req)) return { pacto: view(s) };
        const t = transformationById(String(b.transformation)); if (!t) throw new Fail('Transformação inexistente.');
        if (!officesOf(cls).some((o) => o.key === t.office)) throw new Fail('Esse ofício é de outra classe.');
        const ess = (typeof b.essence === 'string' && essAll.includes(b.essence as Element) ? b.essence : essAll[0] ?? null) as Element | null;
        const chk = checkTransformation(t, (b.picks ?? []) as never, localBag.list(), String(b.choice), ess, b.useEssence === true, m.id);
        if (!chk.ok) throw new Fail(chk.reason);
        const r = localBag.apply(chk.consume, []); if (r !== 'ok') throw new Fail('Faltam materiais na mochila.');
        s.jobs.push({ request: req, kind: 'oficio', ref: t.id, order: null, startedAt: Date.now(), seconds: t.seconds, plan: { output: chk.output }, take: chk.consume, fee: 0 });
        save(); return { started: { request: req, seconds: t.seconds }, pacto: view(s) };
      }
      case 'pacto.forge.start': {
        const req = String(b.request); if (s.jobs.some((j) => j.request === req)) return { pacto: view(s) };
        if (!canCompleteEquipment(cls)) throw new Fail('Só Taurinas forjam e concluem equipamentos.');
        const plan = b.plan as ForgePlan, bp = blueprintById(String(plan?.blueprint)); if (!bp) throw new Fail('Projeto inexistente.');
        if (s.jobs.filter((j) => j.kind === 'forja' && !j.done).length >= DEFAULT_PACTO.perArtisan) throw new Fail('Você já está no limite de trabalhos ao mesmo tempo.');
        const pv = forgePreview(plan, localBag.list()); if (!pv.ok) throw new Fail(pv.reason + (pv.missing ? ': ' + pv.missing.join(', ') : ''));
        const fee = coreCost(essAll, DEFAULT_PACTO).total; if (s.lumes < fee) throw new Fail('Lumes insuficientes.');
        const r = localBag.apply(pv.consume, []); if (r !== 'ok') throw new Fail('Faltam materiais na mochila.');
        s.lumes -= fee;
        s.jobs.push({ request: req, kind: 'forja', ref: bp.id, order: null, startedAt: Date.now(), seconds: bp.seconds, plan: plan as never, take: pv.consume, fee });
        save(); return { started: { request: req, seconds: bp.seconds, fee }, pacto: view(s) };
      }
      case 'pacto.job.finish': {
        const j = s.jobs.find((x) => x.request === String(b.request)); if (!j) throw new Fail('Esse trabalho não existe.');
        if (j.done) return { job: { ...(j.done as object), ok: true, repeat: true }, pacto: view(s) };
        const wait = j.seconds - (Date.now() - j.startedAt) / 1000; if (wait > 0) return { job: { ok: false, wait } };
        let give: { key: string; qty: number }[] = [], eq: EquipmentView | null = null, label = '';
        if (j.kind === 'oficio') { give = [(j.plan as { output: { key: string; qty: number } }).output]; label = transformationById(j.ref)?.name ?? 'Componente'; }
        else {
          const plan = j.plan as unknown as ForgePlan, bp = blueprintById(plan.blueprint)!, pv = forgePreview(plan, j.take);
          if (!pv.ok) throw new Fail('Plano inválido.');
          label = plan.name || bp.name;
          if (bp.kind === 'consumivel') give = [{ key: KIT, qty: 1 }];
          else eq = { id: uuid(), blueprint: bp.id, kind: bp.kind as 'equipamento' | 'ferramenta', tool: bp.tool ?? null, durability: pv.durability, maxDurability: pv.durability, createdAt: new Date().toISOString(),
            name: label, itemType: bp.itemType ?? null, stats: pv.stats, weight: pv.weight, affinity: pv.affinity, mark: pv.mark, rarity: pv.rarity, layers: pv.layers, consumed: pv.consume, plan,
            signature: { artisan: m.id, artisanName: m.name, at: new Date().toISOString(), contributors: pv.contributors.map((c) => ({ ...c, name: m.name })) }, history: [{ at: new Date().toISOString(), what: `forjado por ${m.name}` }] };
        }
        if (give.length && localBag.apply([], give) !== 'ok') throw new Fail('A mochila está cheia: nada foi entregue (nem perdido). Libere espaço.');
        if (eq) s.equipment.unshift(eq);
        j.done = { kind: j.kind, label, equipment: eq?.id ?? null };
        save(); return { job: { ok: true, kind: j.kind, label, equipment: eq?.id ?? null }, pacto: view(s) };
      }
      case 'pacto.job.cancel': {
        const j = s.jobs.find((x) => x.request === String(b.request) && !x.done); if (!j) throw new Fail('Esse trabalho não existe.');
        localBag.apply([], j.take); s.lumes += j.fee; j.done = { cancelled: true }; save();
        return { pacto: view(s) };
      }
      case 'pacto.item.repair': {
        const e = s.equipment.find((x) => x.id === b.item); if (!e) throw new Fail('Peça inválida.');
        if (e.durability >= e.maxDurability) throw new Fail('A peça já está inteira.');
        if (localBag.apply([{ key: KIT, qty: 1 }], []) !== 'ok') throw new Fail('Você não tem um Kit de Reparo.');
        e.durability = Math.min(e.maxDurability, e.durability + REPAIR_KIT_AMOUNT); save();
        return { repaired: e.durability, pacto: view(s) };
      }
      case 'pacto.item.recycle': {
        const e = s.equipment.find((x) => x.id === b.item); if (!e) throw new Fail('Peça inválida.');
        const eq = useGame.getState().equipped; if (Object.values(eq).some((v) => v === 'inst-' + e.id.replace(/-/g, '').slice(0, 12))) throw new Fail('Desequipe a peça antes de reciclar.');
        const give = recycleReturn(e.consumed ?? []);
        if (localBag.apply([], give) !== 'ok') throw new Fail('A mochila está cheia.');
        s.equipment = s.equipment.filter((x) => x !== e); save();
        return { recycled: give, pacto: view(s) };
      }
      case 'pacto.item.reforge': {
        if (!canCompleteEquipment(cls)) throw new Fail('Reforja estrutural é da Taurina.');
        const e = s.equipment.find((x) => x.id === b.item); if (!e?.plan || !e.consumed) throw new Fail('Peça inválida.');
        const conduct: Conduct = b.conduct === 'leveza' ? 'leveza' : 'resistencia', temper: Temper = b.temper === 'reativa' ? 'reativa' : 'estavel';
        const plan = { ...e.plan, conduct, temper }, pv = forgePreview(plan, e.consumed); if (!pv.ok) throw new Fail(pv.reason);
        const bag = localBag.list(), cost = e.consumed.filter((k) => !k.key.startsWith('cmp:')).find((k) => bag.some((x) => x.key === k.key));
        if (!cost) throw new Fail('Reforjar pede 1 material igual a um do corpo da peça (você não tem nenhum).');
        localBag.apply([{ key: cost.key, qty: 1 }], []);
        Object.assign(e, { plan, stats: pv.stats, weight: pv.weight, mark: pv.mark, history: [...(e.history ?? []), { at: new Date().toISOString(), what: `reforjado por ${m.name} (${conduct}, ${temper})` }] });
        save(); return { reforged: true, pacto: view(s) };
      }
      case 'pacto.order.create': case 'pacto.order.accept': case 'pacto.order.deliver': case 'pacto.order.cancel': case 'pacto.board.post':
        throw new Fail('Encomendas e o quadro do Pacto são entre pessoas: precisam do modo online.');
    }
    throw new Fail('Ação desconhecida.');
  } catch (e) {
    if (e instanceof Fail) throw new Error(e.message);
    throw e;
  }
}
