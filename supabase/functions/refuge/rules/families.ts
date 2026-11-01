/**
 * Famílias de monstros: uma linhagem do bebê ao MVP, com o mesmo corpo de história, cores e drops que sobem de valor.
 * Entram no Invocador como rascunho (a autora revisa, ajusta e publica); a ficha guarda `family` para agrupar.
 *
 * Os Distorcidos — Linhagem do Cristal Rachado: quando o Cristal Ápice de Áster pulsa forte, lascas se soltam e caem
 * nos Campos Cinzentos. A luz delas apodrece em violeta e ganha vontade própria; crescidas, voltam para sitiar a cidade.
 */
import { sanitizeCreature, type CreatureDef } from './creatures.ts';
import type { OutskirtsRing } from './aster.ts';

export type FamilyTier = 'bebe' | 'jovem' | 'adulto' | 'elite' | 'chefe' | 'mvp';
export const FAMILY_TIERS: Record<FamilyTier, { label: string; hint: string }> = {
  bebe: { label: 'Bebê', hint: 'fraca, em bando, ensina o padrão da família' },
  jovem: { label: 'Jovem', hint: 'primeiro desafio de verdade: avança e marca o chão' },
  adulto: { label: 'Adulto', hint: 'a forma comum da família, já com habilidades encadeadas' },
  elite: { label: 'Elite', hint: 'rara, resistente, protege as outras' },
  chefe: { label: 'Chefe', hint: 'uma por região, respawn longo, drop raro garantido' },
  mvp: { label: 'MVP', hint: 'evento: uma no mundo, muito vida, o melhor drop da família' },
};
export const TIER_ORDER: FamilyTier[] = ['bebe', 'jovem', 'adulto', 'elite', 'chefe', 'mvp'];

export interface CreatureFamily {
  id: string;
  name: string;
  lore: string;
  /** onde cada estágio deve morar quando os Arredores de Áster tiverem monstros (fase 3) */
  rings: Record<FamilyTier, OutskirtsRing>;
  creatures: CreatureDef[];
}

const D = (o: Record<string, unknown>) => sanitizeCreature({ time: 'sempre', biomes: [], ...o })!;

export const DISTORCIDOS: CreatureFamily = {
  id: 'distorcidos',
  name: 'Distorcidos · Linhagem do Cristal Rachado',
  lore: 'Lascas do Cristal Ápice que caíram longe da cidade. A luz apodreceu em violeta; quanto mais crescem, mais querem voltar para o cristal de onde vieram.',
  rings: { bebe: 'campos', jovem: 'campos', adulto: 'trincheiras', elite: 'trincheiras', chefe: 'labirinto', mvp: 'cidade' },
  creatures: [
    D({
      slug: 'lasquinha', name: 'Lasquinha', family: { id: 'distorcidos', tier: 'bebe' },
      description: 'Uma lasca de cristal do tamanho de uma mão, com perninhas de luz. Anda em bando, quica e foge do primeiro susto.',
      essence: 'sombra', body: 'quadruped', motion: 'saltitar', archetype: 'enxame', temperament: 'medroso', style: 'corpo-a-corpo',
      level: [1, 4], stats: { vida: 60, poder: 8, defesa: 6, agilidade: 14, atkSpeed: 1.1 }, size: 0.4, speed: 1.6, aggroRange: 5,
      skills: [{ slug: 'golpe', weight: 3, level: 1 }],
      group: [3, 5], rarity: 1, respawn: 30, lumes: [1, 3], color: '#c4a6ff',
      drops: [{ item: 'Lasca rachada', chance: 0.8, min: 1, max: 2 }, { item: 'Fragmento de Bruma', chance: 0.3, min: 1, max: 1 }],
    }),
    D({
      slug: 'estilhaco', name: 'Estilhaço', family: { id: 'distorcidos', tier: 'jovem' },
      description: 'A lasca que sobreviveu ao bando e ficou pontuda. Marca uma linha no chão e se atira contra quem pisa no seu canto.',
      essence: 'sombra', body: 'quadruped', motion: 'gingar', archetype: 'investidora', temperament: 'territorial', style: 'corpo-a-corpo',
      level: [5, 10], stats: { vida: 80, poder: 11, defesa: 9, agilidade: 16, atkSpeed: 1 }, size: 0.8, speed: 1.7, aggroRange: 8,
      skills: [{ slug: 'golpe', weight: 2, level: 1 }, { slug: 'investida', weight: 1, level: 6, after: 'golpe' }, { slug: 'garra-sombria', weight: 1, level: 8, after: 'investida' }],
      group: [2, 3], rarity: 0.8, respawn: 40, lumes: [3, 8], color: '#a77bff',
      drops: [{ item: 'Lasca rachada', chance: 0.9, min: 1, max: 3 }, { item: 'Pó prismático', chance: 0.25, min: 1, max: 1 }, { item: 'Fragmento de Bruma', chance: 0.4, min: 1, max: 1 }],
    }),
    D({
      slug: 'fendido', name: 'Fendido', family: { id: 'distorcidos', tier: 'adulto' },
      description: 'De pé, alto como uma pessoa, rachado de cima a baixo. Guarda distância e dispara a luz que vaza pela fenda.',
      essence: 'sombra', body: 'biped', motion: 'gingar', archetype: 'atiradora', temperament: 'agressivo', style: 'distancia',
      level: [11, 18], stats: { vida: 90, poder: 12, defesa: 9, agilidade: 14, atkSpeed: 0.9 }, size: 1.6, speed: 1.3, aggroRange: 11,
      skills: [{ slug: 'faisca-de-essencia', weight: 3, level: 11 }, { slug: 'raio-de-luz', weight: 1, level: 13, after: 'faisca-de-essencia' }, { slug: 'clarao', weight: 1, level: 16, after: 'raio-de-luz' }],
      group: [1, 2], rarity: 0.55, respawn: 60, lumes: [8, 18], color: '#9a6cff',
      drops: [{ item: 'Pó prismático', chance: 0.6, min: 1, max: 2 }, { item: 'Lasca rachada', chance: 0.7, min: 2, max: 4 }, { item: 'Núcleo fendido', chance: 0.08, min: 1, max: 1 }],
    }),
    D({
      slug: 'sentinela-facetada', name: 'Sentinela Facetada', family: { id: 'distorcidos', tier: 'elite' },
      description: 'Facetas grossas como escudos. Fica na frente das outras, segura o golpe e só abre a guarda depois de atacar.',
      essence: 'sombra', body: 'biped', motion: 'gingar', archetype: 'guardia', temperament: 'territorial', style: 'misto',
      level: [19, 27], stats: { vida: 120, poder: 10, defesa: 20, agilidade: 10, atkSpeed: 0.7 }, size: 2.4, speed: 1, aggroRange: 9,
      skills: [{ slug: 'golpe', weight: 2, level: 19 }, { slug: 'guarda', weight: 2, level: 19 }, { slug: 'tremor', weight: 1, level: 22, after: 'golpe' }, { slug: 'veu', weight: 1, level: 25, after: 'guarda' }],
      group: [1, 2], rarity: 0.3, respawn: 120, lumes: [20, 40], color: '#8457ff',
      drops: [{ item: 'Núcleo fendido', chance: 0.35, min: 1, max: 1 }, { item: 'Pó prismático', chance: 0.8, min: 2, max: 3 }, { item: 'Lasca rachada', chance: 0.9, min: 3, max: 5 }],
    }),
    D({
      slug: 'matriarca-das-lascas', name: 'Matriarca das Lascas', family: { id: 'distorcidos', tier: 'chefe' },
      description: 'Uma serpente de cristal que arrasta o próprio ninho. Chicoteia com a cauda e cospe lascas; onde ela passa, nascem Lasquinhas.',
      essence: 'sombra', body: 'serpentine', motion: 'rastejar', archetype: 'atiradora', temperament: 'territorial', style: 'misto',
      level: [28, 36], stats: { vida: 160, poder: 10, defesa: 12, agilidade: 12, atkSpeed: 0.8 }, size: 3.5, speed: 1.2, aggroRange: 12,
      skills: [{ slug: 'chicote-de-cauda', weight: 2, level: 28 }, { slug: 'pedregulho', weight: 2, level: 28 }, { slug: 'garra-sombria', weight: 1, level: 30 }, { slug: 'clarao', weight: 1, level: 33, after: 'pedregulho' }],
      group: [1, 1], rarity: 0.12, respawn: 600, lumes: [80, 150], color: '#7a45ff',
      drops: [{ item: 'Núcleo fendido', chance: 0.8, min: 1, max: 2 }, { item: 'Pó prismático', chance: 1, min: 3, max: 5 }, { item: 'Coração do Cristal Rachado', chance: 0.02, min: 1, max: 1 }],
    }),
    D({
      slug: 'coracao-rachado', name: 'O Coração Rachado', family: { id: 'distorcidos', tier: 'mvp' },
      description: 'A lasca mais antiga, do tamanho de uma torre, pulsando no ritmo do Cristal Ápice. Quando ela aparece, os Distorcidos marcham para Áster.',
      essence: 'sombra', body: 'avian', motion: 'flutuar', archetype: 'ancestral', temperament: 'agressivo', style: 'misto',
      level: [45, 50], stats: { vida: 230, poder: 9, defesa: 9, agilidade: 12, atkSpeed: 0.6 }, size: 6, speed: 0.9, aggroRange: 18,
      skills: [{ slug: 'raio-de-luz', weight: 2, level: 45 }, { slug: 'tremor', weight: 2, level: 45 }, { slug: 'veu', weight: 1, level: 46 }, { slug: 'clarao', weight: 1, level: 47, after: 'raio-de-luz' }, { slug: 'ressonancia', weight: 1, level: 48, after: 'clarao' }],
      group: [1, 1], rarity: 0.03, respawn: 3600, lumes: [600, 1200], color: '#ff5ad1', time: 'noite',
      drops: [{ item: 'Coração do Cristal Rachado', chance: 0.6, min: 1, max: 1 }, { item: 'Núcleo fendido', chance: 1, min: 2, max: 4 }, { item: 'Pó prismático', chance: 1, min: 5, max: 8 }],
    }),
  ],
};

export const CREATURE_FAMILIES: CreatureFamily[] = [DISTORCIDOS];
