/**
 * O Refúgio cresce com o Companion (GDD: o espaço é moldado pela relação).
 * Começa só com o altar e o círculo mágico; cada passo do vínculo acrescenta algo.
 * Função pura: a cena 3D só desenha o que esta lista manda.
 */
import type { Discoveries, Element } from './identity.ts';
import type { QuestState } from './quests.ts';

export interface RefugeFeatures {
  /** Lanternas flutuantes (0–4): uma por nível de vínculo a partir do 2. */
  lanterns: number;
  /** Cristais da cor do Companion em volta do altar ("Minha cor"). */
  crystals: boolean;
  /** Estantes (0–2): memórias e diário pedem um lugar para morar. */
  shelves: number;
  /** Elemento da essência materializado no Refúgio. */
  element: Element | null;
  /** Tapete e almofadas ("Primeiro laço"). */
  nest: boolean;
  /** Janela para o mundo lá fora ("Primeiro sonho"). */
  window: boolean;
  /** Plantas (0–5). */
  plants: number;
  /** Caldeirão (primeira receita). */
  cauldron: boolean;
  /** Paredes visíveis: o Refúgio "acende" conforme cresce (0–1). */
  walls: number;
}

export function refugeFeatures(d: Discoveries, quests: QuestState[], bondLevel: number, extras: { recipes?: number; diary?: number } = {}): RefugeFeatures {
  const done = (k: string) => quests.some((q) => q.key === k && q.status === 'done');
  const element = done('essence') ? d.element ?? null : null;
  const shelves = (bondLevel >= 3 || (extras.diary ?? 0) > 0 ? 1 : 0) + (bondLevel >= 5 ? 1 : 0);
  let plants = bondLevel >= 4 ? 1 : 0;
  if (element === 'natureza' || element === 'terra') plants += 3;
  const steps = [done('color'), done('species'), !!element, done('bond'), done('dream')].filter(Boolean).length;
  return {
    lanterns: Math.max(0, Math.min(4, bondLevel - 1)),
    crystals: done('color') && !!d.color,
    shelves,
    element,
    nest: done('bond'),
    window: done('dream'),
    plants: Math.min(5, plants),
    cauldron: (extras.recipes ?? 0) > 0,
    walls: Math.min(1, 0.25 + steps * 0.15 + Math.min(4, bondLevel - 1) * 0.05),
  };
}
