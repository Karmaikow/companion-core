import { normalize, clampText } from './text.ts';

// ---------------------------------------------------------------------------
// Catálogos (GDD 11 — formas e vocações; 5.1 — descobertas)
// ---------------------------------------------------------------------------

export type FormFamily = 'passaro' | 'touro' | 'felino' | 'serpente' | 'mistica';

export const FORM_FAMILIES: Record<FormFamily, { label: string; vocation: string; aliases: string[] }> = {
  passaro: {
    label: 'Pássaro',
    vocation: 'Mobilidade e vento',
    aliases: ['passaro', 'ave', 'aguia', 'coruja', 'falcao', 'corvo', 'fenix', 'beija flor', 'gaviao', 'arara', 'pena', 'asas', 'grifo'],
  },
  touro: {
    label: 'Touro',
    vocation: 'Força e resistência',
    aliases: ['touro', 'boi', 'bufalo', 'minotauro', 'rinoceronte', 'urso', 'javali', 'carneiro', 'chifre', 'cervo', 'alce'],
  },
  felino: {
    label: 'Felino',
    vocation: 'Agilidade e precisão',
    aliases: ['felino', 'gato', 'gata', 'leao', 'tigre', 'onca', 'pantera', 'lince', 'raposa', 'lobo', 'loba', 'kitsune', 'coelho', 'cachorro', 'cachorrinho', 'cao', 'cadela', 'filhote'],
  },
  serpente: {
    label: 'Serpente',
    vocation: 'Controle',
    aliases: ['serpente', 'cobra', 'naga', 'dragao', 'lagarto', 'enguia', 'basilisco', 'escamas', 'hidra', 'salamandra'],
  },
  mistica: {
    label: 'Mística',
    vocation: 'Magia',
    aliases: ['mistica', 'mistico', 'fada', 'espirito', 'anjo', 'elfo', 'elemental', 'estrela', 'unicornio', 'sereia', 'slime', 'golem'],
  },
};

export type Element = 'fogo' | 'agua' | 'terra' | 'vento' | 'luz' | 'sombra' | 'gelo' | 'raio' | 'natureza';

export const ELEMENTS: Record<Element, { label: string; aliases: string[]; glow: string }> = {
  fogo: { label: 'Fogo', aliases: ['fogo', 'chama', 'brasa', 'lava', 'calor', 'sol'], glow: '#ff7a3d' },
  agua: { label: 'Água', aliases: ['agua', 'mar', 'oceano', 'rio', 'chuva', 'mare'], glow: '#3fb6ff' },
  terra: { label: 'Terra', aliases: ['terra', 'pedra', 'rocha', 'montanha', 'cristal', 'areia'], glow: '#c8a26b' },
  vento: { label: 'Vento', aliases: ['vento', 'ar', 'brisa', 'tempestade', 'ceu', 'nuvem'], glow: '#9ff0d8' },
  luz: { label: 'Luz', aliases: ['luz', 'estrela', 'aurora', 'brilho', 'celestial', 'sagrado'], glow: '#fff1a8' },
  sombra: { label: 'Sombra', aliases: ['sombra', 'trevas', 'noite', 'lua', 'escuridao', 'vazio'], glow: '#a07cff' },
  gelo: { label: 'Gelo', aliases: ['gelo', 'neve', 'frio', 'inverno', 'geada'], glow: '#bfe9ff' },
  raio: { label: 'Raio', aliases: ['raio', 'trovao', 'eletricidade', 'relampago', 'tempestade eletrica'], glow: '#ffe14d' },
  natureza: { label: 'Natureza', aliases: ['natureza', 'planta', 'floresta', 'flor', 'folha', 'vida', 'arvore'], glow: '#7be36b' },
};

/** Nomes de cor em pt-BR -> hex. Hex direto também é aceito. */
export const COLOR_NAMES: Record<string, string> = {
  azul: '#3f8cff', 'azul safira': '#2f6fe0', 'azul claro': '#7fc4ff', 'azul celeste': '#7fc4ff', ciano: '#3fe0e8',
  turquesa: '#3fd2c0', verde: '#4cc46a', 'verde musgo': '#64834b', 'verde esmeralda': '#2fb57a', jade: '#42d9bd',
  vermelho: '#e8443a', rubi: '#d4204a', carmesim: '#b0123a', laranja: '#ff8c3a', coral: '#ff7a6b',
  amarelo: '#ffd23f', dourado: '#edbd54', ouro: '#edbd54', roxo: '#8a4fff', violeta: '#9a5cff', lilas: '#c39bff',
  ametista: '#bf6cff', rosa: '#ee83b4', magenta: '#e040b0', branco: '#f2f2f7', prata: '#c8ccd8', cinza: '#8a8f99',
  preto: '#2a2a35', marrom: '#8a5a3a', bronze: '#c07a3a', 'azul marinho': '#23366e', indigo: '#4b3fbf',
};

export function resolveColor(input: string): { hex: string; name: string } | null {
  const raw = input.trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return { hex: raw.toLowerCase(), name: raw.toLowerCase() };
  const n = normalize(raw).replace(/^(o|a|cor|de|da|do)\s+/g, '');
  // tenta o nome mais longo primeiro ("azul claro" antes de "azul")
  const names = Object.keys(COLOR_NAMES).sort((a, b) => b.length - a.length);
  for (const name of names) {
    if (n === name || n.includes(name)) return { hex: COLOR_NAMES[name], name };
  }
  return null;
}

export function resolveForm(input: string): FormFamily | null {
  // O substantivo citado primeiro define a família ("raposa com asas" -> felino).
  const n = ' ' + normalize(input) + ' ';
  let best: { family: FormFamily; at: number } | null = null;
  for (const [family, def] of Object.entries(FORM_FAMILIES) as [FormFamily, (typeof FORM_FAMILIES)[FormFamily]][]) {
    for (const a of def.aliases) {
      for (const probe of [' ' + a + ' ', ' ' + a + 's ', ' ' + a.replace(/ao$/, 'oes') + ' ']) {
        const at = n.indexOf(probe);
        if (at >= 0 && (!best || at < best.at)) best = { family, at };
      }
    }
  }
  return best?.family ?? null;
}

export function resolveElement(input: string): Element | null {
  const n = ' ' + normalize(input) + ' ';
  for (const [el, def] of Object.entries(ELEMENTS) as [Element, (typeof ELEMENTS)[Element]][]) {
    if (def.aliases.some((a) => n.includes(' ' + a + ' '))) return el;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Traços -> tendências comportamentais (alimentam a autonomia no MVP 2)
// ---------------------------------------------------------------------------

export type Tendency = 'exploracao' | 'combate' | 'producao' | 'social' | 'descanso' | 'cautela';

const TRAIT_TENDENCIES: [string[], Partial<Record<Tendency, number>>][] = [
  [['curios', 'aventureir', 'explorador', 'inquiet'], { exploracao: 2 }],
  [['corajos', 'valente', 'ousad', 'competitiv', 'feroz'], { combate: 2, cautela: -1 }],
  [['gentil', 'carinhos', 'amavel', 'empatic', 'amigavel', 'sociavel', 'alegre'], { social: 2 }],
  [['protetor', 'leal', 'fiel'], { combate: 1, social: 1 }],
  [['calm', 'paciente', 'sereno', 'tranquil', 'preguicos'], { descanso: 2, cautela: 1 }],
  [['trabalhador', 'dedicad', 'determinad', 'organizad', 'criativ', 'artista'], { producao: 2 }],
  [['timid', 'cautelos', 'medros', 'prudente'], { cautela: 2, combate: -1 }],
  [['sonhador', 'imaginativ', 'distraid'], { exploracao: 1, descanso: 1 }],
  [['travess', 'brincalh', 'engracad'], { social: 1, exploracao: 1 }],
];

export function traitTendencies(traits: string[]): Record<Tendency, number> {
  const out: Record<Tendency, number> = { exploracao: 0, combate: 0, producao: 0, social: 0, descanso: 0, cautela: 0 };
  for (const t of traits) {
    const n = normalize(t);
    for (const [stems, weights] of TRAIT_TENDENCIES) {
      if (stems.some((s) => n.includes(s))) {
        for (const [k, v] of Object.entries(weights) as [Tendency, number][]) out[k] += v;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Paleta derivada da cor favorita (GDD 5.1 "Minha cor" -> paleta visual)
// ---------------------------------------------------------------------------

function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

export interface Palette { primary: string; secondary: string; accent: string; shadow: string; glow: string }

export function derivePalette(primaryHex: string, element: Element | null): Palette {
  const [h, s, l] = hexToHsl(primaryHex);
  const sat = Math.max(0.35, s);
  return {
    primary: primaryHex,
    secondary: hslToHex((h + 25) % 360, sat * 0.85, Math.min(0.85, l + 0.18)),
    accent: hslToHex((h + 180) % 360, Math.min(1, sat + 0.1), 0.6),
    shadow: hslToHex((h + 340) % 360, sat * 0.7, Math.max(0.12, l - 0.28)),
    glow: element ? ELEMENTS[element].glow : hslToHex(h, 1, 0.75),
  };
}

// ---------------------------------------------------------------------------
// Contrato JSON de identidade (GDD 5.2) — versionado
// ---------------------------------------------------------------------------

export interface Discoveries {
  name?: string;
  species?: string; // descrição livre ("raposa alada")
  form?: FormFamily;
  color?: string; // hex
  colorName?: string;
  traits?: string[];
  element?: Element;
  playerAddress?: string; // como chama o jogador
  dream?: string;
  pronoun?: 'ela' | 'ele';
  playerName?: string; // nome que o jogador informou na criação
  playerPronoun?: 'ele' | 'ela' | 'neutro'; // como a pessoa prefere ser tratada
}

export interface IdentityContractV1 {
  schema: 'companion-identity';
  version: 1;
  companionId: string;
  createdAt: string;
  identity: { name: string; pronoun: 'ela' | 'ele' | 'elu' };
  species: { description: string; family: FormFamily; vocation: string };
  form: { stage: 1; anatomy: 'criatura-pequena'; proportions: { headRatio: number; height: number } };
  palette: Palette;
  personality: { traits: string[]; tendencies: Record<Tendency, number> };
  element: { key: Element; label: string };
  bond: { playerAddress: string; level: number };
  aspiration: string;
  visualConstraints: string[];
  seed: number;
}

/** Hash determinístico (FNV-1a) usado como seed visual estável. */
export function stableSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function buildIdentityContract(
  companionId: string,
  d: Required<Pick<Discoveries, 'name' | 'species' | 'form' | 'color' | 'traits' | 'element' | 'playerAddress' | 'dream'>>,
  bondLevel: number,
  pronoun: 'ela' | 'ele' | 'elu' = 'ela',
  now = new Date(),
): IdentityContractV1 {
  const fam = FORM_FAMILIES[d.form];
  return {
    schema: 'companion-identity',
    version: 1,
    companionId,
    createdAt: now.toISOString(),
    identity: { name: clampText(d.name, 40), pronoun },
    species: { description: clampText(d.species, 80), family: d.form, vocation: fam.vocation },
    form: { stage: 1, anatomy: 'criatura-pequena', proportions: { headRatio: 0.45, height: 0.6 } },
    palette: derivePalette(d.color, d.element),
    personality: { traits: d.traits.slice(0, 5), tendencies: traitTendencies(d.traits) },
    element: { key: d.element, label: ELEMENTS[d.element].label },
    bond: { playerAddress: clampText(d.playerAddress, 40), level: bondLevel },
    aspiration: clampText(d.dream, 200),
    visualConstraints: [
      'silhueta legível em 64px',
      'cor primária ocupa ≥ 40% da área',
      `traço de família ${fam.label.toLowerCase()} visível de frente e de lado`,
      'sem texto, logotipos ou personagens existentes',
    ],
    seed: stableSeed(companionId + ':' + d.name),
  };
}
