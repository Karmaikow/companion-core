/**
 * Ecos da Terra no modo offline (sem servidor): as MESMAS regras, simuladas neste aparelho. Tudo aqui é marcado como
 * simulado: não vale na economia online e nunca é enviado ao servidor (a identidade portátil do Companion não cria
 * itens negociáveis localmente). Serve para jogar sem conta e para testar a interface.
 */
import {
  NODE_KINDS, NASCENTE, nodeById, approachOf, rollGather, parseBatchKey, abundanceNow, DEFAULT_ECOS, SEIVA_AZUL, CHAINS, stepSatisfied,
  chainReward, JARDIM, siteStoredNow, recipeById, checkCraft, PONTE, needFits, scaledNeed, acceptContribution, stageComplete, STARTER_TOOLS,
  type MaterialBatch, type ToolKey,
} from '@rules';
import type { ChainView, EcosReply, EcosView } from './types';

const KEY = 'companion-core:ecos-local:v1';
interface Save {
  tools: ToolKey[]; seen: string[]; known: string[]; techniques: string[]; chain: Record<string, ChainView>;
  bag: Record<string, number>; nodes: Record<string, { amount: number; at: number }>;
  actions: Record<string, { node?: string; approach?: string; startedAt: number; status: 'running' | 'done' | 'rejected'; result?: Record<string, unknown> }>;
  site: { stored: number; at: number; caredAt: number | null; createdAt: string } | null;
  project: { stage: number; progress: number[]; startedAt: number; completedAt: string | null; mine: number[] };
}
/** Ganchos do Pacto das Cinco (preenchidos por localPacto): ferramentas forjadas, desgaste, bloqueio superior e Lumes. */
export const localHooks = {
  tools: (): ToolKey[] => [],
  wear: (_tool: string) => {},
  superior: (_node: string): string | null => null,
  reward: (_key: string, _amount: 'descoberta' | 'obra') => {},
};
const fresh = (): Save => ({ tools: [...STARTER_TOOLS], seen: [], known: [], techniques: [], chain: {}, bag: {}, nodes: {}, actions: {}, site: null, project: { stage: 0, progress: [0], startedAt: Date.now(), completedAt: null, mine: [] } });
let mem: Save | null = null;
function load(): Save { if (mem) return mem; try { mem = { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) ?? 'null') }; } catch { mem = fresh(); } return mem!; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* só na memória */ } }

class Fail extends Error {}
const cfg = DEFAULT_ECOS;
const used = (s: Save) => Object.values(s.bag).reduce((a, b) => a + b, 0);
const add = (s: Save, items: { key: string; qty: number }[], sign: 1 | -1) => { for (const it of items) { s.bag[it.key] = (s.bag[it.key] ?? 0) + sign * it.qty; if (s.bag[it.key] <= 0) delete s.bag[it.key]; } };
const bagList = (s: Save): MaterialBatch[] => Object.entries(s.bag).map(([key, qty]) => { const p = parseBatchKey(key); return p ? { key, qty, ...p } : null; }).filter((x): x is MaterialBatch => !!x);

function view(s: Save): EcosView {
  const now = Date.now(), st = PONTE.stages[s.project.stage];
  const goals = st ? st.needs.map((n) => scaledNeed(n, cfg.projectScale)) : [];
  return {
    serverNow: now, simulated: true,
    profile: { tools: localHooks.tools(), seen: s.seen, knownMaterials: s.known, techniques: s.techniques, chain: s.chain },
    bag: Object.entries(s.bag).map(([key, qty]) => ({ key, qty })),
    nodes: s.nodes,
    sites: s.site ? [{ id: JARDIM.id, stored: s.site.stored, at: s.site.at, caredAt: s.site.caredAt, createdAt: s.site.createdAt, now: siteStoredNow(JARDIM, s.site, now) }] : [],
    project: { id: PONTE.id, stage: s.project.stage, progress: s.project.progress, startedAt: s.project.startedAt, completedAt: s.project.completedAt, goals, mine: s.project.mine[s.project.stage] ?? 0, mineTotal: s.project.mine.reduce((a, b) => a + (b ?? 0), 0), capTotal: Math.ceil(goals.reduce((a, b) => a + b, 0) * cfg.capShare) },
    config: cfg,
  };
}

function advance(s: Save, act: { node?: string; approach?: string; inspect?: boolean; x?: number; z?: number }) {
  const st = s.chain[SEIVA_AZUL.id] ?? null;
  if (!stepSatisfied(SEIVA_AZUL, st, act)) return null;
  const from = st?.step ?? 0, step = SEIVA_AZUL.steps[from];
  s.chain[SEIVA_AZUL.id] = { ...(st ?? {}), step: from + 1, at: new Date().toISOString() };
  return { chain: SEIVA_AZUL.id, step: from + 1, title: step.title, evidence: step.evidence, knowledge: step.knowledge ?? null };
}

export async function localEcos(action: string, b: Record<string, unknown> = {}): Promise<EcosReply> {
  const s = load();
  const now = Date.now();
  try {
    switch (action) {
      case 'ecos.state': return { ecos: view(s) };
      case 'ecos.start': {
        const node = nodeById(String(b.node)), ap = node && approachOf(node, String(b.approach));
        if (!node || !ap) throw new Fail('Recurso inexistente.');
        if (node.needs === 'ponte' && s.project.stage < 2) throw new Fail('Do outro lado do riacho — precisa da ponte.');
        if (Math.hypot(Number(b.x) - node.x, Number(b.z) - node.z) > cfg.reach) throw new Fail('Longe demais: chegue mais perto do recurso.');
        const block = localHooks.superior(node.id); if (block) throw new Fail(block);
        if (ap.tool && !localHooks.tools().includes(ap.tool)) throw new Fail(`Precisa de uma ferramenta (${ap.tool}) — só Taurinas forjam ferramentas: peça uma no quadro de encomendas.`);
        const req = String(b.request);
        s.actions[req] ??= { node: node.id, approach: ap.id, startedAt: now, status: 'running' };
        save();
        return { started: { request: req, startedAt: s.actions[req].startedAt, status: s.actions[req].status, result: s.actions[req].result ?? null, seconds: ap.seconds * cfg.timeSlack } };
      }
      case 'ecos.finish': {
        const req = String(b.request), a = s.actions[req];
        const node = nodeById(String(b.node)), ap = node && approachOf(node, String(b.approach));
        if (!a || !node || !ap) return { gather: { ok: false, reason: 'nao-iniciada', message: 'Essa coleta não foi começada. Tente de novo.', wait: null, items: [], repeat: false }, ecos: view(s) };
        if (a.status !== 'running') return { gather: { ...(a.result as EcosReply['gather'])!, repeat: true }, ecos: view(s) };
        if ((now - a.startedAt) / 1000 < ap.seconds * cfg.timeSlack) return { gather: { ok: false, reason: 'cedo', message: 'Ainda está coletando…', wait: ap.seconds * cfg.timeSlack - (now - a.startedAt) / 1000, items: [], repeat: false } };
        const k = NODE_KINDS[node.kind], cur = abundanceNow(node, s.nodes[node.id], now);
        const items = rollGather(node, ap, req).map((x) => ({ key: x.key, qty: x.qty }));
        let res: NonNullable<EcosReply['gather']>;
        if (cur < ap.cost) res = { ok: false, reason: 'esgotado', message: 'Esse recurso está esgotado por enquanto — ele volta sozinho.', wait: null, items: [], repeat: false };
        else if (used(s) + items.reduce((x, y) => x + y.qty, 0) > cfg.bag) res = { ok: false, reason: 'mochila-cheia', message: 'A mochila está cheia: nada foi coletado (nem gasto). Libere espaço.', wait: null, items: [], repeat: false };
        else {
          s.nodes[node.id] = { amount: Math.min(k.capacity, cur) - ap.cost, at: now };
          add(s, items, 1);
          if (!s.seen.includes(node.id)) s.seen.push(node.id);
          for (const it of items) { const m = it.key.split('|')[0]; if (!s.known.includes(m)) s.known.push(m); }
          res = { ok: true, reason: null, message: null, wait: null, items, repeat: false };
        }
        if (res.ok && ap.tool) localHooks.wear(ap.tool);
        a.status = res.ok ? 'done' : 'rejected'; a.result = res as unknown as Record<string, unknown>;
        const clue = res.ok ? advance(s, { node: node.id, approach: ap.id }) : null;
        save();
        return { gather: res, clue, ecos: view(s) };
      }
      case 'ecos.inspect': {
        const node = nodeById(String(b.node)); if (!node) throw new Fail('Recurso inexistente.');
        if (!s.seen.includes(node.id)) s.seen.push(node.id);
        const clue = advance(s, { node: node.id, inspect: true }); save();
        return { clue, ecos: view(s) };
      }
      case 'ecos.reach': {
        const clue = advance(s, { x: Number(b.x), z: Number(b.z) }); if (clue) save();
        return { clue, ecos: clue ? view(s) : undefined };
      }
      case 'ecos.choose': {
        const req = String(b.request);
        if (s.actions[req]) return { ...(s.actions[req].result as EcosReply), ecos: view(s) };
        const chain = CHAINS[String(b.chain)], st = chain && s.chain[chain.id];
        const choice = b.choice === 'preservar' ? 'preservar' : 'extrair';
        if (!chain || !st || st.step < chain.steps.length) throw new Fail('Ainda faltam etapas da descoberta.');
        if (st.completedAt) throw new Fail('Essa descoberta já foi concluída.');
        if (Math.hypot(Number(b.x) - NASCENTE.x, Number(b.z) - NASCENTE.z) > 8) throw new Fail('Volte até a nascente para decidir.');
        const give = chainReward(choice).map((x) => ({ key: x.key, qty: x.qty }));
        if (used(s) + give.reduce((x, y) => x + y.qty, 0) > cfg.bag) throw new Fail('A mochila está cheia: libere espaço antes de decidir.');
        add(s, give, 1);
        s.chain[chain.id] = { ...st, choice, completedAt: new Date().toISOString() };
        localHooks.reward('disc:' + chain.id, 'descoberta');
        if (!s.techniques.includes('leitura-de-inclusoes')) s.techniques.push('leitura-de-inclusoes');
        if (choice === 'preservar') s.site = { stored: 0, at: now, caredAt: null, createdAt: new Date().toISOString() };
        const out: EcosReply = { chosen: { choice, gave: give, site: choice === 'preservar' ? JARDIM.id : null }, bond: null };
        s.actions[req] = { startedAt: now, status: 'done', result: out as unknown as Record<string, unknown> };
        save();
        return { ...out, ecos: view(s) };
      }
      case 'ecos.craft': {
        const req = String(b.request);
        if (s.actions[req]) return { ...(s.actions[req].result as EcosReply), ecos: view(s) };
        const r = recipeById(String(b.recipe)); if (!r) throw new Fail('Receita inexistente.');
        const picks = (Array.isArray(b.picks) ? b.picks : []) as { slot: number; key: string; qty: number }[];
        const chk = checkCraft(r, picks, bagList(s));
        if (!chk.ok) throw new Fail(chk.reason);
        add(s, chk.consume, -1);
        if (r.output.kind === 'tool' && !s.tools.includes(r.output.key as ToolKey)) s.tools.push(r.output.key as ToolKey);
        const out: EcosReply = { crafted: { recipe: r.id, label: r.output.label, quality: chk.quality, kind: r.output.kind } };
        s.actions[req] = { startedAt: now, status: 'done', result: out as unknown as Record<string, unknown> };
        save();
        return { ...out, ecos: view(s) };
      }
      case 'ecos.drop': {
        const key = String(b.key), q = Math.min(s.bag[key] ?? 0, Math.max(1, Number(b.qty) || 1));
        if (!q) throw new Fail('Faltam materiais na mochila.');
        add(s, [{ key, qty: q }], -1); save();
        return { dropped: { key, qty: q }, ecos: view(s) };
      }
      case 'ecos.site.care': {
        if (!s.site) throw new Fail('Você ainda não tem esse jardim.');
        if (s.site.caredAt && now - s.site.caredAt < 20 * 3_600_000) throw new Fail('O jardim já foi cuidado hoje.');
        s.site = { ...s.site, stored: siteStoredNow(JARDIM, s.site, now), at: now, caredAt: now }; save();
        return { cared: true, ecos: view(s) };
      }
      case 'ecos.site.harvest': {
        if (!s.site) throw new Fail('Você ainda não tem esse jardim.');
        const cur = siteStoredNow(JARDIM, s.site, now), take = Math.min(Math.floor(cur), JARDIM.harvestMax, cfg.bag - used(s));
        if (Math.floor(cur) < 1) throw new Fail('Nada pronto para colher ainda.');
        if (take < 1) throw new Fail('A mochila está cheia: libere espaço.');
        s.site = { ...s.site, stored: cur - take, at: now, caredAt: s.site.caredAt && now < s.site.caredAt + JARDIM.careHours * 3_600_000 ? s.site.caredAt : null };
        add(s, [{ key: JARDIM.produces.key, qty: take }], 1); save();
        return { harvested: [{ key: JARDIM.produces.key, qty: take }], ecos: view(s) };
      }
      case 'ecos.contribute': {
        const req = String(b.request);
        if (s.actions[req]) return { ...(s.actions[req].result as EcosReply), ecos: view(s) };
        const stage = Number(b.stage), need = Number(b.need), key = String(b.key), p = parseBatchKey(key);
        if (s.project.completedAt) throw new Fail('A obra já está pronta!');
        if (stage !== s.project.stage) throw new Fail('A etapa da obra acabou de mudar — veja o que falta agora.');
        if (!p || !needFits(PONTE, stage, need, p)) throw new Fail('Esse material não serve para essa parte da obra.');
        const have = s.bag[key] ?? 0;
        const acc = Math.min(have, acceptContribution(PONTE, s.project, need, Number(b.qty) || 0, s.project.mine[stage] ?? 0, { scale: cfg.projectScale, capShare: cfg.capShare, capHours: cfg.capHours }, now));
        if (acc < 1) throw new Fail(have < 1 ? 'Faltam materiais na mochila.' : 'Você já entregou sua parte desta etapa (a cota abre depois de um tempo).');
        add(s, [{ key, qty: acc }], -1);
        s.project.progress[need] = (s.project.progress[need] ?? 0) + acc;
        s.project.mine[stage] = (s.project.mine[stage] ?? 0) + acc;
        let done = false;
        if (stageComplete(PONTE, s.project, cfg.projectScale)) {
          done = true;
          localHooks.reward(`obra:${stage}`, 'obra');
          if (stage + 1 >= PONTE.stages.length) { s.project.completedAt = new Date().toISOString(); s.project.stage = stage + 1; }
          else s.project = { ...s.project, stage: stage + 1, progress: PONTE.stages[stage + 1].needs.map(() => 0), startedAt: now };
        }
        const out: EcosReply = { contributed: { accepted: acc, stageDone: done, requested: Number(b.qty) || 0 } };
        s.actions[req] = { startedAt: now, status: 'done', result: out as unknown as Record<string, unknown> };
        save();
        return { ...out, ecos: view(s) };
      }
    }
    throw new Fail('Ação desconhecida.');
  } catch (e) {
    if (e instanceof Fail) throw new Error(e.message);
    throw e;
  }
}

/** Mochila local para o Pacto offline (mesma mochila do Ecos). */
export const localBag = {
  list: () => Object.entries(load().bag).map(([key, qty]) => ({ key, qty })),
  has: (take: { key: string; qty: number }[]) => { const s = load(); const need = new Map<string, number>(); for (const t of take) need.set(t.key, (need.get(t.key) ?? 0) + t.qty); return [...need].every(([k, q]) => (s.bag[k] ?? 0) >= q); },
  /** tira e põe atomicamente; recusa sem mudar nada se faltar material ou estourar a mochila */
  apply(take: { key: string; qty: number }[], give: { key: string; qty: number }[]): 'ok' | 'faltam-materiais' | 'mochila-cheia' {
    const s = load();
    if (!localBag.has(take)) return 'faltam-materiais';
    const after = used(s) - take.reduce((a, b) => a + b.qty, 0) + give.reduce((a, b) => a + b.qty, 0);
    if (give.length && after > cfg.bag) return 'mochila-cheia';
    add(s, take, -1); add(s, give, 1); save();
    return 'ok';
  },
};
