import { randomUUID } from 'node:crypto';
import type { CompanionSnapshot, CompanionState, CompanionEvent, VerificationResult } from '../models/types.js';
import { sha256, stableJson, verifySignature } from '../crypto/crypto.js';

export class MockWorldServer {
  private registry = new Map<string, { publicKey: string; trustedSnapshot: CompanionSnapshot }>();

  register(snapshot: CompanionSnapshot) {
    this.registry.set(snapshot.state.identity.id, {
      publicKey: snapshot.state.identity.cryptographicIdentity.publicKey,
      trustedSnapshot: structuredClone(snapshot)
    });
  }

  verify(state: CompanionState, events: CompanionEvent[]): VerificationResult {
    const record = this.registry.get(state.identity.id);
    if (!record) return { valid:false, reason:'Companion não registrada no mundo.', trustedSequence:0, state:structuredClone(state), acceptedEvents:0 };
    if (record.publicKey !== state.identity.cryptographicIdentity.publicKey) {
      return { valid:false, reason:'Identidade pública divergente.', trustedSequence:record.trustedSnapshot.lastEventSequence, state:structuredClone(record.trustedSnapshot.state), acceptedEvents:record.trustedSnapshot.lastEventSequence };
    }

    let previous: string | null = null;
    for (const e of events) {
      const unsigned = { id:e.id, sequence:e.sequence, type:e.type, importance:e.importance, timestamp:e.timestamp, actor:e.actor, data:e.data, effects:e.effects, previousHash:e.integrity.previousHash };
      const canonical = stableJson(unsigned);
      if (e.integrity.previousHash !== previous || sha256(canonical) !== e.integrity.hash || !verifySignature(canonical,e.integrity.signature,record.publicKey)) {
        return { valid:false, reason:`Histórico inválido no evento ${e.sequence}.`, trustedSequence:record.trustedSnapshot.lastEventSequence, state:structuredClone(record.trustedSnapshot.state), acceptedEvents:record.trustedSnapshot.lastEventSequence };
      }
      previous = e.integrity.hash;
    }

    const maxCore = record.trustedSnapshot.state.core.level + 50;
    const maxCombat = record.trustedSnapshot.state.combat.level + 50;
    if (state.core.level > maxCore || state.combat.level > maxCombat) {
      return { valid:false, reason:'Progressão excede as regras do mundo.', trustedSequence:record.trustedSnapshot.lastEventSequence, state:structuredClone(record.trustedSnapshot.state), acceptedEvents:record.trustedSnapshot.lastEventSequence };
    }

    const snap: CompanionSnapshot = {
      id: randomUUID(), sequence:record.trustedSnapshot.sequence + 1, createdAt:new Date().toISOString(),
      lastEventSequence:events.at(-1)?.sequence ?? 0, state:structuredClone(state),
      integrity:{ previousSnapshotHash:record.trustedSnapshot.integrity.snapshotHash, stateHash:sha256(stableJson(state)), snapshotHash:'' }
    };
    snap.integrity.snapshotHash = sha256(stableJson(snap));
    record.trustedSnapshot = snap;
    return { valid:true, reason:'Estado aceito pelo mundo.', trustedSequence:snap.lastEventSequence, state:structuredClone(state), acceptedEvents:events.length };
  }

  verificationEvent(companionId:string) {
    return { type:'WORLD_VERIFICATION', companionId, reward:{ type:'TITLE', value:'Companion Verificada' }, issuedAt:new Date().toISOString() };
  }
}
