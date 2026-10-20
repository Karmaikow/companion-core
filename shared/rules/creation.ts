/**
 * Ritual de criação — portado do projeto anterior (creation-options) e adaptado ao GDD:
 * o jogador define nome, pronome e personalidade antes do primeiro encontro.
 * Nome e traços já concluem as quests "Quem sou eu?" e "O que sinto?";
 * cor, forma, essência, laço e sonho continuam sendo descobertos na conversa.
 */
import type { Discoveries } from './identity.ts';
import { validateDiscovery } from './quests.ts';
import { DEFAULT_CONFIG } from './config.ts';
import { clampText, normalize } from './text.ts';

export type Pronoun = 'ela' | 'ele';

export interface TraitOption { id: string; f: string; m: string; description: string }
export interface TraitGroup { id: string; title: string; exclusive: boolean; options: TraitOption[] }

const t = (id: string, f: string, m: string, description: string): TraitOption => ({ id, f, m, description });

export const TRAIT_GROUPS: TraitGroup[] = [
  { id: 'horizonte', title: 'Horizonte', exclusive: false, options: [
    t('curiosa', 'Curiosa', 'Curioso', 'Gosta de perguntar, investigar e descobrir o que ainda não conhece.'),
    t('criativa', 'Criativa', 'Criativo', 'Imagina soluções, histórias e possibilidades diferentes.'),
    t('aventureira', 'Aventureira', 'Aventureiro', 'Tem vontade de explorar e encarar desafios novos.'),
    t('contemplativa', 'Contemplativa', 'Contemplativo', 'Prefere observar e refletir antes de agir.'),
  ] },
  { id: 'proposito', title: 'Propósito', exclusive: false, options: [
    t('organizada', 'Organizada', 'Organizado', 'Gosta de ordem, planos e objetivos claros.'),
    t('persistente', 'Persistente', 'Persistente', 'Continua tentando mesmo diante de dificuldades.'),
    t('responsavel', 'Responsável', 'Responsável', 'Leva compromissos a sério e pensa nas consequências.'),
    t('espontanea', 'Espontânea', 'Espontâneo', 'Adapta os planos e segue ideias que surgem no momento.'),
  ] },
  { id: 'presenca', title: 'Presença', exclusive: false, options: [
    t('sociavel', 'Sociável', 'Sociável', 'Busca companhia e gosta de compartilhar experiências.'),
    t('brincalhona', 'Brincalhona', 'Brincalhão', 'Expressa afeto com humor e brincadeiras.'),
    t('reservada', 'Reservada', 'Reservado', 'Se abre aos poucos e valoriza momentos tranquilos.'),
    t('independente', 'Independente', 'Independente', 'Valoriza iniciativa própria e espaço para decidir.'),
  ] },
  { id: 'afeto', title: 'Afeto', exclusive: false, options: [
    t('gentil', 'Gentil', 'Gentil', 'Procura tratar os outros com cuidado e delicadeza.'),
    t('empatica', 'Empática', 'Empático', 'Tenta compreender o que os outros sentem.'),
    t('protetora', 'Protetora', 'Protetor', 'Deseja cuidar de quem ama diante de dificuldades.'),
    t('franca', 'Franca', 'Franco', 'Prefere falar com sinceridade e clareza.'),
  ] },
  { id: 'mare', title: 'Maré interior', exclusive: false, options: [
    t('serena', 'Serena', 'Sereno', 'Costuma enfrentar situações com calma.'),
    t('paciente', 'Paciente', 'Paciente', 'Respeita o tempo das coisas e dos outros.'),
    t('sensivel', 'Sensível', 'Sensível', 'Percebe nuances e sente emoções com profundidade.'),
    t('intensa', 'Intensa', 'Intenso', 'Expressa emoções e entusiasmo com muita energia.'),
  ] },
  { id: 'chama', title: 'Chama · temperamento', exclusive: true, options: [
    t('sanguinea', 'Sanguínea', 'Sanguíneo', 'Comunicativa, otimista e cheia de entusiasmo.'),
    t('colerica', 'Colérica', 'Colérico', 'Decidida, enérgica e orientada à ação.'),
    t('melancolica', 'Melancólica', 'Melancólico', 'Reflexiva, sensível e atenta aos detalhes.'),
    t('fleumatica', 'Fleumática', 'Fleumático', 'Tranquila, constante e conciliadora.'),
  ] },
  { id: 'ritmo', title: 'Ritmo da jornada', exclusive: true, options: [
    t('planejadora', 'Planejadora', 'Planejador', 'Gosta de definir etapas antes de começar.'),
    t('exploradora', 'Exploradora', 'Explorador', 'Prefere descobrir o caminho enquanto avança.'),
  ] },
];

export const TRAIT_BY_ID: Record<string, TraitOption & { group: TraitGroup }> = Object.fromEntries(
  TRAIT_GROUPS.flatMap((g) => g.options.map((o) => [o.id, { ...o, group: g }])),
);

export const MIN_TRAITS = 2;
export const MAX_TRAITS = 5;

export function traitLabel(id: string, pronoun: Pronoun): string {
  const o = TRAIT_BY_ID[id];
  return o ? (pronoun === 'ele' ? o.m : o.f) : id;
}

export type PlayerPronoun = 'ele' | 'ela' | 'neutro';
export interface CompanionSetup { name: string; pronoun: Pronoun; playerName: string; playerPronoun?: PlayerPronoun; traits: string[] }

export type SetupResult =
  | { ok: true; discoveries: Discoveries; traitIds: string[] }
  | { ok: false; error: string };

const PLAYER_NAME_RE = /^[\p{L}][\p{L}\p{M}' .-]{0,29}$/u;

/** Valida o ritual de criação. Mesmas regras no servidor e no modo local. */
export function validateSetup(input: unknown): SetupResult {
  const s = (input ?? {}) as Partial<CompanionSetup>;
  const pronoun: Pronoun = s.pronoun === 'ele' ? 'ele' : 'ela';
  const named = validateDiscovery({ quest: 'identity', value: clampText(s.name, 24) }, { bondLevel: 1, cfg: DEFAULT_CONFIG });
  if (!named.ok) return { ok: false, error: 'Escolha um nome de 2 a 24 letras para o seu Companion.' };
  const playerName = clampText(s.playerName, 30).replace(/\s+/g, ' ').trim();
  if (!PLAYER_NAME_RE.test(playerName) || playerName.length < 2) return { ok: false, error: 'Diga como você se chama (2 a 30 letras).' };
  if (normalize(playerName) === normalize(named.patch.name ?? '')) return { ok: false, error: 'Seu nome e o do Companion precisam ser diferentes.' };
  const ids = Array.isArray(s.traits) ? [...new Set(s.traits.filter((x): x is string => typeof x === 'string'))] : [];
  if (ids.some((id) => !TRAIT_BY_ID[id])) return { ok: false, error: 'Traço de personalidade desconhecido.' };
  if (ids.length < MIN_TRAITS || ids.length > MAX_TRAITS) return { ok: false, error: `Escolha de ${MIN_TRAITS} a ${MAX_TRAITS} traços.` };
  for (const g of TRAIT_GROUPS.filter((g) => g.exclusive)) {
    if (g.options.filter((o) => ids.includes(o.id)).length > 1) return { ok: false, error: `Escolha só uma opção em "${g.title}".` };
  }
  return {
    ok: true,
    traitIds: ids,
    discoveries: { name: named.patch.name, pronoun, playerName, playerPronoun: s.playerPronoun === 'ele' || s.playerPronoun === 'ela' ? s.playerPronoun : 'neutro', traits: ids.map((id) => traitLabel(id, pronoun).toLowerCase()) },
  };
}
