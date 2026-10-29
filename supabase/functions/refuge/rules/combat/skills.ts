import { isSchool, type SchoolId } from './schools.ts';
import { SPELL_CATALOGUE, validSpellId } from './catalogue';
/**
 * Forja de Batalha — habilidades genéricas. Uma habilidade não pertence a um Companion: ela pede uma essência (ou
 * nenhuma) e um ou mais tipos de corpo (ou todos). Qualquer Companion que combine com ela pode usá-la; a cor vem da
 * essência ou do próprio Companion, e a animação é sempre um dos clipes que todo rig tem (ataque, pulo...).
 * A diferença entre habilidades está na forma (cone, linha, área...), nos efeitos e nos números — nunca em
 * animações únicas, para não ficar estranho em corpos diferentes (ver claude/batalha-v1.md).
 */
import { sanitizeVfxLayers, type VfxLayerDef } from './vfx.ts';
import type { Element } from '../identity.ts';
import type { BodyPlan } from '../art.ts';
import type { AnimKind } from '../anim.ts';
import type { SpeciesKey } from '../species.ts';

export type SkillSlot = 'basic' | 'essence' | 'form' | 'supreme';
export type SkillShape = 'melee' | 'cone' | 'line' | 'circle' | 'projectile' | 'aura' | 'dash' | 'leap';
export type StatusKey = 'encharcado' | 'queimando' | 'enraizado' | 'lento' | 'ofuscado' | 'sombreado' | 'atordoado' | 'protegido' | 'acelerado' | 'envenenado';
export type VfxStyle = 'impacto' | 'chamas' | 'gotas' | 'folhas' | 'pedras' | 'gelo' | 'raios' | 'vento' | 'luz' | 'sombra' | 'faiscas' | 'veneno';

export interface SkillDef {
  slug: string;
  iconUrl?: string;
  learning?: { school: SchoolId; rank: 1 | 2 | 3 | 4 | 5 };
  name: string;
  description: string;
  slot: SkillSlot;
  essence: Element | null;       // null = neutra (usa a cor do Companion)
  classes: SpeciesKey[];         // classes de Companion (humanoides) que podem usar; vazio + bodies vazio = todos
  bodies: BodyPlan[];            // corpos de criatura que podem usar (monstros); vazio = todos
  shape: SkillShape;
  range: number;                 // m — alcance (golpe, linha, projétil, investida, salto)
  radius: number;                // m — raio da área (círculo, aura, ponto de queda) ou largura da linha
  angle: number;                 // graus — abertura do cone
  power: number;                 // dano base (0 = sem dano)
  heal: number;                  // cura base (0 = sem cura)
  energy: number;                // custo
  cooldown: number;              // s
  windup: number;                // s — tempo do aviso no chão antes do efeito
  status: { key: StatusKey; chance: number; seconds: number } | null;
  anim: AnimKind;
  vfx: { style: VfxStyle; color: 'essence' | 'companion' | string; ground: boolean; layers?: VfxLayerDef[]; catalogue?: string };
  unlockBond: number;            // nível de vínculo para entrar no kit
  /** modalidade do dano (Constelação Viva): física usa Força e a defesa física; mágica, Magia e a resistência; híbrida divide 50/50. Sem o campo, vale a regra pela forma (inferModality). */
  modality?: 'fisica' | 'magica' | 'hibrida';
}

export const SLOTS: Record<SkillSlot, string> = { basic: 'Golpe básico', essence: 'Habilidade de essência', form: 'Habilidade de forma', supreme: 'Sintonia suprema' };
export const SHAPES: Record<SkillShape, string> = {
  melee: 'Golpe (corpo a corpo)', cone: 'Cone', line: 'Linha', circle: 'Área no alvo', projectile: 'Projétil', aura: 'Aura (em volta de si)', dash: 'Investida', leap: 'Salto',
};
export const STATUSES: Record<StatusKey, { label: string; effect: string; good: boolean }> = {
  encharcado: { label: 'Encharcado', effect: '–20% agilidade; com raio vira Choque, com gelo vira Congelado', good: false },
  queimando: { label: 'Queimando', effect: 'dano por segundo; com vento vira Redemoinho de chamas', good: false },
  enraizado: { label: 'Enraizado', effect: 'não se move; fogo consome com dano dobrado', good: false },
  lento: { label: 'Lento', effect: '–30% velocidade', good: false },
  ofuscado: { label: 'Ofuscado', effect: 'erra mais', good: false },
  sombreado: { label: 'Sombreado', effect: 'recebe +15% de dano', good: false },
  atordoado: { label: 'Atordoado', effect: 'para por um instante', good: false },
  protegido: { label: 'Protegido', effect: '–40% de dano recebido', good: true },
  acelerado: { label: 'Acelerado', effect: '+30% velocidade e recarga', good: true },
  envenenado: { label: 'Envenenado', effect: 'dano por segundo que aumenta a cada nova dose (até 3); luz purifica', good: false },
};
export const VFX_STYLES: Record<VfxStyle, string> = {
  impacto: 'Impacto', chamas: 'Chamas', gotas: 'Água', folhas: 'Folhas', pedras: 'Pedras', gelo: 'Gelo', raios: 'Raios', vento: 'Vento', luz: 'Luz', sombra: 'Sombra', faiscas: 'Faíscas', veneno: 'Veneno',
};
export const BODIES: Record<BodyPlan, string> = { quadruped: 'Quadrúpede', biped: 'Bípede/humanoide', avian: 'Ave', serpentine: 'Serpente', aquatic: 'Aquático' };
export const SKILL_ANIMS: AnimKind[] = ['attack', 'jump', 'run', 'happy', 'special'];

// ---------------------------------------------------------------------------
// Afinidades (anel das sete + luz e sombra), multiplicadores suaves
// ---------------------------------------------------------------------------

const RING: Element[] = ['agua', 'fogo', 'natureza', 'terra', 'raio', 'gelo', 'vento'];
export const AFFINITY_STRONG = 1.25, AFFINITY_WEAK = 0.8;

/** Multiplicador de dano de uma essência atacando outra. */
export function affinity(attacker: Element | null, defender: Element | null): number {
  if (!attacker || !defender) return 1;
  if ((attacker === 'luz' && defender === 'sombra') || (attacker === 'sombra' && defender === 'luz')) return AFFINITY_STRONG;
  // veneno fica fora do anel: corrói natureza e contamina a água; a terra o absorve e a luz o purifica
  if (attacker === 'veneno') return defender === 'natureza' || defender === 'agua' ? AFFINITY_STRONG : defender === 'terra' || defender === 'luz' ? AFFINITY_WEAK : 1;
  if (defender === 'veneno') return attacker === 'terra' || attacker === 'luz' ? AFFINITY_STRONG : attacker === 'natureza' || attacker === 'agua' ? AFFINITY_WEAK : 1;
  const a = RING.indexOf(attacker), d = RING.indexOf(defender);
  if (a < 0 || d < 0) return 1;
  if ((a + 1) % RING.length === d) return AFFINITY_STRONG;
  if ((d + 1) % RING.length === a) return AFFINITY_WEAK;
  return 1;
}

/** Dano esperado (sem crítico nem variação) — a Forja mostra para balancear. */
export function expectedDamage(skill: Pick<SkillDef, 'power'>, atk: number, def: number, mult = 1): number {
  if (skill.power <= 0) return 0;
  return Math.max(1, Math.round((skill.power * atk) / Math.max(1, atk + def) * mult));
}

// ---------------------------------------------------------------------------
// Catálogo inicial (genérico: serve para qualquer Companion daquela essência/corpo)
// ---------------------------------------------------------------------------

const S = (slug: string, name: string, slot: SkillSlot, essence: Element | null, shape: SkillShape, o: Partial<SkillDef> & { description: string }): SkillDef => ({
  slug, name, slot, essence, shape, classes: [], bodies: [], range: 1.6, radius: 1.2, angle: 60, power: 0, heal: 0, energy: 0, cooldown: 1, windup: 0.3,
  status: null, anim: 'attack', vfx: { style: 'impacto', color: essence ? 'essence' : 'companion', ground: false }, unlockBond: 1, ...o,
});

export const DEFAULT_SKILLS: SkillDef[] = [
  // golpes básicos (todos têm um)
  S('golpe', 'Golpe', 'basic', null, 'melee', { description: 'Garra, cabeçada, bicada ou cauda — o golpe que o corpo tiver.', power: 40, cooldown: 0.9, windup: 0.15, range: 1.6 }),
  S('faisca-de-essencia', 'Faísca de Essência', 'basic', null, 'projectile', { description: 'Um pingo de energia na cor do Companion, de longe.', power: 30, cooldown: 1.1, windup: 0.2, range: 7, radius: 0.4, vfx: { style: 'faiscas', color: 'companion', ground: false }, classes: ['passaro', 'mistica'], bodies: ['avian', 'serpentine', 'aquatic'] }),
  // forma (uma por corpo)
  S('investida', 'Investida', 'form', null, 'dash', { description: 'Abaixa os chifres e corre em linha reta, atropelando quem estiver no caminho.', classes: ['touro'], bodies: ['quadruped'], power: 70, energy: 25, cooldown: 6, windup: 0.5, range: 6, radius: 0.9, status: { key: 'atordoado', chance: 0.3, seconds: 1 }, anim: 'run', unlockBond: 5 }),
  S('rasante', 'Rasante', 'form', null, 'dash', { description: 'Abre as asas num mergulho rápido e baixo, atravessando os inimigos.', classes: ['passaro'], bodies: ['avian'], power: 60, energy: 25, cooldown: 5, windup: 0.4, range: 7, radius: 0.8, anim: 'jump', vfx: { style: 'vento', color: 'companion', ground: false }, unlockBond: 5 }),
  S('bote', 'Bote', 'form', null, 'leap', { description: 'Se encolhe e salta no alvo como um bicho, deixando-o lento.', classes: ['felino'], bodies: ['serpentine', 'quadruped'], power: 65, energy: 25, cooldown: 5, windup: 0.5, range: 4.5, radius: 1, status: { key: 'lento', chance: 0.6, seconds: 3 }, anim: 'jump', unlockBond: 5 }),
  S('guarda', 'Guarda', 'form', null, 'aura', { description: 'Um escudo de luz feérica que protege ela e os aliados perto.', classes: ['mistica'], bodies: ['biped'], energy: 20, cooldown: 8, windup: 0.2, radius: 2.5, status: { key: 'protegido', chance: 1, seconds: 4 }, anim: 'happy', vfx: { style: 'luz', color: 'companion', ground: true }, unlockBond: 5 }),
  S('chicote-de-cauda', 'Chicote de Cauda', 'form', null, 'aura', { description: 'Gira e varre tudo em volta com a cauda de escamas; pode atordoar.', classes: ['serpente'], bodies: ['serpentine'], power: 60, energy: 25, cooldown: 5, windup: 0.35, radius: 2.2, status: { key: 'atordoado', chance: 0.35, seconds: 1 }, anim: 'attack', vfx: { style: 'impacto', color: 'companion', ground: true }, unlockBond: 5 }),
  S('onda', 'Onda', 'form', null, 'aura', { description: 'Agita a água (ou o ar) em volta e empurra todos para longe.', bodies: ['aquatic'], power: 45, energy: 25, cooldown: 6, windup: 0.4, radius: 3, anim: 'attack', vfx: { style: 'gotas', color: 'companion', ground: true }, unlockBond: 5 }),
  // essência (duas por essência)
  S('sopro-de-chamas', 'Sopro de Chamas', 'essence', 'fogo', 'cone', { description: 'Um leque de fogo à frente.', power: 55, energy: 20, cooldown: 4, windup: 0.4, range: 4, angle: 60, status: { key: 'queimando', chance: 0.5, seconds: 3 }, vfx: { style: 'chamas', color: 'essence', ground: false } }),
  S('brasas', 'Brasas', 'essence', 'fogo', 'circle', { description: 'Brasas caem numa área e queimam o chão.', power: 45, energy: 25, cooldown: 6, windup: 0.8, range: 7, radius: 1.8, status: { key: 'queimando', chance: 0.8, seconds: 4 }, vfx: { style: 'chamas', color: 'essence', ground: true }, unlockBond: 3 }),
  S('jato-dagua', "Jato d'Água", 'essence', 'agua', 'line', { description: 'Um jato reto que atravessa e encharca.', power: 50, energy: 20, cooldown: 4, windup: 0.35, range: 6, radius: 0.6, status: { key: 'encharcado', chance: 0.8, seconds: 4 }, vfx: { style: 'gotas', color: 'essence', ground: false } }),
  S('bolha', 'Bolha', 'essence', 'agua', 'aura', { description: 'Uma bolha que cura e protege por um instante.', heal: 50, energy: 25, cooldown: 9, windup: 0.2, radius: 1.5, status: { key: 'protegido', chance: 1, seconds: 2 }, anim: 'happy', vfx: { style: 'gotas', color: 'essence', ground: true }, unlockBond: 3 }),
  S('raizes', 'Raízes', 'essence', 'natureza', 'circle', { description: 'Raízes brotam do chão e prendem quem estiver ali.', power: 30, energy: 20, cooldown: 6, windup: 0.7, range: 6, radius: 1.6, status: { key: 'enraizado', chance: 0.7, seconds: 2 }, vfx: { style: 'folhas', color: 'essence', ground: true } }),
  S('polen-curativo', 'Pólen Curativo', 'essence', 'natureza', 'aura', { description: 'Uma nuvem de pólen dourado que cura aos poucos.', heal: 60, energy: 25, cooldown: 10, windup: 0.3, radius: 2.5, anim: 'happy', vfx: { style: 'folhas', color: 'essence', ground: true }, unlockBond: 3 }),
  S('tremor', 'Tremor', 'essence', 'terra', 'aura', { description: 'Bate no chão; tudo em volta treme e pode cambalear.', power: 50, energy: 25, cooldown: 6, windup: 0.6, radius: 2.6, status: { key: 'atordoado', chance: 0.35, seconds: 1 }, vfx: { style: 'pedras', color: 'essence', ground: true } }),
  S('pedregulho', 'Pedregulho', 'essence', 'terra', 'projectile', { description: 'Arremessa uma pedra pesada e lenta.', power: 75, energy: 25, cooldown: 5, windup: 0.6, range: 6, radius: 0.7, vfx: { style: 'pedras', color: 'essence', ground: false }, unlockBond: 3 }),
  S('faisca-encadeada', 'Faísca Encadeada', 'essence', 'raio', 'projectile', { description: 'Uma faísca rápida que pode atordoar.', power: 45, energy: 20, cooldown: 3.5, windup: 0.2, range: 8, radius: 0.4, status: { key: 'atordoado', chance: 0.3, seconds: 1 }, vfx: { style: 'raios', color: 'essence', ground: false } }),
  S('descarga', 'Descarga', 'essence', 'raio', 'circle', { description: 'Um raio cai do céu na área marcada.', power: 70, energy: 30, cooldown: 7, windup: 0.9, range: 7, radius: 1.4, vfx: { style: 'raios', color: 'essence', ground: true }, unlockBond: 3 }),
  S('rajada-fria', 'Rajada Fria', 'essence', 'gelo', 'cone', { description: 'Um vento gelado que deixa lento.', power: 40, energy: 20, cooldown: 4, windup: 0.35, range: 4, angle: 70, status: { key: 'lento', chance: 0.8, seconds: 3 }, vfx: { style: 'gelo', color: 'essence', ground: false } }),
  S('lanca-de-gelo', 'Lança de Gelo', 'essence', 'gelo', 'projectile', { description: 'Uma lança de gelo certeira.', power: 65, energy: 25, cooldown: 5, windup: 0.4, range: 8, radius: 0.4, status: { key: 'lento', chance: 0.4, seconds: 2 }, vfx: { style: 'gelo', color: 'essence', ground: false }, unlockBond: 3 }),
  S('lamina-de-vento', 'Lâmina de Vento', 'essence', 'vento', 'line', { description: 'Um corte de ar que atravessa vários.', power: 50, energy: 20, cooldown: 3.5, windup: 0.25, range: 7, radius: 0.5, vfx: { style: 'vento', color: 'essence', ground: false } }),
  S('redemoinho', 'Redemoinho', 'essence', 'vento', 'aura', { description: 'Gira o ar em volta e se esquiva melhor depois.', power: 35, energy: 25, cooldown: 7, windup: 0.3, radius: 2.4, status: { key: 'acelerado', chance: 1, seconds: 3 }, vfx: { style: 'vento', color: 'essence', ground: true }, unlockBond: 3 }),
  S('clarao', 'Clarão', 'essence', 'luz', 'aura', { description: 'Brilha forte; quem estiver perto fica ofuscado.', power: 30, energy: 20, cooldown: 6, windup: 0.4, radius: 2.8, status: { key: 'ofuscado', chance: 0.8, seconds: 3 }, anim: 'happy', vfx: { style: 'luz', color: 'essence', ground: true } }),
  S('raio-de-luz', 'Raio de Luz', 'essence', 'luz', 'line', { description: 'Um feixe reto de luz.', power: 60, energy: 25, cooldown: 5, windup: 0.5, range: 8, radius: 0.5, vfx: { style: 'luz', color: 'essence', ground: false }, unlockBond: 3 }),
  S('garra-sombria', 'Garra Sombria', 'essence', 'sombra', 'melee', { description: 'Um golpe que deixa a sombra grudada no alvo.', power: 55, energy: 15, cooldown: 3, windup: 0.2, range: 1.8, status: { key: 'sombreado', chance: 0.7, seconds: 4 }, vfx: { style: 'sombra', color: 'essence', ground: false } }),
  S('veu', 'Véu', 'essence', 'sombra', 'aura', { description: 'Some na própria sombra e volta mais rápido.', energy: 20, cooldown: 8, windup: 0.1, radius: 1, status: { key: 'acelerado', chance: 1, seconds: 3 }, anim: 'jump', vfx: { style: 'sombra', color: 'essence', ground: true }, unlockBond: 3 }),
  S('cuspe-toxico', 'Cuspe Tóxico', 'essence', 'veneno', 'projectile', { description: 'Uma bolha de veneno que estoura no alvo e envenena.', power: 40, energy: 20, cooldown: 3.5, windup: 0.3, range: 7, radius: 0.5, status: { key: 'envenenado', chance: 0.8, seconds: 5 }, vfx: { style: 'veneno', color: 'essence', ground: false } }),
  S('nevoa-venenosa', 'Névoa Venenosa', 'essence', 'veneno', 'circle', { description: 'Uma nuvem tóxica cai na área e envenena quem respira.', power: 35, energy: 25, cooldown: 7, windup: 0.7, range: 6, radius: 2, status: { key: 'envenenado', chance: 1, seconds: 6 }, vfx: { style: 'veneno', color: 'essence', ground: true }, unlockBond: 3 }),
  // suprema (do vínculo)
  S('ressonancia', 'Ressonância', 'supreme', null, 'aura', { description: 'O golpe do vínculo: uma explosão na cor e na essência do Companion.', power: 140, energy: 0, cooldown: 30, windup: 1, radius: 4, anim: 'happy', vfx: { style: 'luz', color: 'companion', ground: true }, unlockBond: 8 }),
];

// ---------------------------------------------------------------------------

const ELEMENT_KEYS: Element[] = ['fogo', 'agua', 'terra', 'vento', 'luz', 'sombra', 'gelo', 'raio', 'natureza', 'veneno'];
const SLUG = /^[a-z0-9][a-z0-9-]{1,40}$/;
const n = (v: unknown, lo: number, hi: number, d: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };

export function safeSkillIcon(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return undefined;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}

export function sanitizeSkill(input: unknown): SkillDef | null {
  const s = (input ?? {}) as Partial<SkillDef>;
  if (typeof s.slug !== 'string' || !SLUG.test(s.slug)) return null;
  const st = s.status && typeof s.status === 'object' && (s.status.key in STATUSES) ? { key: s.status.key, chance: n(s.status.chance, 0, 1, 0.5), seconds: n(s.status.seconds, 0.5, 15, 3) } : null;
  const authored = s.slug === `vfx-${s.vfx?.catalogue}` ? SPELL_CATALOGUE.find(effect => effect.id === s.vfx?.catalogue) : undefined;
  const proposed = s.learning ?? (authored && isSchool(authored.school) ? { school: authored.school, rank: Math.max(1, [2,4,7,10,14].indexOf(s.unlockBond ?? 0) + 1) } : undefined);
  const learning = proposed && isSchool(proposed.school) ? { school: proposed.school, rank: Math.round(n(proposed.rank, 1, 5, 1)) as 1 | 2 | 3 | 4 | 5 } : undefined;
  const iconUrl = safeSkillIcon(s.iconUrl);
  const v = (s.vfx ?? {}) as Partial<SkillDef['vfx']>;
  return {
    slug: s.slug,
    ...(iconUrl ? { iconUrl } : {}),
    ...(learning ? { learning } : {}),
    name: typeof s.name === 'string' && s.name.trim() ? s.name.trim().slice(0, 40) : s.slug,
    description: typeof s.description === 'string' ? s.description.slice(0, 200) : '',
    slot: s.slot && s.slot in SLOTS ? s.slot : 'essence',
    essence: s.essence && ELEMENT_KEYS.includes(s.essence) ? s.essence : null,
    classes: learning?.school === 'forge' ? ['touro'] : Array.isArray(s.classes) ? s.classes.filter((k): k is SpeciesKey => typeof k === 'string' && k in CLASS_LABELS) : [],
    bodies: Array.isArray(s.bodies) ? s.bodies.filter((b): b is BodyPlan => typeof b === 'string' && b in BODIES) : [],
    shape: s.shape && s.shape in SHAPES ? s.shape : 'melee',
    range: n(s.range, 0.5, 15, 1.6), radius: n(s.radius, 0.2, 8, 1.2), angle: n(s.angle, 15, 180, 60),
    power: Math.round(n(s.power, 0, 400, 0)), heal: Math.round(n(s.heal, 0, 400, 0)), energy: Math.round(n(s.energy, 0, 100, 0)),
    cooldown: n(s.cooldown, 0.3, 60, 1), windup: n(s.windup, 0, 3, 0.3),
    status: st,
    anim: typeof s.anim === 'string' ? s.anim : 'attack',
    vfx: { ...(validSpellId(v.catalogue) ? { catalogue: v.catalogue } : {}), style: v.style && v.style in VFX_STYLES ? v.style : 'impacto', color: v.color === 'essence' || v.color === 'companion' || (typeof v.color === 'string' && /^#[0-9a-f]{6}$/i.test(v.color)) ? v.color : 'essence', ground: !!v.ground, ...(v.layers !== undefined ? { layers: sanitizeVfxLayers(v.layers) } : {}) },
    unlockBond: Math.round(n(s.unlockBond, 1, 20, 1)),
    ...(s.modality === 'fisica' || s.modality === 'magica' || s.modality === 'hibrida' ? { modality: s.modality } : {}),
  };
}

/** Serve para este Companion? (essência igual ou neutra; corpo na lista ou lista vazia) */
export function skillFits(s: SkillDef, essence: Element | null, body: BodyPlan, species?: SpeciesKey | null): boolean {
  // School techniques are acquired and equipped only through their school flow.
  if (s.learning) return false;
  if (s.essence !== null && s.essence !== essence) return false;
  if (!s.classes.length && !s.bodies.length) return true;
  // Companion (humanoide): vale a classe; criatura: vale o corpo
  return species ? s.classes.includes(species) : s.bodies.includes(body);
}

/** Rótulos das classes (para o painel; a definição completa fica em species.ts). */
export const CLASS_LABELS: Record<SpeciesKey, string> = { serpente: 'Dracônica', passaro: 'Alada', felino: 'Feral', touro: 'Taurina', mistica: 'Feérica' };

export interface Kit { basic: SkillDef | null; essence: SkillDef[]; form: SkillDef | null; supreme: SkillDef | null; locked: SkillDef[] }

/**
 * Kit de um Companion a partir do catálogo: um golpe básico (o específico do corpo vence o genérico), até duas de
 * essência, a de forma e a suprema. O que ainda não abriu pelo vínculo vai para `locked`.
 */
export function kitFor(catalog: SkillDef[], c: { essence: Element | null; body: BodyPlan; bond: number; species?: SpeciesKey | null }): Kit {
  const restricted = (s: SkillDef) => (c.species ? s.classes.length : s.bodies.length);
  const fit = catalog.filter((s) => skillFits(s, c.essence, c.body, c.species)).sort((a, b) => restricted(b) - restricted(a) || (b.essence ? 1 : 0) - (a.essence ? 1 : 0) || a.slug.localeCompare(b.slug));
  const open = (s: SkillDef) => s.unlockBond <= c.bond;
  const kit: Kit = { basic: null, essence: [], form: null, supreme: null, locked: [] };
  for (const s of fit) {
    if (s.slot === 'basic') { if (!kit.basic) kit.basic = s; continue; }
    if (!open(s)) { if (!kit.locked.some((x) => x.slot === s.slot && s.slot !== 'essence')) kit.locked.push(s); continue; }
    if (s.slot === 'essence' && kit.essence.length < 2 && s.essence) kit.essence.push(s);
    else if (s.slot === 'form' && !kit.form) kit.form = s;
    else if (s.slot === 'supreme' && !kit.supreme) kit.supreme = s;
  }
  return kit;
}

// ---------------------------------------------------------------------------
// Concentrar a habilidade (Shift + 1–9): segurar acumula até 2,5 s e solta com dano extra
// ---------------------------------------------------------------------------

export const SKILL_CHARGE_MAX = 2.5;     // s: depois disso não acumula mais
export const SKILL_CHARGE_MIN = 0.15;    // s: menos que isso conta como lançamento normal
export const SKILL_CHARGE_BONUS = 1;     // dano extra com a carga cheia (+100% → ×2)

/** Carga de 0 a 1 pelo tempo segurado (até SKILL_CHARGE_MAX). */
export const skillCharge = (seconds: number) => (seconds < SKILL_CHARGE_MIN ? 0 : Math.min(1, seconds / SKILL_CHARGE_MAX));

/** Multiplicador de dano da habilidade concentrada: ×1 sem carga até ×2 com 2,5 s (cura não muda). */
export function skillChargeMultiplier(seconds: number): number {
  return 1 + SKILL_CHARGE_BONUS * skillCharge(seconds);
}
