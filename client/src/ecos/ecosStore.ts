/**
 * Ecos da Terra no cliente: estado da expedição, coleta (andar até o recurso → começar → esperar → confirmar), cadeia
 * de descoberta, mochila e a Companion coletando por intenção. O cliente só ANTECIPA (anda, anima, mostra a barra):
 * os materiais entram na mochila quando o servidor confirma. Reconexão: o mesmo request_id é reenviado e o servidor
 * devolve o resultado guardado (nada duplica).
 */
import { create } from 'zustand';
import * as THREE from 'three';
import {
  MATERIALS, NODE_KINDS, approachOf, nodeName, parseBatchKey, abundanceNow, atLeast, suggestGather, SEIVA_AZUL, PERCEPTION_R,
  CATEGORIES, BAND_LABEL, PROP_LABEL, superiorBlockFor, type SpeciesKey,
  type GatheringIntent, type ResourceNode, type MaterialBatch, type Suggestion, type GatherKind, type ResCategory, type PropKey, type Band,
  pulseTimes, gradeOf, COMPANION_TUNE, TUNE_PULSES, type TuneGrade, type TuneResult,
} from '@rules';
import { useGame } from '../store';
import { companionFocus, moveRequest } from '../scene/world';
import type { EcosReply, EcosView } from './types';
import { playMaterialSound } from './sounds';
import { findNode, availableNear, isAvailable } from './worldNodes';

export type RunPhase = 'andando' | 'coletando' | 'confirmando' | 'concluido' | 'interrompido' | 'erro';
export interface Run { node: string; approach: string; request: string; phase: RunPhase; seconds: number; started: number; by: 'pessoa' | 'companion'; message?: string; inspect?: boolean;
  /** afinar o eco: quanto antes (−) ou depois (+) de cada pulso foi o toque, em ms; a nota que o servidor devolveu */
  tune?: (number | null)[]; result?: TuneResult }
export interface Objective { label: string; qty: number; match: { category?: ResCategory; materials?: string[]; prop?: PropKey; min?: Band }; source: 'receita' | 'obra' | 'intencao' }
export interface Recent { key: string; qty: number; at: number }
export interface JournalEntry { at: number; text: string; kind: 'clue' | 'gather' | 'craft' | 'obra' | 'jardim' | 'info' }

/** Onde o Companion está trabalhando (o modelo 3D olha para lá e faz a animação de coleta). */
export const work = { on: false, at: new THREE.Vector3(), kind: '' };

interface EcosStore {
  view: EcosView | null;
  conn: 'ok' | 'perdida';
  error: string | null;
  selected: string | null;
  run: Run | null;
  recent: Recent[];
  journal: JournalEntry[];
  objective: Objective | null;
  intent: GatheringIntent | null;
  auto: { on: boolean; got: number; actions: number; last: string | null } ;
  choiceOpen: boolean;
  /** no Companion World (onde os recursos nascem) */
  inWorld: boolean;
  /** afinação automática (sem o desafio de ritmo): conta como três "bom" */
  autoTune: boolean;
  setAutoTune(v: boolean): void;
  /** toque no eco (clique, toque ou Espaço) durante a coleta */
  tap(): TuneGrade | null;
  refresh(): Promise<void>;
  select(id: string | null): void;
  gather(node: string, approach: string, by?: 'pessoa' | 'companion'): void;
  inspect(node: string): void;
  cancel(why?: string): void;
  tick(): void;
  choose(choice: 'extrair' | 'preservar'): Promise<void>;
  call(action: string, body?: Record<string, unknown>): Promise<EcosReply | null>;
  setObjective(o: Objective | null): void;
  startIntent(i: GatheringIntent): void;
  stopIntent(why?: string): void;
  setInWorld(v: boolean): void;
}

const NET_ERR = /não respondeu|failed to fetch|network|conex/i;
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)));
let nextAttempt = 0, lastSuggest = '', myMove = -1, walkCheck = { at: 0, d: Infinity, tries: 0 };

export const bagBatches = (v: EcosView | null): MaterialBatch[] => (v?.bag ?? []).map((b) => { const p = parseBatchKey(b.key); return p && b.qty > 0 ? { key: b.key, qty: b.qty, ...p } : null; }).filter((x): x is MaterialBatch => !!x);
export const bagUsedOf = (v: EcosView | null) => (v?.bag ?? []).reduce((a, b) => a + Math.max(0, b.qty), 0);
export const matchesObjective = (o: Objective['match'], b: { material: string; bands: Partial<Record<PropKey, Band>> }) => {
  const m = MATERIALS[b.material];
  if (!m) return false;
  if (o.materials && !o.materials.includes(b.material)) return false;
  if (o.category && m.category !== o.category) return false;
  return !o.prop || !o.min || atLeast(b.bands[o.prop], o.min);
};
export const batchLabel = (key: string) => {
  const p = parseBatchKey(key); if (!p) return key;
  const m = MATERIALS[p.material];
  const props = Object.entries(p.bands).map(([k, v]) => `${PROP_LABEL[k as PropKey].toLowerCase()} ${BAND_LABEL[v as Band]}`).join(', ');
  return `${CATEGORIES[m.category].icon} ${m.name}${props ? ` (${props})` : ''}`;
};

/** O que a Companion enxerga agora: os recursos à vista por perto (nunca o que está escondido pelo horário ou clima). */
export function knownNow(v: EcosView | null) {
  const me = { x: companionFocus.x, z: companionFocus.z };
  return availableNear(me.x, me.z, PERCEPTION_R).map((node) => ({ node, st: v?.nodes[node.id] ?? null, dist: Math.hypot(node.x - me.x, node.z - me.z) }));
}
/** Classe efetiva (do Pacto) para saber quais fontes superiores o Companion pode extrair. */
export const classSource = { get: (): SpeciesKey | SpeciesKey[] | null => null };
export function suggestionsNow(v: EcosView | null, intent: GatheringIntent): Suggestion[] {
  const cls = classSource.get();
  return suggestGather(intent, {
    known: knownNow(v).filter(({ node }) => node.kind !== 'salgueiro' || amountOf(v, node) >= 6), bagFree: (v?.config.bag ?? 60) - bagUsedOf(v), tools: v?.profile.tools ?? [], knownMaterials: v?.profile.knownMaterials ?? [],
    clueNode: null, now: Date.now(),
  }).map((s) => { const b = superiorBlockFor(s.node.id, cls); return b && !s.blocked ? { ...s, blocked: b } : s; });
}

/** Ordem do chat ("colher 40 folhas") → intenção de coleta. */
export function intentFromCommand(what: GatherKind, count: number): GatheringIntent {
  const T: Record<GatherKind, GatheringIntent['target']> = {
    madeira: { category: 'madeira', qty: count, label: 'Madeira' },
    pedra: { category: 'pedra', qty: count, label: 'Pedra' },
    planta: { category: 'planta', qty: count, label: 'Plantas medicinais' },
    folha: { category: 'planta', material: 'erva-orvalho-folha', qty: count, label: 'Folhas de erva' },
    flor: { category: 'planta', material: 'erva-orvalho-flor', qty: count, label: 'Flores de erva' },
    raiz: { category: 'planta', material: 'erva-orvalho-raiz', qty: count, label: 'Raízes de erva' },
    cogumelo: { category: 'planta', qty: count, label: 'Plantas (cogumelos ainda não existem aqui)' },
    cobre: { category: 'minerio', material: 'minerio-cobre', qty: count, label: 'Cobre' },
    seiva: { category: 'magico', material: 'seiva-azul', qty: count, label: 'Seiva Azul' },
    gema: { category: 'gema', qty: count, label: 'Gemas' },
  };
  return { mode: 'abastecer', target: T[what], risk: 1, reserve: 4, tools: [], prefer: null, gentle: false };
}

const say = (text: string) => useGame.getState().sayBark(text);
const toast = (text: string, tone: 'soft' | 'gold' | 'warn' = 'soft') => useGame.getState().toast(text, tone);

export const useEcos = create<EcosStore>((set, get) => ({
  view: null, conn: 'ok', error: null, selected: null, run: null, recent: [], journal: [], objective: null, intent: null,
  auto: { on: false, got: 0, actions: 0, last: null }, choiceOpen: false, inWorld: false,
  autoTune: (() => { try { return localStorage.getItem('ecos.autoTune') === '1'; } catch { return false; } })(),

  async call(action, body = {}) {
    const b = useGame.getState().backend;
    if (!b?.ecos) { set({ error: 'Expedições não disponíveis neste modo.' }); return null; }
    try {
      const r = await b.ecos(action, body);
      set({ conn: 'ok', error: null, ...(r.ecos ? { view: r.ecos } : {}) });
      if (r.clue) {
        const c = r.clue;
        set({ journal: [{ at: Date.now(), text: `${c.title}: ${c.evidence.text}`, kind: 'clue' as const }, ...get().journal].slice(0, 60) });
        toast(`Descoberta: ${c.title}`, 'gold');
        say(c.evidence.status === 'descoberta' ? 'Olha só… uma nascente de verdade!' : c.evidence.text);
        if (c.step >= SEIVA_AZUL.steps.length) set({ choiceOpen: true });
      }
      if (r.bond?.levelUp) toast(`Vínculo nível ${r.bond.levelUp}`, 'gold');
      return r;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro';
      if (NET_ERR.test(msg)) { set({ conn: 'perdida' }); return null; }
      set({ error: msg });
      throw e;
    }
  },

  async refresh() { await get().call('ecos.state').catch(() => null); },
  select(id) { set({ selected: id }); },
  setAutoTune(v) { set({ autoTune: v }); try { localStorage.setItem('ecos.autoTune', v ? '1' : '0'); } catch { /* sem armazenamento: vale só nesta sessão */ } },
  tap() {
    const r = get().run;
    if (!r || r.phase !== 'coletando' || r.inspect || r.by !== 'pessoa' || get().autoTune) return null;
    const at = Date.now() - r.started, times = pulseTimes(r.seconds), tune = [...(r.tune ?? [])];
    // o pulso mais perto que ainda não foi tocado; toque longe de todos não conta
    let best = -1;
    for (let i = 0; i < times.length; i++) if (tune[i] === undefined && (best < 0 || Math.abs(at - times[i]) < Math.abs(at - times[best]))) best = i;
    if (best < 0 || Math.abs(at - times[best]) > 700) return null;
    tune[best] = at - times[best];
    set({ run: { ...r, tune } });
    return gradeOf(tune[best]);
  },
  setObjective(o) { set({ objective: o }); },
  setInWorld(v) { if (v !== get().inWorld) { set({ inWorld: v }); if (v && !get().view) void get().refresh(); } },

  gather(node, approach, by = 'pessoa') {
    const n = findNode(node), ap = n && approachOf(n, approach);
    if (!n || !ap) return;
    if (!isAvailable(n)) { toast(n.time === 'noite' ? 'Esse recurso só aparece de noite.' : 'Esse recurso sumiu por agora.', 'warn'); return; }
    if (n.kind === 'salgueiro' && amountOf(get().view, n) < 6) { toast('O salgueiro está se recuperando.', 'warn'); return; }
    if (get().run && !['concluido', 'interrompido', 'erro'].includes(get().run!.phase)) get().cancel('trocou de ação');
    if (by === 'pessoa' && get().auto.on) get().stopIntent('você assumiu o controle');
    // o painel do recurso fecha: a barra de ação mostra o andamento (e a coleta da Companion não abre nada sozinha)
    set({ run: { node, approach, request: uuid(), phase: 'andando', seconds: ap.seconds, started: 0, by }, selected: null, error: null });
    walkCheck.tries = 0; walkTo(n);
  },
  inspect(node) {
    const n = findNode(node); if (!n) return;
    if (get().run && !['concluido', 'interrompido', 'erro'].includes(get().run!.phase)) get().cancel('trocou de ação');
    set({ run: { node, approach: 'observar', request: uuid(), phase: 'andando', seconds: 2, started: 0, by: 'pessoa', inspect: true }, selected: null });
    walkCheck.tries = 0; walkTo(n);
  },
  cancel(why = 'você cancelou') {
    const r = get().run;
    work.on = false;
    if (!r || ['concluido', 'interrompido', 'erro'].includes(r.phase)) return;
    // antes da confirmação nada foi ganho nem gasto; a ação aberta no servidor expira sozinha
    set({ run: { ...r, phase: 'interrompido', message: why } });
  },

  tick() {
    const s = get(), r = s.run, v = s.view;
    const now = performance.now();
    if (r) {
      const n = findNode(r.node);
      if (!n) { get().cancel('o recurso ficou para trás'); return; }
      const dist = Math.hypot(companionFocus.x - n.x, companionFocus.z - n.z);
      const reach = (v?.config.reach ?? 4.5) - 0.6;
      if (r.phase === 'andando') {
        // quem joga mudou o caminho (clicou no chão): desiste da coleta
        if (moveRequest.id !== myMove) { get().cancel('você mudou o caminho'); return; }
        if (now - walkCheck.at > 2500) {
          if (dist > walkCheck.d - 0.3) {
            walkCheck.tries++;
            // travou perto o bastante? começa daqui mesmo (o servidor confere o alcance)
            if (dist <= (v?.config.reach ?? 4.5) - 0.2) { walkCheck.d = 0; }
            else if (walkCheck.tries > 4) { get().cancel('não consegui chegar até lá'); return; }
            else walkTo(n);
          }
          walkCheck.at = now; walkCheck.d = dist;
        }
        if (dist <= reach || walkCheck.d === 0) {
          work.on = true; work.at.set(n.x, 0, n.z); work.kind = NODE_KINDS[n.kind].category;
          if (r.inspect) { set({ run: { ...r, phase: 'confirmando' } }); void doInspect(r); return; }
          set({ run: { ...r, phase: 'confirmando' } });
          void start(r);
        }
      } else if (r.phase === 'coletando') {
        if (dist > (v?.config.reach ?? 4.5) + 1.5) { get().cancel('ela se afastou do recurso'); return; }
        if (Date.now() >= r.started + r.seconds * 1000 && now >= nextAttempt) { set({ run: { ...r, phase: 'confirmando' } }); void finish(r); }
      } else if (r.phase === 'confirmando' && s.conn === 'perdida' && now >= nextAttempt && !r.inspect) {
        void finish(r); // reconexão: reenvia o MESMO pedido
      }
    }
    // Companion por intenção
    if (s.auto.on && (!r || ['concluido', 'interrompido', 'erro'].includes(r.phase)) && now >= nextAttempt) autoStep();
  },

  async choose(choice) {
    try {
      const r = await get().call('ecos.choose', { request: uuid(), chain: SEIVA_AZUL.id, choice, x: companionFocus.x, z: companionFocus.z });
      if (!r?.chosen) return;
      set({ choiceOpen: false, journal: [{ at: Date.now(), text: choice === 'preservar' ? 'Preservamos a nascente: nasceu o Jardim da Nascente.' : 'Extraímos os cristais da nascente.', kind: 'clue' as const }, ...get().journal] });
      say(choice === 'preservar' ? 'Vamos cuidar daqui. Vai crescer bonito!' : 'Cristais lindos… a nascente vai dormir um pouco.');
      useGame.getState().celebrate({ kind: 'quest', eyebrow: 'Ecos da Terra · Descoberta', title: SEIVA_AZUL.title, subtitle: choice === 'preservar' ? 'O Jardim da Nascente produz raízes excelentes aos poucos — volte quando quiser.' : '2 Quartzo Azul íntegro e 3 Seiva Azul na mochila.' });
      void useGame.getState().run((b) => b.state());
    } catch { /* erro já mostrado */ }
  },

  startIntent(i) {
    set({ intent: i, auto: { on: true, got: 0, actions: 0, last: null }, objective: i.target ? { label: i.target.label, qty: i.target.qty, match: { category: i.target.category, materials: i.target.material ? [i.target.material] : undefined, prop: i.target.prop, min: i.target.min }, source: 'intencao' } : get().objective });
    lastSuggest = '';
    if (!get().view) void get().refresh();
  },
  stopIntent(why) {
    if (!get().auto.on) return;
    set({ auto: { ...get().auto, on: false } });
    if (why) say(`Tá bom, parei: ${why}.`);
  },
}));

function walkTo(n: ResourceNode) {
  // para do lado do recurso (não em cima dele)
  const dx = companionFocus.x - n.x, dz = companionFocus.z - n.z, d = Math.hypot(dx, dz) || 1;
  moveRequest.point.set(n.x + (dx / d) * 1.3, 0, n.z + (dz / d) * 1.3);
  moveRequest.id++;
  myMove = moveRequest.id;
  walkCheck = { at: performance.now(), d: d, tries: walkCheck.tries };
}

async function start(r: Run) {
  const S = useEcos;
  try {
    const res = await S.getState().call('ecos.start', { request: r.request, node: r.node, approach: r.approach, x: companionFocus.x, z: companionFocus.z });
    const cur = S.getState().run;
    if (!cur || cur.request !== r.request || cur.phase === 'interrompido') return;
    if (!res?.started) { nextAttempt = performance.now() + 3000; S.setState({ run: { ...cur, phase: 'andando' } }); return; }
    const k = NODE_KINDS[findNode(r.node)?.kind ?? 'erva'];
    playMaterialSound(k.category);
    S.setState({ run: { ...cur, phase: 'coletando', started: Date.now(), seconds: res.started.seconds } });
  } catch (e) {
    work.on = false;
    const cur = S.getState().run;
    if (cur?.request === r.request) S.setState({ run: { ...cur, phase: 'erro', message: e instanceof Error ? e.message : 'Erro' } });
    if (S.getState().auto.on) S.getState().stopIntent(e instanceof Error ? e.message.toLowerCase().replace(/\.$/, '') : 'erro');
  }
}

async function finish(r: Run) {
  const S = useEcos;
  try {
    // pulsos sem toque vão como null (fora); afinação automática e a Companion: o servidor conta como "bom"
    const tune = S.getState().autoTune ? COMPANION_TUNE : Array.from({ length: TUNE_PULSES }, (_, i) => r.tune?.[i] ?? null);
    const res = await S.getState().call('ecos.finish', { request: r.request, node: r.node, approach: r.approach, by: r.by, tune });
    const cur = S.getState().run;
    if (!res) { nextAttempt = performance.now() + 3000; return; } // conexão perdida: tenta de novo com o mesmo pedido
    const g = res.gather!;
    if (!g.ok && g.reason === 'cedo') { nextAttempt = performance.now() + Math.max(300, (g.wait ?? 0.5) * 1000); if (cur?.request === r.request) S.setState({ run: { ...cur, phase: 'coletando' } }); return; }
    work.on = false;
    if (cur?.request === r.request) S.setState({ run: { ...cur, phase: g.ok ? 'concluido' : 'erro', message: g.ok ? undefined : g.message ?? undefined, result: g.tune } });
    if (g.ok) {
      const n = findNode(r.node);
      if (n) playMaterialSound(NODE_KINDS[n.kind].category, true);
      const at = Date.now();
      S.setState({ recent: [...g.items.map((i) => ({ ...i, at })), ...S.getState().recent].slice(0, 12) });
      const st = S.getState();
      if (st.auto.on && st.objective) {
        const got = g.items.reduce((a, i) => { const p = parseBatchKey(i.key); return a + (p && matchesObjective(st.objective!.match, p) ? i.qty : 0); }, 0);
        S.setState({ auto: { ...st.auto, got: st.auto.got + got, actions: st.auto.actions + 1 } });
      } else if (st.auto.on) S.setState({ auto: { ...st.auto, actions: st.auto.actions + 1 } });
    } else if (S.getState().auto.on && g.reason === 'mochila-cheia') S.getState().stopIntent('a mochila encheu');
  } catch (e) {
    work.on = false;
    const cur = S.getState().run;
    if (cur?.request === r.request) S.setState({ run: { ...cur, phase: 'erro', message: e instanceof Error ? e.message : 'Erro' } });
  }
}

async function doInspect(r: Run) {
  const S = useEcos;
  await new Promise((ok) => setTimeout(ok, 1600));
  try {
    const res = await S.getState().call('ecos.inspect', { node: r.node, x: companionFocus.x, z: companionFocus.z });
    work.on = false;
    const cur = S.getState().run;
    if (cur?.request === r.request) S.setState({ run: { ...cur, phase: 'concluido' } });
    const n = findNode(r.node);
    if (res && n) say(`${nodeName(n)}: ${NODE_KINDS[n.kind].sign}`);
  } catch (e) {
    work.on = false;
    const cur = S.getState().run;
    if (cur?.request === r.request) S.setState({ run: { ...cur, phase: 'erro', message: e instanceof Error ? e.message : 'Erro' } });
  }
}

/** Um passo da Companion coletando sozinha: escolhe pela pontuação, explica e vai. */
function autoStep() {
  const S = useEcos, st = S.getState(), v = st.view, i = st.intent;
  if (!i || !v) return;
  const free = v.config.bag - bagUsedOf(v);
  if (st.objective && st.auto.got >= st.objective.qty) { say(`Pronto! Juntei ${st.auto.got} — ${st.objective.label.toLowerCase()}.`); toast(`Objetivo cumprido: ${st.objective.label}`, 'gold'); S.setState({ auto: { ...st.auto, on: false } }); return; }
  if (free <= i.reserve) { st.stopIntent('a mochila chegou no limite que combinamos'); return; }
  if (i.mode === 'explorar' && st.auto.actions >= 6) { st.stopIntent('explorei bastante por aqui'); return; }
  const list = suggestionsNow(v, i);
  const best = list.find((x) => !x.blocked);
  if (!best) {
    // nada conhecido serve: anda um pouco para enxergar mais (sem saber o que tem lá)
    if (st.auto.actions < 30) {
      const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 10;
      moveRequest.point.set(companionFocus.x + Math.cos(a) * r, 0, companionFocus.z + Math.sin(a) * r); moveRequest.id++; myMove = moveRequest.id;
      if (lastSuggest !== 'procurando') { lastSuggest = 'procurando'; say('Não vejo nada disso por aqui… vou procurar um pouco.'); }
      nextAttempt = performance.now() + 4000;
      S.setState({ auto: { ...st.auto, actions: st.auto.actions + 1 } });
      return;
    }
    st.stopIntent(list[0]?.blocked ? `${nodeName(list[0].node)}: ${list[0].blocked}` : 'não achei nada que sirva por perto');
    return;
  }
  const key = best.node.id + '/' + best.approach.id;
  if (key !== lastSuggest) { lastSuggest = key; say(best.reason); S.setState({ auto: { ...st.auto, last: best.reason } }); }
  st.gather(best.node.id, best.approach.id, 'companion');
}

/** Para a interface: abundância de um nó agora. */
export const amountOf = (v: EcosView | null, n: ResourceNode) => abundanceNow(n, v?.nodes[n.id] ?? null, Date.now());

// testes no navegador (só no dev)
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __ecos: unknown }).__ecos = useEcos;
