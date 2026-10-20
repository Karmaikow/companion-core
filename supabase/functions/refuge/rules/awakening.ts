import type { GameConfig } from './config.ts';
import type { Discoveries } from './identity.ts';
import type { QuestState } from './quests.ts';

export type Stage = 'particles' | 'awakened';

export interface AwakeningCheck { ready: boolean; questsDone: number; questsNeeded: number; bondLevel: number; bondNeeded: number; missing: string[] }

export function checkAwakening(quests: QuestState[], d: Discoveries, bondLevel: number, cfg: GameConfig): AwakeningCheck {
  const questsDone = quests.filter((q) => q.status === 'done').length;
  const missing: string[] = [];
  const required: (keyof Discoveries)[] = ['name', 'species', 'form', 'color', 'traits', 'element', 'playerAddress', 'dream'];
  for (const k of required) if (d[k] == null || (Array.isArray(d[k]) && (d[k] as unknown[]).length === 0)) missing.push(k);
  if (questsDone < cfg.awakeningQuests) missing.push(`quests ${questsDone}/${cfg.awakeningQuests}`);
  if (bondLevel < cfg.awakeningBondLevel) missing.push(`vínculo ${bondLevel}/${cfg.awakeningBondLevel}`);
  return {
    ready: missing.length === 0,
    questsDone,
    questsNeeded: cfg.awakeningQuests,
    bondLevel,
    bondNeeded: cfg.awakeningBondLevel,
    missing,
  };
}
