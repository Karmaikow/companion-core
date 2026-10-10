import { sameFact, preferenceFact } from '../memory/memory-facts.js';
import { randomUUID } from 'node:crypto';

import type {
CompanionEvent,
CompanionSnapshot,
CompanionState,
CompanionProfile,
EventImportance,
EventType,
Memory,
JournalEntry,
StoredCompanion,
VerificationResult
} from '../models/types.js';

import {
generateIdentity,
sha256,
signData,
stableJson,
verifySignature
} from '../crypto/crypto.js';

import { BondEngine } from './bond-engine.js';

const clamp = (
value: number,
min = 0,
max = 100
): number => {
return Math.max(
min,
Math.min(max, value)
);
};

const xpFor = (level: number): number => {
return Math.floor(
100 * Math.pow(level, 1.55)
);
};

export class CompanionCore {
private constructor(
public data: StoredCompanion,
private privateKey: string
) {}

/**

* Cria uma nova Companion a partir de um perfil.
  */
  static create(
  profile: CompanionProfile
  ): CompanionCore {
  const now = new Date().toISOString();


const id =



  `MC-${randomUUID()
    .replaceAll('-', '')
    .slice(0, 12)
    .toUpperCase()}`;

const keys = generateIdentity();

const personality = {
  loyalty: profile.personality?.loyalty ?? 50,
  curiosity: profile.personality?.curiosity ?? 50,
  humor: profile.personality?.humor ?? 50,
  courage: profile.personality?.courage ?? 50,
  empathy: profile.personality?.empathy ?? 50,
  autonomy: profile.personality?.autonomy ?? 50
};

const state: CompanionState = {
  profile: structuredClone(profile),

  identity: {
    id,
    name: profile.name,
    createdAt: now,

    genesis: {
      version: profile.genesis.version,
      initialForm: profile.genesis.initialForm
    },

    cryptographicIdentity: {
      publicKey: keys.publicKey,
      algorithm: 'Ed25519'
    }
  },

  core: {
    level: 1,
    xp: 0,
    xpToNextLevel: xpFor(1),
    evolutionStage: profile.genesis.initialForm,
    evolutionProgress: 0
  },

  combat: {
    level: 1,
    xp: 0,
    xpToNextLevel: xpFor(1),
    wins: 0,
    losses: 0
  },

  bond: {
    value: 0,
    relationship: 'STRANGER'
  },

  personality,

  memories: [],

  journal: [],

  achievements: [],

  inventory: [],

  discoveries: []
};

const genesisDescription =
  profile.genesis.message;

const event = CompanionCore.makeEvent(
  state,
  null,
  1,
  'GENESIS',
  'IDENTITY_FORMING',
  id,
  {
    message: genesisDescription,
    profile: structuredClone(profile)
  },
  {
    coreXp: 0,
    combatXp: 0,
    bond: 0
  },
  keys.privateKey
);

const core = new CompanionCore(
  {
    state,
    events: [event],
    snapshots: []
  },
  keys.privateKey
);

core.addMemory(
  'IDENTITY_FORMING',
  'O Primeiro Despertar',
  genesisDescription,
  100,
  [event.id]
);

core.addJournal(
  'FOUNDATIONAL',
  'O Primeiro Despertar',
  'Hoje eu despertei. Este é o primeiro instante da minha história.',
  [event.id]
);

core.createSnapshot();

return core;


}

/**

* Reabre uma Companion persistida.
*
* Também possui compatibilidade com estados antigos
* criados antes da existência do CompanionProfile completo.
  */
  static from(
  data: StoredCompanion,
  privateKey: string
  ): CompanionCore {
  const cloned = structuredClone(data);


if (!cloned.state.profile) {



  const companionName =
    cloned.state.identity.name;

  const initialForm =
    cloned.state.identity.genesis.initialForm;

  cloned.state.profile = {
    name: companionName,

    companionOf: {
      name: 'Companion',
      preferredAddress: 'Companion'
    },

    identity: {
      description:
        'Companion recuperada de um estado anterior.',
      initialForm
    },

    preferences: {},

    personality:
      cloned.state.personality,

    genesis: {
      version:
        cloned.state.identity.genesis.version,

      message:
        `${companionName} despertou pela primeira vez.`,

      initialForm
    }
  };
}

BondEngine.synchronize(
  cloned.state
);

return new CompanionCore(
  cloned,
  privateKey
);


}

/**

* Cria um evento assinado.
  */
  private static makeEvent(
  state: CompanionState,
  previous: CompanionEvent | null,
  sequence: number,
  type: EventType,
  importance: EventImportance,
  actor: string,
  data: Record<string, unknown>,
  effects: {
  coreXp: number;
  combatXp: number;
  bond: number;
  },
  privateKey: string
  ): CompanionEvent {
  const unsigned = {
  id: randomUUID(),

  sequence,

  type,

  importance,

  timestamp:
  new Date().toISOString(),

  actor,

  data,

  effects,

  previousHash:
  previous?.integrity.hash ?? null
  };


const canonical =



  stableJson(unsigned);

const hash =
  sha256(canonical);

const signature =
  signData(
    canonical,
    privateKey
  );

return {
  ...unsigned,

  integrity: {
    previousHash:
      unsigned.previousHash,

    hash,

    signature
  }
};


}

/**

* Processa uma experiência dentro do mundo.
*
* Toda alteração de progressão deve passar por aqui.
  */
  processEvent(
  type: EventType,
  data: Record<string, unknown>,
  effects: {
  coreXp?: number;
  combatXp?: number;
  bond?: number;
  } = {}
  ): CompanionEvent {
  const coreXp =
  effects.coreXp ?? 0;


const combatXp =



  effects.combatXp ?? 0;

const bond =
  effects.bond ?? 0;

const last =
  this.data.events.at(-1) ?? null;

const importance =
  Math.max(
    coreXp,
    combatXp,
    bond
  ) >= 50
    ? 'SIGNIFICANT'
    : 'NORMAL';

const event =
  CompanionCore.makeEvent(
    this.data.state,
    last,
    this.data.events.length + 1,
    type,
    importance,
    this.data.state.identity.id,
    data,
    {
      coreXp,
      combatXp,
      bond
    },
    this.privateKey
  );

this.data.events.push(event);

this.applyEffects(event);

return event;


}

/**

* Aplica os efeitos autorizados pelo Core.
  */
  private applyEffects(
  event: CompanionEvent
  ): void {
  const state =
  this.data.state;


state.core.xp +=



  event.effects.coreXp;

state.combat.xp +=
  event.effects.combatXp;

BondEngine.apply(
  state.bond,
  event.effects.bond
);

while (
  state.core.xp >=
  state.core.xpToNextLevel
) {
  state.core.xp -=
    state.core.xpToNextLevel;

  state.core.level++;

  state.core.xpToNextLevel =
    xpFor(state.core.level);

  state.core.evolutionProgress =
    clamp(
      state.core.evolutionProgress + 5
    );
}

while (
  state.combat.xp >=
  state.combat.xpToNextLevel
) {
  state.combat.xp -=
    state.combat.xpToNextLevel;

  state.combat.level++;

  state.combat.xpToNextLevel =
    xpFor(state.combat.level);
}

if (
  event.type === 'BATTLE'
) {
  if (
    event.data.result === 'win'
  ) {
    state.combat.wins++;
  }

  if (
    event.data.result === 'loss'
  ) {
    state.combat.losses++;
  }
}

if (
  event.type === 'BATTLE' &&
  event.data.result === 'loss'
) {
  state.personality.courage =
    clamp(
      state.personality.courage + 1
    );
}

if (
  event.type === 'DISCOVERY'
) {
  state.personality.curiosity =
    clamp(
      state.personality.curiosity + 2
    );
}

this.checkEvolution();


}

/**

* Verifica as regras de evolução.
*
* A evolução não é decidida pela IA.
  */
  private checkEvolution(): void {
  const state =
  this.data.state;


if (



  state.core.evolutionStage === 'SOUL' &&
  state.core.level >= 5 &&
  state.bond.value >= 15
) {
  state.core.evolutionStage =
    'AWAKENED';

  this.processInternalEvolution(
    'AWAKENED'
  );

  return;
}

if (
  state.core.evolutionStage === 'AWAKENED' &&
  state.core.level >= 20 &&
  state.bond.value >= 50 &&
  state.personality.curiosity >= 70
) {
  state.core.evolutionStage =
    'MANIFESTED';

  this.processInternalEvolution(
    'MANIFESTED'
  );
}


}

/**

* Registra uma evolução como evento,
* memória e diário.
  */
  private processInternalEvolution(
  stage: string
  ): void {
  const companionName =
  this.data.state.identity.name;


const event =



  this.processEvent(
    'EVOLUTION',
    {
      stage
    },
    {
      coreXp: 0,
      combatXp: 0,
      bond: 0
    }
  );

this.addMemory(
  'SIGNIFICANT',
  `Evolução: ${stage}`,
  `${companionName} alcançou a forma ${stage}.`,
  90,
  [event.id]
);

this.addJournal(
  'MILESTONE',
  `Minha evolução: ${stage}`,
  'Eu mudei. Ainda sou eu, mas agora consigo sentir que estou me tornando algo novo.',
  [event.id]
);


}

/**

* Adiciona uma memória.
  */
  addMemory(
  type: Memory['type'],
  title: string,
  content: string,
  emotionalWeight: number,
  relatedEvents: string[] = []
  ): Memory {
  const archived = new Set(this.data.state.profile.bondHistory?.flatMap(passage => passage.archivedMemoryIds) ?? []);
  const currentBondMemories = this.data.state.memories.filter(memory => !archived.has(memory.id));
  const candidate = { type, title, content };
  const fact = preferenceFact(candidate);
  const latest = [...currentBondMemories].reverse().find(memory => {
    const existing = preferenceFact(memory);
    return fact && existing && fact.slot === existing.slot && !fact.slot.includes(' gosta de');
  });
  // A changed favorite is a new assertion, including changing back to an old
  // value. Only repeated current facts reuse their existing record.
  const duplicate = latest
    ? (sameFact(latest, candidate) ? latest : undefined)
    : currentBondMemories.find(memory => sameFact(memory, candidate));
  if (duplicate) return duplicate;
  const memory: Memory = {
  id: randomUUID(),

  type,

  title,

  content,

  timestamp:
  new Date().toISOString(),

  emotionalWeight,

  relatedEvents
  };


this.data.state.memories.push(



  memory
);

return memory;


}

/**

* Adiciona uma entrada ao diário.
  */
  addJournal(
  type: JournalEntry['type'],
  title: string,
  content: string,
  relatedEvents: string[] = []
  ): JournalEntry {
  const duplicate = this.data.state.journal.find(entry => sameFact(entry, { type, title, content }));
  if (duplicate) return duplicate;
  const journal: JournalEntry = {
  id: randomUUID(),

  type,

  title,

  content,

  timestamp:
  new Date().toISOString(),

  relatedEvents
  };


this.data.state.journal.push(



  journal
);

return journal;


}

/**

* Cria um snapshot confiável.
  */
  createSnapshot(): CompanionSnapshot {
  const last =
  this.data.events.at(-1);


const previous =



  this.data.snapshots.at(-1);

const state =
  structuredClone(
    this.data.state
  );

const stateHash =
  sha256(
    stableJson(state)
  );

const base = {
  id: randomUUID(),

  sequence:
    this.data.snapshots.length + 1,

  createdAt:
    new Date().toISOString(),

  lastEventSequence:
    last?.sequence ?? 0,

  state,

  previousSnapshotHash:
    previous?.integrity.snapshotHash ??
    null,

  stateHash
};

const snapshotHash =
  sha256(
    stableJson(base)
  );

const snapshot: CompanionSnapshot = {
  ...base,

  integrity: {
    previousSnapshotHash:
      base.previousSnapshotHash,

    stateHash,

    snapshotHash
  }
};

this.data.snapshots.push(
  snapshot
);

return snapshot;


}

/**

* Verifica a cadeia local de eventos.
  */
  verifyLocal(): VerificationResult {
  const events =
  this.data.events;


let previous: string | null = null;



let accepted = 0;

for (const event of events) {
  const unsigned = {
    id: event.id,

    sequence:
      event.sequence,

    type:
      event.type,

    importance:
      event.importance,

    timestamp:
      event.timestamp,

    actor:
      event.actor,

    data:
      event.data,

    effects:
      event.effects,

    previousHash:
      event.integrity.previousHash
  };

  const canonical =
    stableJson(unsigned);

  const calculatedHash =
    sha256(canonical);

  const validSignature =
    verifySignature(
      canonical,
      event.integrity.signature,
      this.data.state
        .identity
        .cryptographicIdentity
        .publicKey
    );

  if (
    event.integrity.previousHash !==
      previous ||
    calculatedHash !==
      event.integrity.hash ||
    !validSignature
  ) {
    return {
      valid: false,

      reason:
        `Evento ${event.sequence} inválido.`,

      trustedSequence:
        accepted,

      state:
        this.trustedStateAt(
          accepted
        ),

      acceptedEvents:
        accepted
    };
  }

  previous =
    event.integrity.hash;

  accepted++;
}

return {
  valid: true,

  reason:
    'Histórico local íntegro.',

  trustedSequence:
    accepted,

  state:
    structuredClone(
      this.data.state
    ),

  acceptedEvents:
    accepted
};


}

/**

* Obtém o estado do último snapshot confiável.
  */
  private trustedStateAt(
  sequence: number
  ): CompanionState {
  const snapshot =
  [...this.data.snapshots]
  .reverse()
  .find(
  (item: CompanionSnapshot) =>
  item.lastEventSequence <=
  sequence
  );


if (snapshot) {



  return structuredClone(
    snapshot.state
  );
}

return structuredClone(
  this.data.state
);


}

/**

* Restaura o último snapshot.
  */
  restoreToLastTrustedSnapshot(): CompanionSnapshot {
  const snapshot =
  this.data.snapshots.at(-1);


if (!snapshot) {



  throw new Error(
    'Nenhum snapshot confiável.'
  );
}

this.data.state =
  structuredClone(
    snapshot.state
  );

this.data.events =
  this.data.events.filter(
    (event: CompanionEvent) =>
      event.sequence <=
      snapshot.lastEventSequence
  );

return snapshot;


}

/**

* Substitui o estado por um estado já validado.
  */
  applyTrustedState(
  state: CompanionState
  ): void {
  this.data.state =
  structuredClone(state);

BondEngine.synchronize(

  this.data.state
);

}

getState(): CompanionState {
return structuredClone(
this.data.state
);
}

getPrivateKey(): string {
return this.privateKey;
}

getData(): StoredCompanion {
return structuredClone(
this.data
);
}
}