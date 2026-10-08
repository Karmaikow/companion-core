import type {
    Bond,
    CompanionState,
    RelationshipType
  } from '../models/types.js';
  
  export class BondEngine {
    private static readonly THRESHOLDS: Array<{
      minimum: number;
      relationship: RelationshipType;
    }> = [
      {
        minimum: 800,
        relationship: 'FAMILY'
      },
      {
        minimum: 500,
        relationship: 'TRUSTED'
      },
      {
        minimum: 200,
        relationship: 'COMPANION'
      },
      {
        minimum: 50,
        relationship: 'ACQUAINTANCE'
      },
      {
        minimum: 0,
        relationship: 'STRANGER'
      }
    ];
  
    static relationshipForBond(value: number): RelationshipType {
      const threshold = this.THRESHOLDS.find(
        item => value >= item.minimum
      );
  
      return threshold?.relationship ?? 'STRANGER';
    }
  
    static synchronize(state: CompanionState): void {
      state.bond.relationship = this.relationshipForBond(
        state.bond.value
      );
    }
  
    static apply(bond: Bond, amount: number): void {
      bond.value = Math.max(
        0,
        Math.min(1000, bond.value + amount)
      );
  
      bond.relationship = this.relationshipForBond(
        bond.value
      );
    }
  }