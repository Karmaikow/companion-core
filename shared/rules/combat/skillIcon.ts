/**
 * Ícone gerado de cada habilidade (quando ninguém enviou uma imagem pela Forja): decide o símbolo, a cor e o
 * modificador pela forma de uso. Puro e determinístico — o desenho em SVG fica no cliente (ui/SkillIcon).
 *
 * Ordem de decisão do símbolo: palavras do nome/slug/efeito do catálogo (pt e en) → estilo do efeito → forma.
 */
import { ELEMENTS } from '../identity';
import { SPELL_CATALOGUE } from './catalogue';
import type { SkillDef, SkillShape, VfxStyle } from './skills';

export type IconMotif =
  | 'spear' | 'flame' | 'shard' | 'bolt' | 'swirl' | 'rock' | 'leaf' | 'drop' | 'poison' | 'moon' | 'sun' | 'claw'
  | 'fist' | 'shield' | 'cross' | 'hourglass' | 'rune' | 'meteor' | 'chain' | 'cage' | 'blood' | 'gear' | 'web'
  | 'hive' | 'feather' | 'echo' | 'prism' | 'portal' | 'wave' | 'resonance' | 'whip' | 'breath' | 'leap' | 'blade'
  | 'spark' | 'bubble'
  // símbolos das técnicas de arma (o golpe, não o elemento)
  | 'thrust' | 'spin' | 'uppercut' | 'arrow' | 'volley' | 'hammer' | 'dagger' | 'staff';

/** como a habilidade chega ao alvo: vira um detalhe atrás do símbolo */
export type IconMod = 'trail' | 'beam' | 'ground' | 'halo' | 'fan' | 'speed' | 'arc' | 'slash';

export interface SkillIconSpec { motif: IconMotif; accent: string; mod: IconMod; heal: boolean; seed: number; /** técnica de arma: ganha a moldura dourada */ technique: boolean }

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// do mais específico para o mais geral: a primeira regra que casar decide
const WORDS: [RegExp, IconMotif][] = [
  [/escudo|guarda|shield|ward|carapace|egide|barreira|protec/, 'shield'],
  [/ampulheta|hourglass|chrono|rewind|stasis|entropy|tempo/, 'hourglass'],
  [/afterimage|echo ?step|miragem|mirage|espelho|mirror/, 'echo'],
  [/singularit|portal|gate|rift|fenda/, 'portal'],
  [/runa|rune|runic|seal|selo|glyph|glifo|script|scroll|spellbreak|silence|silencio|sumi|origami|splatter|ink ?bloom/, 'rune'],
  [/raio de luz|godspear|sunspear|lanca|lance|spear|spine|espinho de pedra|estaca/, 'spear'],
  [/cage|jaula|gaiola|snare|armadilha|lock|brinelock/, 'cage'],
  [/thunderclap|estrondo|trovao/, 'resonance'],
  [/faisca encadeada|chain ?arc|thunder|storm|lightning|voltaic|descarga|choque|fulmin|railcoil|tempest|raio/, 'bolt'],
  [/corrente|tether|soul/, 'chain'],
  [/web|teia|mycel|micel/, 'web'],
  [/hive|wasp|vespa|locust|gafanhot|brood|enxame|colmeia/, 'hive'],
  [/sanguine|hemo|crimson|carmesim|sangue|blood/, 'blood'],
  [/anvil|bigorna|piston|gear|engrenagem|sawline|serra|shrapnel|quench/, 'gear'],
  [/feather|pena|pluma/, 'feather'],
  [/prism|refract|photon|lattice|lens|lente|beam|feixe/, 'prism'],
  [/meteor|cinder|starfall|hail|granizo|avalanche/, 'meteor'],
  [/garra|claw|talon/, 'claw'],
  [/chicote|whip|lash/, 'whip'],
  [/sopro|breath/, 'breath'],
  [/ressonancia|resonan|chord|acorde/, 'resonance'],
  [/bolha|bubble|abyssal/, 'bubble'],
  [/clarao|solar|sun|dawn|aurora|amanhecer|lumen|eclipse/, 'sun'],
  [/redemoinho|cyclone|ciclone|tornado|vortex|slipstream|rasante|vento|wind/, 'swirl'],
  [/lamina|blade|corte|slash|espada|sword/, 'blade'],
  [/gelo|frost|rime|glaci|cristal|crystal|shatter|black ice|rajada fria|fria/, 'shard'],
  [/chama|fogo|fire|flame|brasa|ember|pyro|magma|wildfire|ashen|incend/, 'flame'],
  [/pedr|stone|rock|rocha|boulder|tecton|sinkhole|tremor|obsidian|petrif|ruin/, 'rock'],
  [/venen|toxic|plague|praga|peste|nevoa/, 'poison'],
  [/raiz|vine|thorn|grove|bloom|flor|folha|leaf|polen|spore|esporo/, 'leaf'],
  [/onda|wave|tide|mare|undertow|tiderush/, 'wave'],
  [/agua|jato|water|torrent|geyser/, 'drop'],
  [/sombra|shadow|night|noite|umbral|veu|veil|void|vazio|unmake/, 'moon'],
  [/bote|salto|leap|pulo|pounce/, 'leap'],
  [/golpe|investida|soco|punch|slam|smash|impacto/, 'fist'],
  [/faisca|spark|estrela|star/, 'spark'],
];

// Técnicas de arma: o símbolo é o golpe. A ordem importa (o slug começa pela arma: "lanca-varredura" é giro, não estocada).
const TECH_WORDS: [RegExp, IconMotif][] = [
  [/cajado|varinha/, 'staff'],
  [/chuva|leque|tiro duplo|rajada|cruzada/, 'volley'],
  [/tiro|flecha|arco|disparo/, 'arrow'],
  [/ascendente|lancador|trovejante|martelo do ceu|lunar|meia lua/, 'uppercut'],
  [/giratorio|redemoinho|ciclone|giro|danca|varredura|varre/, 'spin'],
  [/pancada|esmagar|terrestre|maca|sismic|cataclismo/, 'hammer'],
  [/faca|emboscada|cruzado|golpe rapido/, 'dagger'],
  [/cajado|varinha|arcan|runic|selo|caotic|magico|encadeado/, 'staff'],
  [/estocada|perfura|investida|lanca|ceu e terra|rastro|cometa/, 'thrust'],
];

const BY_STYLE: Record<VfxStyle, IconMotif> = {
  impacto: 'fist', chamas: 'flame', gotas: 'drop', folhas: 'leaf', pedras: 'rock', gelo: 'shard',
  raios: 'bolt', vento: 'swirl', luz: 'sun', sombra: 'moon', faiscas: 'spark', veneno: 'poison',
};

const STYLE_ACCENT: Record<VfxStyle, string> = {
  impacto: '#ffd27a', chamas: '#ff7a3d', gotas: '#3fb6ff', folhas: '#7fdc6a', pedras: '#c8a26b', gelo: '#9fe4ff',
  raios: '#ffe066', vento: '#9ff0d8', luz: '#fff1a8', sombra: '#a07cff', faiscas: '#ffd27a', veneno: '#9be15d',
};

const BY_SHAPE: Record<SkillShape, IconMod> = {
  projectile: 'trail', line: 'beam', circle: 'ground', aura: 'halo', cone: 'fan', dash: 'speed', leap: 'arc', melee: 'slash',
};

/** semente estável pelo slug (posição das partículas) */
export function iconSeed(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) { h ^= slug.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function skillIconSpec(skill: Pick<SkillDef, 'slug' | 'name' | 'shape' | 'essence' | 'heal' | 'status' | 'vfx'> & { slot?: SkillDef['slot'] }, fallbackColor = '#9fc9ff'): SkillIconSpec {
  const cat = skill.vfx.catalogue ? SPELL_CATALOGUE.find((c) => c.id === skill.vfx.catalogue) : undefined;
  const text = fold(`${skill.name} ${skill.slug.replace(/-/g, ' ')} ${cat ? `${cat.id} ${cat.label}` : ''}`);
  const technique = skill.slot === 'technique';
  let motif = (technique ? TECH_WORDS.find(([re]) => re.test(text))?.[1] : undefined) ?? WORDS.find(([re]) => re.test(text))?.[1] ?? BY_STYLE[skill.vfx.style] ?? 'spark';
  // proteção de verdade (escudo) vence a palavra; cura sem outro símbolo vira a cruz
  if (skill.status?.key === 'protegido' && motif !== 'bubble') motif = 'shield';
  if (skill.heal > 0 && skill.vfx.style !== 'folhas' && motif !== 'bubble' && motif !== 'shield' && !WORDS.some(([re]) => re.test(text))) motif = 'cross';
  const accent = cat?.accent ?? (skill.essence ? ELEMENTS[skill.essence].glow : skill.vfx.color.startsWith('#') ? skill.vfx.color : skill.vfx.color === 'companion' ? fallbackColor : STYLE_ACCENT[skill.vfx.style] ?? fallbackColor);
  return { motif, accent, mod: BY_SHAPE[skill.shape] ?? 'slash', heal: skill.heal > 0, seed: iconSeed(skill.slug), technique };
}
