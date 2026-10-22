/**
 * Modo local: o mesmo motor de regras do servidor, persistido no navegador e
 * com o respondedor offline no lugar do modelo de linguagem. Serve para jogar
 * e testar sem back-end, e como referência de comportamento.
 */
import {
  DEFAULT_CONFIG, initialQuests, applyTurn, offlineTurn, levelForXp, levelProgress, checkAwakening,
  buildIdentityContract, companionDay, QUEST_REWARDS, validateSetup, evaluateSecrets, isQuestionAboutCompanion, gameTime,
  SECRET_BY_KEY, SECRET_XP, SECRET_BOOST_TURNS, DEFAULT_CREATURES, recordKill, combatMemoryText, type BestiaryEntry, type SecretKey, type Discoveries, type QuestState, type IdentityContractV1,
  type CompanionSetup,
} from '@rules';
import type { Backend, Snapshot, MemoryRow, DiaryRow, InventoryRow, TimelineRow } from './types';

interface LocalSave {
  v: 1;
  id: string;
  stage: 'particles' | 'awakened';
  discoveries: Discoveries;
  bondXp: number;
  quests: QuestState[];
  events: TimelineRow[];
  memories: MemoryRow[];
  diary: DiaryRow[];
  inventory: InventoryRow[];
  contract: IdentityContractV1 | null;
  awakenedAt: string | null;
  lastDreamAt: string | null;
  createdAt: string;
  seq: number;
  secrets?: { key: string; achievedAt: string }[];
  boost?: number;
  bestiary?: BestiaryEntry[];
}

const KEY = 'companion-core:local:v1';
const cfg = DEFAULT_CONFIG;

function load(): LocalSave | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LocalSave) : null;
  } catch {
    return null;
  }
}
function save(s: LocalSave) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* armazenamento indisponível: segue em memória */ }
}

let mem: LocalSave | null = null;

export class LocalBackend implements Backend {
  readonly kind = 'local' as const;
  private get s(): LocalSave | null { return (mem ??= load()); }

  private ev(s: LocalSave, actor: string, kind: string, payload: Record<string, unknown>) {
    const row = { id: ++s.seq, actor, kind, payload, created_at: new Date().toISOString() };
    s.events.push(row);
    return row.id;
  }

  private snap(extra: Partial<Snapshot> = {}): Snapshot {
    const s = this.s;
    if (!s) return { companion: null, config: cfg, provider: 'offline' };
    const level = levelForXp(s.bondXp, cfg);
    return {
      companion: { id: s.id, stage: s.stage, discoveries: s.discoveries, bondXp: s.bondXp, bond: levelProgress(s.bondXp, cfg), identityContract: s.contract, awakenedAt: s.awakenedAt, lastDreamAt: s.lastDreamAt, createdAt: s.createdAt },
      quests: s.quests,
      awakening: checkAwakening(s.quests, s.discoveries, level, cfg),
      memories: [...s.memories].reverse(),
      diary: [...s.diary].reverse(),
      inventory: s.inventory,
      timeline: s.events.filter((e) => ['chat.player', 'chat.companion', 'quest.completed', 'identity.renamed', 'secret.found', 'bond.level', 'companion.awakened'].includes(e.kind)).slice(-60),
      secrets: s.secrets ?? [],
      recipes: [],
      bestiary: [...(s.bestiary ?? [])].sort((a, b) => b.lastAt.localeCompare(a.lastAt)),
      boost: s.boost ?? 0,
      visualJob: s.contract ? { id: 'local', status: 'queued', contract_version: 1, created_at: s.awakenedAt ?? '' } : null,
      config: cfg,
      provider: 'offline',
      ...extra,
    };
  }

  private grant(s: LocalSave, keys: SecretKey[], sources: number[]) {
    for (const key of keys) {
      const def = SECRET_BY_KEY[key];
      const now = new Date().toISOString();
      (s.secrets ??= []).push({ key, achievedAt: now });
      this.ev(s, 'system', 'secret.found', { secret: key, title: def.title, story: def.story, item: def.item.item, xp: SECRET_XP, boost: SECRET_BOOST_TURNS, sources });
      s.inventory.push({ item_key: def.item.item, qty: 1, meta: { label: def.item.label, description: def.item.description, secret: key, rare: true }, acquired_at: now });
      s.bondXp += SECRET_XP;
      s.boost = (s.boost ?? 0) + SECRET_BOOST_TURNS;
    }
  }

  async state() { return this.snap(); }

  /** Derrota de uma criatura (offline: as criaturas de reserva dão o nome e a análise). */
  async combatKill(slug: string, level: number) {
    const s = this.s; if (!s) return this.snap();
    const all = (s.bestiary ??= []);
    const def = DEFAULT_CREATURES.find((d) => d.slug === slug) ?? null;
    const prev = all.find((e) => e.slug === slug) ?? null;
    const now = new Date().toISOString();
    const r = recordKill(prev, all, { slug, name: def?.name ?? slug, level }, now);
    if (prev) Object.assign(prev, r.entry); else all.push(r.entry);
    const ev = this.ev(s, 'system', 'combat.kill', { slug, level, first: r.first, analyzed: r.analyzedNow });
    const me = s.discoveries.name ?? 'O Companion';
    if (r.first) s.memories.push({ id: ++s.seq, subject: 'companion', content: combatMemoryText('first', me, def, r.entry.name, level), importance: 3, source_event_ids: [ev], origin: 'combat', created_at: now });
    if (r.analyzedNow) s.memories.push({ id: ++s.seq, subject: 'companion', content: combatMemoryText('analyzed', me, def, r.entry.name, level), importance: 4, source_event_ids: [ev], origin: 'combat', created_at: now });
    save(s);
    return this.snap({ combat: { entry: r.entry, first: r.first, analyzed: r.analyzedNow, analyzedCount: r.analyzedCount, milestone: r.milestone } });
  }

  async create(setup?: CompanionSetup) {
    if (!this.s) {
      const r = setup ? validateSetup(setup) : null;
      if (r && !r.ok) throw new Error(r.error);
      const now = new Date().toISOString();
      const s: LocalSave = {
        v: 1, id: crypto.randomUUID(), stage: 'particles', discoveries: r?.ok ? r.discoveries : {}, bondXp: 0, quests: initialQuests(), events: [], memories: [], diary: [], inventory: [],
        contract: null, awakenedAt: null, lastDreamAt: null, createdAt: now, seq: 0,
      };
      const born = this.ev(s, 'system', 'companion.born', { ritual: !!r });
      if (r?.ok) {
        for (const key of ['identity', 'traits'] as const) {
          const patch = key === 'identity' ? { name: r.discoveries.name } : { traits: r.discoveries.traits };
          const id = this.ev(s, 'system', 'quest.completed', { quest: key, patch, evidence: 'ritual de criação', sources: [born] });
          const q = s.quests.find((x) => x.key === key)!;
          Object.assign(q, { status: 'done', completedAt: now, sourceEventId: id });
          const rw = QUEST_REWARDS[key];
          s.inventory.push({ item_key: rw.item, qty: 1, meta: { label: rw.label, description: rw.description, quest: key, ...patch }, acquired_at: now });
        }
        s.memories.push({ id: ++s.seq, subject: 'player', content: `A pessoa se chama ${r.discoveries.playerName}.`, importance: 5, source_event_ids: [born], origin: 'conversation', created_at: now });
      }
      mem = s;
      save(s);
    }
    return this.snap();
  }

  async chat(message: string) {
    const s = this.s;
    if (!s) throw new Error('Nenhum Companion ainda.');
    const since = Date.now() - 24 * 3600_000;
    const recentPlayer = s.events.filter((e) => e.kind === 'chat.player').slice(-8).reverse().map((e) => String(e.payload.text));
    const meaningfulToday = s.events.filter((e) => e.kind === 'bond.xp' && e.payload.meaningful && Date.parse(e.created_at) > since).length;
    const lastCompanion = String([...s.events].reverse().find((e) => e.kind === 'chat.companion')?.payload.text ?? '');
    const asked = isQuestionAboutCompanion(message);
    const a = this.ev(s, 'player', 'chat.player', { text: message, ...(asked ? { askedCompanion: true } : {}) });
    const model = offlineTurn(message, s.discoveries, s.quests, s.seq, recentPlayer, lastCompanion);
    const plan = applyTurn({ playerMessage: message, model, discoveries: s.discoveries, quests: s.quests, bondXp: s.bondXp, existingMemories: s.memories, recentPlayerMessages: recentPlayer, meaningfulToday, cfg, boost: s.boost ?? 0 });
    const b = this.ev(s, 'companion', 'chat.companion', { text: model.reply, mood: model.mood, source: 'offline' });
    for (const c of plan.completed) {
      const id = this.ev(s, 'system', 'quest.completed', { quest: c.key, patch: c.patch, sources: [a, b] });
      const q = plan.quests.find((x) => x.key === c.key)!;
      q.completedAt = new Date().toISOString();
      q.sourceEventId = id;
      const r = QUEST_REWARDS[c.key];
      s.inventory.push({ item_key: r.item, qty: 1, meta: { label: r.label, description: r.description, quest: c.key, ...c.patch }, acquired_at: new Date().toISOString() });
      // No modo local, cada descoberta vira uma memória de identidade rastreável.
      s.memories.push({ id: ++s.seq, subject: 'companion', content: `Descobri: ${r.label.toLowerCase()} — ${Object.values(c.patch).flat().join(', ')}`, importance: 4, source_event_ids: [a, b, id], origin: 'conversation', created_at: new Date().toISOString() });
    }
    if (plan.renamed) this.ev(s, 'system', 'identity.renamed', { from: s.discoveries.name ?? null, to: plan.renamed, sources: [a, b] });
    this.ev(s, 'system', 'bond.xp', { ...plan.xp });
    if (plan.levelAfter > plan.levelBefore) this.ev(s, 'system', 'bond.level', { level: plan.levelAfter });
    s.discoveries = plan.discoveries;
    s.quests = plan.quests;
    s.bondXp = plan.bondXp;
    s.boost = plan.boostLeft;
    const secretKeys = evaluateSecrets({
      message, meaningful: plan.xp.meaningful, phase: gameTime(Date.now()).phase, renamed: !!plan.renamed,
      questionsAboutCompanion: s.events.filter((e) => e.kind === 'chat.player' && e.payload.askedCompanion).length,
    }, new Set((s.secrets ?? []).map((x) => x.key)));
    this.grant(s, secretKeys, [a, b]);
    save(s);
    return this.snap({ turn: { reply: model.reply, mood: model.mood, source: 'offline', xp: plan.xp, completed: plan.completed.map((c) => c.key), rejected: plan.rejected, newMemories: 0, levelUp: plan.levelAfter > plan.levelBefore ? plan.levelAfter : null, awakeningReady: checkAwakening(s.quests, s.discoveries, levelForXp(s.bondXp, cfg), cfg).ready, renamed: plan.renamed, secrets: secretKeys } });
  }

  async dream() {
    const s = this.s;
    if (!s) throw new Error('Nenhum Companion ainda.');
    const since = Date.parse(s.lastDreamAt ?? s.createdAt);
    const evs = s.events.filter((e) => Date.parse(e.created_at) > since && ['chat.player', 'quest.completed'].includes(e.kind));
    if (evs.length < 3) return this.snap({ dream: { dreamed: false, reason: 'Ainda há pouco para sonhar. Conversem mais um pouco.' } });
    const talks = evs.filter((e) => e.kind === 'chat.player').length;
    const found = evs.filter((e) => e.kind === 'quest.completed').map((e) => String(e.payload.quest));
    const body = `Hoje conversamos ${talks} ${talks === 1 ? 'vez' : 'vezes'}.${found.length ? ` Descobri ${found.length === 1 ? 'algo novo' : found.length + ' coisas'} sobre mim${s.discoveries.name ? `, e agora sei que me chamo ${s.discoveries.name}` : ''}.` : ''} Antes de descansar, guardei cada palavra no meu núcleo.`;
    s.diary.push({ id: ++s.seq, game_day: companionDay(Date.parse(s.createdAt), Date.now()), body, source_event_ids: evs.map((e) => e.id), created_at: new Date().toISOString() });
    this.ev(s, 'system', 'companion.dreamed', { events: evs.length });
    s.lastDreamAt = new Date().toISOString();
    const secretKeys = evaluateSecrets({ diaryTotal: s.diary.length }, new Set((s.secrets ?? []).map((x) => x.key)));
    this.grant(s, secretKeys, evs.slice(-2).map((e) => e.id));
    save(s);
    return this.snap({ dream: { dreamed: true, secrets: secretKeys } });
  }

  async awaken() {
    const s = this.s;
    if (!s) throw new Error('Nenhum Companion ainda.');
    const level = levelForXp(s.bondXp, cfg);
    const check = checkAwakening(s.quests, s.discoveries, level, cfg);
    if (!check.ready) throw new Error('Ainda não é hora de despertar: ' + check.missing.join(', '));
    s.contract = buildIdentityContract(s.id, s.discoveries as Required<Discoveries>, level, s.discoveries.pronoun ?? 'ela');
    s.stage = 'awakened';
    s.awakenedAt = new Date().toISOString();
    this.ev(s, 'system', 'companion.awakened', { contractVersion: 1 });
    save(s);
    return this.snap();
  }

  async reset() {
    mem = null;
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  }
}
