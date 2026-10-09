import { describeColor } from '../core/color-names.js';
import { mkdir, readFile, readdir, unlink } from 'node:fs/promises';
import { signData, verifySignature } from '../crypto/crypto.js';
import { CompanionCore } from '../core/core.js';
import { InteractionEngine } from '../core/interaction-engine.js';
import { OllamaProvider } from '../ai/ollama-provider.js';
import { ConversationHistory } from '../interaction/conversation-history.js';
import { LocalStore, writeFileAtomic } from '../storage/store.js';
import path from 'node:path';
import type { AIProvider } from '../ai/ai-provider.js';
import type { CompanionProfile } from '../models/companion-profile.js';
import { creationSeed, CREATION_COLORS, CREATION_GROUPS } from '../core/creation-options.js';
import { MAYUNA_PROFILE } from '../companions/mayuna.js';

const DATA_ROOT = process.env.MAYUNA_DATA_DIR ?? 'data';
async function getActiveCompanionId(dataRoot: string): Promise<string | null> {
  const activeFile = path.join(dataRoot, 'active-companion.json');
  try {
    const content = await readFile(activeFile, 'utf8');
    const data = JSON.parse(content) as { id?: unknown };
    if (typeof data.id !== 'string' || !/^MC-[A-Z0-9-]+$/i.test(data.id)) throw new Error('Identidade ativa inválida.');
    return data.id;
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
    // A missing pointer must not silently abandon an existing identity.
    let files: string[] = [];
    try { files = await readdir(dataRoot); } catch (readError) {
      if ((readError as { code?: string }).code !== 'ENOENT') throw readError;
    }
    if (files.some(file => /^MC-.*\.json$/i.test(file))) throw new Error('Há identidades sem ponteiro ativo. Restaure active-companion.json.');
    return null;
  }
}

async function setActiveCompanionId(dataRoot: string, id: string): Promise<void> {
  await mkdir(dataRoot, { recursive: true, mode: 0o700 });
  await writeFileAtomic(
    path.join(dataRoot, 'active-companion.json'),
    JSON.stringify({ id }, null, 2),
    0o600
  );
}

export class HubError extends Error { constructor(public status: number, message: string) { super(message); } }

export class CompanionRuntime {
  private readonly store: LocalStore;
  private readonly dataRoot: string;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly provider: AIProvider = new OllamaProvider(), dataRoot = DATA_ROOT) {
    this.dataRoot = dataRoot;
    this.store = new LocalStore(dataRoot);
  }
  private conversation = new ConversationHistory(6);
  private core!: CompanionCore;
  private interaction!: InteractionEngine;

  async initialize(): Promise<void> {
    const activeId = await getActiveCompanionId(this.dataRoot);

    if (activeId) {
      try {
        const stored = await this.store.load(activeId);
        if (!stored) {
          throw new Error('Companion ativa não encontrada.');
        }

        const privateKey = await this.store.loadPrivateKey(activeId);
        if (stored.state.identity.id !== activeId) throw new Error('Identidade não corresponde ao ponteiro ativo.');
        const challenge = 'mayuna-runtime-key-check';
        if (!verifySignature(challenge, signData(challenge, privateKey), stored.state.identity.cryptographicIdentity.publicKey)) {
          throw new Error('Chave privada não corresponde à identidade.');
        }
        this.core = CompanionCore.from(stored, privateKey);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'erro desconhecido';
        throw new Error(`Não foi possível recuperar a Companion ativa: ${reason} Nenhuma identidade foi substituída.`, { cause: error });
      }
    } else {
      // A new installation stays empty until its owner completes the ritual.
      return;
    }

    this.interaction = new InteractionEngine(
      this.core,
      this.provider,
      this.conversation
    );

  }

  getActiveId(): string | null { return this.core?.getState().identity.id ?? null; }
  hasCompanion(): boolean { return this.getActiveId() !== null; }
  private requireCompanion() {
    if (!this.hasCompanion()) throw new HubError(409, 'Desperte sua primeira Companion antes de continuar.');
  }

  getClientState() {
    this.requireCompanion();
    const state = this.core.getState();
    const data = this.core.getData();

    return {
      identity: {
        id: state.identity.id,
        name: state.identity.name,
        createdAt: state.identity.createdAt
      },
      profile: {
        name: state.profile.name,
        appearance: state.profile.appearance,
        creation: state.profile.creation,
        identity: state.profile.identity,
        preferences: state.profile.preferences,
        companionOf: state.profile.companionOf
      },
      core: state.core,
      combat: state.combat,
      bond: state.bond,
      personality: state.personality,
      memories: state.memories,
      journal: state.journal,
      achievements: state.achievements,
      inventory: state.inventory,
      discoveries: state.discoveries,
      meta: {
        provider: this.provider.activeProvider ?? this.provider.name,
        configuredProvider: this.provider.name,
        eventCount: data.events.length,
        snapshotCount: data.snapshots.length
      }
    };
  }

  async listCompanions() {
    const files = await readdir(this.dataRoot, { withFileTypes: true }).catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    });
    const ids = files.filter(file => file.isFile() && /^MC-[A-Z0-9-]+\.json$/i.test(file.name))
      .map(file => file.name.slice(0, -5));
    const activeId = this.getActiveId();
    const companions = [];
    for (const id of ids) {
      const stored = await this.store.load(id);
      if (!stored || stored.state.identity.id !== id) throw new Error(`A identidade ${id} precisa ser recuperada antes de abrir o Hub.`);
      companions.push({ id, name: stored.state.identity.name, form: stored.state.core.evolutionStage, isActive: id === activeId });
    }
    return companions.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  getCreationPolicy() {
    return { canCreate: !this.hasCompanion(), additionalCreationForTesting: false, groups: CREATION_GROUPS, colors: CREATION_COLORS };
  }

  createCompanion(input: { name: string; ownerName: string; preferredAddress: string; archetype?: string; soulColor?: unknown; traits?: unknown }) {
    const next = this.queue.then(async () => {
      const clean = (value: string) => value.trim().replace(/\s+/g, ' ');
      const name = clean(input.name ?? '');
      const ownerName = clean(input.ownerName ?? '');
      const preferredAddress = clean(input.preferredAddress ?? '');
      const archetypes = {
        curious: { label: 'curiosa', stat: 'curiosity', value: 82 },
        kind: { label: 'gentil', stat: 'empathy', value: 82 },
        playful: { label: 'brincalhona', stat: 'humor', value: 82 },
        brave: { label: 'corajosa', stat: 'courage', value: 82 },
        serene: { label: 'serena', stat: 'autonomy', value: 65 }
      } as const;
      if (!/^[\p{L}0-9][\p{L}0-9 '\-]{1,39}$/u.test(name)) throw new HubError(400, 'Use um nome de 2 a 40 caracteres.');
      if (!/^[\p{L}][\p{L} '\-]{1,39}$/u.test(ownerName) || !/^[\p{L}][\p{L} '\-]{1,39}$/u.test(preferredAddress)) throw new HubError(400, 'Informe seu nome e como a Companion deve chamar você.');
      if (input.traits === undefined && !Object.hasOwn(archetypes, input.archetype ?? '')) throw new HubError(400, 'Escolha uma personalidade inicial válida.');
      let seed: ReturnType<typeof creationSeed> | undefined;
      if(input.traits !== undefined) { try { seed=creationSeed(input.traits); } catch(error) { throw new HubError(400,(error as Error).message); } }
      if(seed && (typeof input.soulColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(input.soulColor))) throw new HubError(400,'Escolha uma cor válida para a alma.');
      const existing = await this.listCompanions();
      if(this.hasCompanion() || existing.length) throw new HubError(409,'Você já possui uma Companion. Novas presenças chegarão por encontros e convites no mundo.');
      if (existing.some(item => item.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) throw new HubError(409, 'Já existe uma Companion com esse nome no Hub.');
      const chosen = archetypes[(Object.hasOwn(archetypes,input.archetype ?? '') ? input.archetype : 'curious') as keyof typeof archetypes];
      const profile = structuredClone(MAYUNA_PROFILE) as CompanionProfile;
      profile.name = name;
      profile.companionOf = { name: ownerName, preferredAddress };
      profile.identity.description = `${name} despertou como uma alma digital de personalidade ${chosen.label}, que evoluirá através das conversas e experiências.`;
      profile.personality = { loyalty: 80, curiosity: 55, humor: 55, courage: 55, empathy: 55, autonomy: 45, [chosen.stat]: chosen.value };
      profile.preferences = { favoriteThings: [] };
      if(seed) {
        const soulColor=(input.soulColor as string).toLowerCase();
        profile.appearance={soulColor,soulColorName:describeColor(soulColor).name,formInfluences:seed.formInfluences};
        profile.creation={traits:seed.traits,labels:seed.labels,bigFive:seed.bigFive};
        profile.personality=seed.personality;
        profile.identity.description=`${name} nasceu no Refúgio, em um universo de fantasia. Suas inclinações iniciais são: ${seed.labels.join(', ')}. Esses traços evoluem com as experiências; sua forma futura ainda não se manifestou.`;
      }
      profile.genesis = { version: '0.8.0', message: `Hoje eu despertei. ${ownerName} estava ali no começo da minha história.`, initialForm: 'SOUL' };
      const core = CompanionCore.create(profile);
      const id = core.getState().identity.id;
      try {
        await this.store.save(core.getData());
        await this.store.savePrivateKey(id, core.getPrivateKey());
        await setActiveCompanionId(this.dataRoot, id);
      } catch (error) {
        await Promise.all([
          unlink(path.join(this.dataRoot, `${id}.json`)).catch(() => undefined),
          unlink(path.join(this.dataRoot, 'secure', `${id}.key.json`)).catch(() => undefined)
        ]);
        throw error;
      }
      this.activateCore(core);
      return this.getClientState();
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  activateCompanion(id: string) {
    const next = this.queue.then(async () => {
      if (!/^MC-[A-Z0-9-]+$/i.test(id)) throw new Error('Identidade inválida.');
      const stored = await this.store.load(id);
      if (!stored || stored.state.identity.id !== id) throw new Error('Companion não encontrada no Hub.');
      const privateKey = await this.store.loadPrivateKey(id);
      const challenge = 'mayuna-runtime-key-check';
      let validKey = false;
      try { validKey = verifySignature(challenge, signData(challenge, privateKey), stored.state.identity.cryptographicIdentity.publicKey); } catch { /* malformed private-key file */ }
      if (!validKey) throw new HubError(409, 'Chave privada não corresponde à Companion.');
      const core = CompanionCore.from(stored, privateKey);
      await setActiveCompanionId(this.dataRoot, id);
      this.activateCore(core);
      return this.getClientState();
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  private activateCore(core: CompanionCore) {
    this.core = core;
    this.conversation = new ConversationHistory(6);
    this.interaction = new InteractionEngine(this.core, this.provider, this.conversation);
  }

  chat(message: string) {
    // Serialize interaction + persistence: the next request sees the preceding state.
    const next = this.queue.then(() => this.interactAndSave(message));
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async interactAndSave(message: string) {
    this.requireCompanion();
    const started = performance.now();
    const result = await this.interaction.interact(message);
    const interactionMs = Math.round(performance.now() - started);

    const data = this.core.getData();
    if (data.events.length > 0 && data.events.length % 5 === 0) {
      this.core.createSnapshot();
    }

    const saveStarted = performance.now();
    await this.save();
    if (process.env.MAYUNA_DIAGNOSTICS === '1') console.info('[Mayuna timing] Runtime', { interactionMs, saveMs: Math.round(performance.now() - saveStarted) });

    return {
      ...result,
      state: this.getClientState()
    };
  }

  verify() {
    this.requireCompanion();
    return this.core.verifyLocal();
  }

  private async save(): Promise<void> {
    await this.store.save(this.core.getData());
    await this.store.savePrivateKey(
      this.core.getState().identity.id,
      this.core.getPrivateKey()
    );
    await setActiveCompanionId(this.dataRoot, this.core.getState().identity.id);
  }
}
