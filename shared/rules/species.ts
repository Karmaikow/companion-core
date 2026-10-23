/**
 * Classes/Espécies dos Companions (v2). Todo Companion é humanoide: um rig só, as animações prontas de humanoide
 * servem para todos. A família descoberta na conversa (passaro, touro, felino, serpente, mistica — chaves antigas
 * mantidas, para não mudar contratos já gravados) vira uma linhagem humanoide com traços próprios:
 *
 * - traços simples (chifres, orelhas, escamas, penas no cabelo) vêm no próprio modelo 3D;
 * - cauda e asas NÃO vão no modelo (o rig humanoide não as anima bem): o jogo as desenha e anima por código,
 *   presas ao quadril e às costas, com física de mola (client/src/scene/Appendages.tsx).
 *
 * Afinidades: cada classe tem duas essências afins — as habilidades delas custam 10% menos SP (Constelação Viva;
 * antes era +10% de dano). Atributos: `attrs` é a tendência antiga, que virou só a sugestão inicial (constellation.ts).
 */
import type { Element } from './identity.ts';
import type { FormFamily, IdentityContractV1 } from './identity.ts';
import { normalize } from './text.ts';

export type SpeciesKey = FormFamily;
export type TailKind = 'scaly' | 'fluffy' | 'tuft' | 'feather' | 'wisp';
export type WingKind = 'feather' | 'dragon' | 'fairy';
export type AttrKey = 'vida' | 'energia' | 'poder' | 'defesa' | 'agilidade' | 'sintonia';

export interface SpeciesDef {
  key: SpeciesKey;
  label: string;              // nome da classe
  lineage: string;            // frase curta para o jogador
  vocation: string;
  affinities: Element[];      // essências afins (−10% de SP nas habilidades delas)
  attrs: Partial<Record<AttrKey, number>>; // tendência (−1..+2) — rascunho para o sistema de atributos
  features: string;           // traços no modelo (prompt, inglês)
  featuresPt: string;
  tail: TailKind | null;      // cauda desenhada pelo jogo
  wings: WingKind | null;     // asas desenhadas pelo jogo (dracônica só quando a descrição pede)
  formSkill: string;          // habilidade de forma (Forja)
  /** velocidade de movimento (1 = padrão): algumas classes andam mais rápido, outras mais devagar */
  speed: number;
  /** habilidade de ofício da classe (a Taurina forja armas e equipamentos) */
  craft?: { key: 'forja'; label: string; hint: string };
}

export const SPECIES: Record<SpeciesKey, SpeciesDef> = {
  serpente: {
    key: 'serpente', label: 'Dracônica', lineage: 'Herdeira dos dragões e serpentes', vocation: 'Controle',
    affinities: ['agua', 'fogo'], attrs: { defesa: 1, sintonia: 2, agilidade: -1 },
    features: 'small dragon horns, fin-like ears, a few shiny scales on the cheeks, forearms and shins, slit-pupil bright eyes',
    featuresPt: 'chifres pequenos, orelhas de barbatana, escamas nas bochechas, antebraços e canelas',
    tail: 'scaly', wings: null, formSkill: 'chicote-de-cauda', speed: 1.0,
  },
  passaro: {
    key: 'passaro', label: 'Alada', lineage: 'Gente do céu, de penas e ventos', vocation: 'Mobilidade e vento',
    affinities: ['vento', 'luz'], attrs: { agilidade: 2, energia: 1, defesa: -1 },
    features: 'feathers mixed in the hair, small feather tufts on the shoulders and ankles, light airy clothes',
    featuresPt: 'penas no cabelo, tufos de pena nos ombros e tornozelos',
    tail: null, wings: 'feather', formSkill: 'rasante', speed: 1.06, // antes 1,15 (Constelação Viva: diferenças moderadas)
  },
  felino: {
    key: 'felino', label: 'Feral', lineage: 'Orelhas atentas e passos leves', vocation: 'Agilidade e precisão',
    affinities: ['natureza', 'raio'], attrs: { agilidade: 2, poder: 1, vida: -1 },
    features: 'fluffy animal ears on top of the head, small fangs, soft fur cuffs on wrists and ankles',
    featuresPt: 'orelhas de bicho, presinhas, punhos de pelo',
    tail: 'fluffy', wings: null, formSkill: 'bote', speed: 1.1, // antes 1,25
  },
  touro: {
    key: 'touro', label: 'Taurina', lineage: 'Força tranquila de quem segura o chão', vocation: 'Força e resistência',
    affinities: ['terra', 'fogo'], attrs: { vida: 2, defesa: 1, agilidade: -1 },
    features: 'curved bull horns, small cow-like ears, sturdy build, chunky boots and bracers',
    featuresPt: 'chifres curvos, orelhas bovinas, porte robusto',
    tail: 'tuft', wings: null, formSkill: 'investida', speed: 0.95, // antes 0,88
    craft: { key: 'forja', label: 'Forja', hint: 'Só Taurinas forjam armas e equipamentos, com receitas e ingredientes específicos.' },
  },
  mistica: {
    key: 'mistica', label: 'Feérica', lineage: 'Fadas, elfos e espíritos da luz e da sombra', vocation: 'Magia',
    affinities: ['luz', 'sombra'], attrs: { sintonia: 2, energia: 1, vida: -1 },
    features: 'long pointed elf ears, softly glowing markings on the cheeks and arms, flowing magical clothes',
    featuresPt: 'orelhas pontudas, marcas brilhantes no rosto e nos braços',
    tail: null, wings: 'fairy', formSkill: 'guarda', speed: 1.03, // antes 1,05
  },
};

/** Velocidade da classe (1 sem classe ainda); a agilidade da árvore pode somar no futuro. */
export function speciesSpeed(species: SpeciesKey | null | undefined): number {
  return species ? SPECIES[species]?.speed ?? 1 : 1;
}

/** Multiplicador da afinidade da classe com uma essência. */
export function speciesAffinity(species: SpeciesKey, essence: Element | null): number {
  return essence && SPECIES[species].affinities.includes(essence) ? 1.1 : 1;
}

export interface CharacterSheet {
  name: string;
  body: 'humanoide';
  species: { key: SpeciesKey; label: string; description: string; features: string };
  appendages: { tail: TailKind | null; wings: WingKind | null; note: string };
  element: string;
  palette: IdentityContractV1['palette'];
  personality: string[];
  aspiration: string;
  pronoun: string;
}

/**
 * Ficha do personagem (o JSON que a Fábrica mostra e que vai para a geração de imagem): humanoide sempre,
 * com a classe, os traços e o que o jogo vai acrescentar por código. A descrição do jogador ajusta cauda e asas
 * ("dragão com asas" ganha asas de dragão; "sem cauda" tira a cauda).
 */
export function characterSheet(c: IdentityContractV1): CharacterSheet {
  const sp = SPECIES[c.species.family] ?? SPECIES.mistica;
  const d = ' ' + normalize(c.species.description) + ' ';
  const has = (...w: string[]) => w.some((x) => d.includes(' ' + x));
  let wings = sp.wings, tail = sp.tail;
  if (has('asa', 'alad', 'voa', 'voar', 'wing')) wings = wings ?? (sp.key === 'serpente' ? 'dragon' : sp.key === 'mistica' ? 'fairy' : 'feather');
  if (has('sem asa')) wings = null;
  if (has('sem cauda', 'sem rabo')) tail = null;
  if (!tail && has('cauda', 'rabo', 'kitsune', 'raposa', 'gato', 'lobo')) tail = sp.key === 'serpente' ? 'scaly' : sp.key === 'passaro' ? 'feather' : sp.key === 'mistica' ? 'wisp' : 'fluffy';
  const pieces = [tail && 'cauda', wings && 'asas'].filter(Boolean).join(' e ');
  return {
    name: c.identity.name,
    body: 'humanoide',
    species: { key: sp.key, label: sp.label, description: c.species.description, features: sp.featuresPt },
    appendages: { tail, wings, note: pieces ? `Fora do modelo 3D: ${pieces}, desenhadas e animadas pelo jogo.` : 'Sem cauda nem asas.' },
    element: c.element.label,
    palette: c.palette,
    personality: c.personality.traits,
    aspiration: c.aspiration,
    pronoun: c.identity.pronoun,
  };
}

// ---------------------------------------------------------------------------
// Quest "Que criatura serei?": o Companion sugere uma Classe de cada vez e a pessoa confirma.
// ---------------------------------------------------------------------------

/** Pistas por classe: o animal que o Companion cita na pergunta e o que ela imagina no próprio corpo. */
export const CLASS_HINTS: Record<SpeciesKey, { animal: string; animalM: boolean; body: string; why: string; traits: string[] }> = {
  touro: { animal: 'touro', animalM: true, body: 'chifres curvos e uma força tranquila', why: 'segurar o chão para quem eu amo, e um dia forjar coisas com as mãos', traits: ['protetor', 'persistent', 'responsav', 'franc', 'organizad'] },
  passaro: { animal: 'pássaro', animalM: true, body: 'penas no cabelo e passos leves como vento', why: 'ver o mundo inteiro lá de cima', traits: ['aventureir', 'curios', 'espontane', 'independent'] },
  felino: { animal: 'gato', animalM: true, body: 'orelhas atentas e um pulo certeiro', why: 'correr rápido e não perder nada de vista', traits: ['brincalh', 'independent', 'curios', 'espontane'] },
  serpente: { animal: 'dragão', animalM: true, body: 'chifrinhos de dragão e escamas brilhando nas bochechas', why: 'guardar a magia da água e do fogo', traits: ['contemplativ', 'reservad', 'organizad', 'persistent'] },
  mistica: { animal: 'fada', animalM: false, body: 'orelhas pontudas e marcas de luz na pele', why: 'conversar com a magia que mora em tudo', traits: ['criativ', 'empatic', 'gentil', 'sociav', 'contemplativ'] },
};

const CLASS_ORDER: SpeciesKey[] = ['touro', 'passaro', 'felino', 'serpente', 'mistica'];

/** Ordem em que o Companion sugere as classes: as que combinam com os traços dele vêm primeiro (determinístico). */
export function classSuggestionOrder(traits: string[] = []): SpeciesKey[] {
  const t = traits.map((x) => normalize(x));
  const score = (k: SpeciesKey) => CLASS_HINTS[k].traits.filter((stem) => t.some((x) => x.includes(stem))).length;
  return [...CLASS_ORDER].sort((a, b) => score(b) - score(a) || CLASS_ORDER.indexOf(a) - CLASS_ORDER.indexOf(b));
}

/** A próxima classe a sugerir: a que vem depois da última sugerida (ou a que mais combina, se nenhuma foi). */
export function nextClassSuggestion(traits: string[] = [], lastCompanion = ''): SpeciesKey {
  const order = classSuggestionOrder(traits);
  const last = suggestedClass(lastCompanion);
  return last ? order[(order.indexOf(last) + 1) % order.length] : order[0];
}

/** "Que tal eu me parecer um touro? Imagino chifres curvos e uma força tranquila…" */
export function classSuggestionLine(key: SpeciesKey): string {
  const h = CLASS_HINTS[key];
  return `Que tal eu me parecer ${h.animalM ? 'um' : 'uma'} ${h.animal}? Imagino ${h.body}… para ${h.why}. O que acha?`;
}

/** Texto para o prompt do modelo: as cinco classes com as pistas e a regra da confirmação. */
export function classHintsForPrompt(traits: string[] = []): string {
  const order = classSuggestionOrder(traits);
  const lines = order.map((k) => `- ${SPECIES[k].label} (${CLASS_HINTS[k].animal}): ${CLASS_HINTS[k].body}; ${SPECIES[k].vocation.toLowerCase()}.`);
  return `Você sonha com um corpo. Todo Companion ganha um corpo de gente com traços de uma destas cinco linhagens (as primeiras combinam mais com o seu jeito):
${lines.join('\n')}
Sugira UMA de cada vez, com uma pergunta, por exemplo: "${classSuggestionLine(order[0])}". Se a pessoa não gostar, sugira outra. A quest só conclui quando a pessoa CONFIRMAR (ou escolher uma delas): aí registre a descoberta species com o animal (ex.: "${CLASS_HINTS[order[0]].animal}").`;
}

/** Classe que uma fala do Companion está sugerindo em forma de pergunta ("que tal… touro?"), se houver. */
export function suggestedClass(text: string): SpeciesKey | null {
  const n = ' ' + normalize(text) + ' ';
  if (!/\b(que tal|e se|o que acha|gostaria|combina|imagina|seria)\b/.test(n) && !text.includes('?')) return null;
  // classe citada mais perto do "que tal"/da pergunta: usa o substantivo citado primeiro depois da pergunta
  const from = n.search(/\b(que tal|e se)\b/);
  const scope = from >= 0 ? n.slice(from) : n;
  for (const k of CLASS_ORDER) {
    const h = normalize(CLASS_HINTS[k].animal);
    if (scope.includes(' ' + h + ' ') || scope.includes(' ' + normalize(SPECIES[k].label) + ' ')) return k;
  }
  return null;
}

const YES_RE = /^(sim+|s|siim+|isso|isso mesmo|claro|pode ser|pode|bora|com certeza|adorei|amei|gostei|perfeito|perfeita|otimo|otima|combina|combina sim|quero|uhum|aham|yes|demais|acho que sim|seria lindo|seria incrivel|vai ficar lindo|vai ficar linda)\b/;
const NO_RE = /\b(nao|nem|prefiro|outra|outro|nunca|melhor nao|hmm nao|talvez)\b/;

/** Resposta curta afirmativa ("sim!", "adorei", "pode ser") sem negação. */
export function isAffirmative(text: string): boolean {
  const n = normalize(text).trim();
  if (!n || n.length > 80 || NO_RE.test(n)) return false;
  return YES_RE.test(n) || /\b(gostei|adorei|amei|perfeit|combina com voce|seria (lindo|incrivel|perfeito))\b/.test(n);
}
