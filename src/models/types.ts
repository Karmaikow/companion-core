import type {
  CompanionProfile
} from './companion-profile.js';

export type {
  CompanionProfile
} from './companion-profile.js';


/*
 * ============================================================
 * EVOLUTION
 * ============================================================
 */

export type EvolutionStage =
  | 'SOUL'
  | 'AWAKENED'
  | 'MANIFESTED'
  | 'ASCENDED';


/*
 * ============================================================
 * RELATIONSHIP
 * ============================================================
 */

export type RelationshipType =
  | 'STRANGER'
  | 'ACQUAINTANCE'
  | 'COMPANION'
  | 'TRUSTED'
  | 'FAMILY';


/*
 * ============================================================
 * MEMORY
 * ============================================================
 */

export type MemoryType =
  | 'EPISODIC'
  | 'SIGNIFICANT'
  | 'IDENTITY_FORMING';


/*
 * ============================================================
 * EVENTS
 * ============================================================
 */

export type EventType =
  | 'BOND_PASSAGE'
  | 'GENESIS'
  | 'CONVERSATION'
  | 'DISCOVERY'
  | 'EXPLORATION'
  | 'BATTLE'
  | 'TRAINING'
  | 'SOCIAL'
  | 'ACHIEVEMENT'
  | 'EVOLUTION'
  | 'ARTIFACT'
  | 'SYSTEM'
  | 'VERIFICATION';


export type EventImportance =
  | 'NORMAL'
  | 'SIGNIFICANT'
  | 'IDENTITY_FORMING';


/*
 * ============================================================
 * PERSONALITY
 * ============================================================
 */

export interface Personality {

  loyalty: number;

  curiosity: number;

  humor: number;

  courage: number;

  empathy: number;

  autonomy: number;
}


/*
 * ============================================================
 * CORE PROGRESS
 * ============================================================
 */

export interface CoreProgress {

  level: number;

  xp: number;

  xpToNextLevel: number;

  evolutionStage: EvolutionStage;

  evolutionProgress: number;
}


/*
 * ============================================================
 * COMBAT PROGRESS
 * ============================================================
 */

export interface CombatProgress {

  level: number;

  xp: number;

  xpToNextLevel: number;

  wins: number;

  losses: number;
}


/*
 * ============================================================
 * BOND
 * ============================================================
 */

export interface Bond {

  value: number;

  relationship: RelationshipType;
}


/*
 * ============================================================
 * MEMORY
 * ============================================================
 */

export interface Memory {

  id: string;

  type: MemoryType;

  title: string;

  content: string;

  timestamp: string;

  emotionalWeight: number;

  relatedEvents: string[];
}


/*
 * ============================================================
 * JOURNAL
 * ============================================================
 */

export interface JournalEntry {

  id: string;

  title: string;

  content: string;

  timestamp: string;

  type:
    | 'FOUNDATIONAL'
    | 'MILESTONE'
    | 'STORY';

  relatedEvents: string[];
}


/*
 * ============================================================
 * IDENTITY
 * ============================================================
 */

export interface CompanionIdentity {

  id: string;

  name: string;

  createdAt: string;

  genesis: {

    version: string;

    initialForm: EvolutionStage;
  };

  cryptographicIdentity: {

    publicKey: string;

    algorithm: 'Ed25519';
  };
}


/*
 * ============================================================
 * COMPANION STATE
 * ============================================================
 */

export interface CompanionState {

  identity: CompanionIdentity;

  profile: CompanionProfile;

  core: CoreProgress;

  combat: CombatProgress;

  bond: Bond;

  personality: Personality;

  memories: Memory[];

  journal: JournalEntry[];

  achievements: string[];

  inventory: string[];

  discoveries: string[];
}


/*
 * ============================================================
 * EVENT EFFECTS
 * ============================================================
 */

export interface EventEffects {

  coreXp: number;

  combatXp: number;

  bond: number;
}


/*
 * ============================================================
 * COMPANION EVENT
 * ============================================================
 */

export interface CompanionEvent {

  id: string;

  sequence: number;

  type: EventType;

  importance: EventImportance;

  timestamp: string;

  actor: string;

  data: Record<string, unknown>;

  effects: EventEffects;

  integrity: {

    previousHash: string | null;

    hash: string;

    signature: string;
  };
}


/*
 * ============================================================
 * SNAPSHOT
 * ============================================================
 */

export interface CompanionSnapshot {

  id: string;

  sequence: number;

  createdAt: string;

  lastEventSequence: number;

  state: CompanionState;

  integrity: {

    previousSnapshotHash: string | null;

    stateHash: string;

    snapshotHash: string;
  };
}


/*
 * ============================================================
 * STORED COMPANION
 * ============================================================
 */

export interface StoredCompanion {

  state: CompanionState;

  events: CompanionEvent[];

  snapshots: CompanionSnapshot[];
}


/*
 * ============================================================
 * VERIFICATION
 * ============================================================
 */

export interface VerificationResult {

  valid: boolean;

  reason: string;

  trustedSequence: number;

  state: CompanionState;

  acceptedEvents: number;
}