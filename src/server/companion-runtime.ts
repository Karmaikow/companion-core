import { mkdir, readFile, readdir } from 'node:fs/promises';
import { signData, verifySignature } from '../crypto/crypto.js';
import { CompanionCore } from '../core/core.js';
import { InteractionEngine } from '../core/interaction-engine.js';
import { OllamaProvider } from '../ai/ollama-provider.js';
import { ConversationHistory } from '../interaction/conversation-history.js';
import { LocalStore, writeFileAtomic } from '../storage/store.js';
import path from 'node:path';
import type { AIProvider } from '../ai/ai-provider.js';
import { MAYUNA_PROFILE } from '../companions/mayuna.js';

const DATA_ROOT = process.env.MAYUNA_DATA_DIR ?? 'data';
const ACTIVE_COMPANION_FILE = path.join(DATA_ROOT, 'active-companion.json');

async function getActiveCompanionId(): Promise<string | null> {
  try {
    const content = await readFile(ACTIVE_COMPANION_FILE, 'utf8');
    const data = JSON.parse(content) as { id?: unknown };
    if (typeof data.id !== 'string' || !/^MC-[A-Z0-9-]+$/i.test(data.id)) throw new Error('Identidade ativa inválida.');
    return data.id;
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
    // A missing pointer must not silently abandon an existing identity.
    let files: string[] = [];
    try { files = await readdir(DATA_ROOT); } catch (readError) {
      if ((readError as { code?: string }).code !== 'ENOENT') throw readError;
    }
    if (files.some(file => /^MC-.*\.json$/i.test(file))) throw new Error('Há identidades sem ponteiro ativo. Restaure active-companion.json.');
    return null;
  }
}

async function setActiveCompanionId(id: string): Promise<void> {
  await mkdir(DATA_ROOT, { recursive: true, mode: 0o700 });
  await writeFileAtomic(
    ACTIVE_COMPANION_FILE,
    JSON.stringify({ id }, null, 2),
    0o600
  );
}

export class CompanionRuntime {
  private readonly store = new LocalStore(DATA_ROOT);
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly provider: AIProvider = new OllamaProvider()) {}
  private readonly conversation = new ConversationHistory(6);
  private core!: CompanionCore;
  private interaction!: InteractionEngine;

  async initialize(): Promise<void> {
    const activeId = await getActiveCompanionId();

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
      this.core = CompanionCore.create(MAYUNA_PROFILE);
    }

    this.interaction = new InteractionEngine(
      this.core,
      this.provider,
      this.conversation
    );

    if (!activeId) await this.save();
  }

  getClientState() {
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

  chat(message: string) {
    // Serialize interaction + persistence: the next request sees the preceding state.
    const next = this.queue.then(() => this.interactAndSave(message));
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async interactAndSave(message: string) {
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
    return this.core.verifyLocal();
  }

  private async save(): Promise<void> {
    await this.store.save(this.core.getData());
    await this.store.savePrivateKey(
      this.core.getState().identity.id,
      this.core.getPrivateKey()
    );
    await setActiveCompanionId(this.core.getState().identity.id);
  }
}
