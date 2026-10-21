/**
 * Forja de Batalha — habilidades genéricas. Uma habilidade não pertence a um Companion: ela pede uma essência (ou
 * nenhuma) e um ou mais tipos de corpo (ou todos). Qualquer Companion que combine com ela pode usá-la; a cor vem da
 * essência ou do próprio Companion, e a animação é sempre um dos clipes que todo rig tem (ataque, pulo...).
 * A diferença entre habilidades está na forma (cone, linha, área...), nos efeitos e nos números — nunca em
 * animações únicas, para não ficar estranho em corpos diferentes (ver claude/batalha-v1.md).
 */
import type { Element } from '../identity.ts';
import type { BodyPlan } from '../art.ts';
import type { AnimKind } from '../anim.ts';

export type SkillSlot = 'basic' | 'essence' | 'form' | 'supreme';
export type SkillShape = 'melee' | 'cone' | 'line' | 'circle' | 'projectile' | 'aura' | 'dash' | 'leap';
export type StatusKey = 'encharcado' | 'queimando' | 'enraizado' | 'lento' | 'ofuscado' | 'sombreado' | 'atordoado' | 'protegido' | 'acelerado';
export type VfxStyle = 'impacto' | 'chamas' | 'gotas' | 'folhas' | 'pedras' | 'gelo' | 'raios' | 'vento' | 'luz' | 'sombra' | 'faiscas';

export interface SkillDef {
  slug: string;
  name: string;
  description: string;
  slot: SkillSlot;
  essence: Element | null;       // null = neutra (usa a cor do Companion)
  bodies: BodyPlan[];            // vazio = todos os corpos
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
  vfx: { style: VfxStyle; color: 'essence' | 'companion' | string; ground: boolean };
  unlockBond: number;            // nível de vínculo para entrar no kit
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
};
export const VFX_STYLES: Record<VfxStyle, string> = {
  impacto: 'Impacto', chamas: 'Chamas', gotas: 'Água', folhas: 'Folhas', pedras: 'Pedras', gelo: 'Gelo', raios: 'Raios', vento: 'Vento', luz: 'Luz', sombra: 'Sombra', faiscas: 'Faíscas',
};
export const BODIES: Record<BodyPlan, string> = { quadruped: 'Quadrúpede', biped: 'Bípede', avian: 'Ave', serpentine: 'Serpente', aquatic: 'Aquático' };
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
  slug, name, slot, essence, shape, bodies: [], range: 1.6, radius: 1.2, angle: 60, power: 0, heal: 0, energy: 0, cooldown: 1, windup: 0.3,
  status: null, anim: 'attack', vfx: { style: 'impacto', color: essence ? 'essence' : 'companion', ground: false }, unlockBond: 1, ...o,
});

export const DEFAULT_SKILLS: SkillDef[] = [
  // golpes básicos (todos têm um)
  S('golpe', 'Golpe', 'basic', null, 'melee', { description: 'Garra, cabeçada, bicada ou cauda — o golpe que o corpo tiver.', power: 40, cooldown: 0.9, windup: 0.15, range: 1.6 }),
  S('faisca-de-essencia', 'Faísca de Essência', 'basic', null, 'projectile', { description: 'Um pingo de energia na cor do Companion, de longe.', power: 30, cooldown: 1.1, windup: 0.2, range: 7, radius: 0.4, vfx: { style: 'faiscas', color: 'companion', ground: false }, bodies: ['avian', 'serpentine', 'aquatic'] }),
  // forma (uma por corpo)
  S('investida', 'Investida', 'form', null, 'dash', { description: 'Corre em linha reta e atropela quem estiver no caminho.', bodies: ['quadruped'], power: 70, energy: 25, cooldown: 6, windup: 0.5, range: 6, radius: 0.9, status: { key: 'atordoado', chance: 0.3, seconds: 1 }, anim: 'run', unlockBond: 5 }),
  S('rasante', 'Rasante', 'form', null, 'dash', { description: 'Mergulho rápido em voo baixo, atravessando os inimigos.', bodies: ['avian'], power: 60, energy: 25, cooldown: 5, windup: 0.4, range: 7, radius: 0.8, anim: 'jump', vfx: { style: 'vento', color: 'companion', ground: false }, unlockBond: 5 }),
  S('bote', 'Bote', 'form', null, 'leap', { description: 'Se encolhe e salta no alvo, deixando-o lento.', bodies: ['serpentine'], power: 65, energy: 25, cooldown: 5, windup: 0.5, range: 4.5, radius: 1, status: { key: 'lento', chance: 0.6, seconds: 3 }, anim: 'jump', unlockBond: 5 }),
  S('guarda', 'Guarda', 'form', null, 'aura', { description: 'Firma os pés e se protege; aliados perto também.', bodies: ['biped'], energy: 20, cooldown: 8, windup: 0.2, radius: 2.5, status: { key: 'protegido', chance: 1, seconds: 4 }, anim: 'happy', vfx: { style: 'luz', color: 'companion', ground: true }, unlockBond: 5 }),
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
  // suprema (do vínculo)
  S('ressonancia', 'Ressonância', 'supreme', null, 'aura', { description: 'O golpe do vínculo: uma explosão na cor e na essência do Companion.', power: 140, energy: 0, cooldown: 30, windup: 1, radius: 4, anim: 'happy', vfx: { style: 'luz', color: 'companion', ground: true }, unlockBond: 8 }),
];

// ---------------------------------------------------------------------------

const ELEMENT_KEYS: Element[] = ['fogo', 'agua', 'terra', 'vento', 'luz', 'sombra', 'gelo', 'raio', 'natureza'];
const SLUG = /^[a-z0-9][a-z0-9-]{1,40}$/;
const n = (v: unknown, lo: number, hi: number, d: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };

export function sanitizeSkill(input: unknown): SkillDef | null {
  const s = (input ?? {}) as Partial<SkillDef>;
  if (typeof s.slug !== 'string' || !SLUG.test(s.slug)) return null;
  const st = s.status && typeof s.status === 'object' && (s.status.key in STATUSES) ? { key: s.status.key, chance: n(s.status.chance, 0, 1, 0.5), seconds: n(s.status.seconds, 0.5, 15, 3) } : null;
  const v = (s.vfx ?? {}) as Partial<SkillDef['vfx']>;
  return {
    slug: s.slug,
    name: typeof s.name === 'string' && s.name.trim() ? s.name.trim().slice(0, 40) : s.slug,
    description: typeof s.description === 'string' ? s.description.slice(0, 200) : '',
    slot: s.slot && s.slot in SLOTS ? s.slot : 'essence',
    essence: s.essence && ELEMENT_KEYS.includes(s.essence) ? s.essence : null,
    bodies: Array.isArray(s.bodies) ? s.bodies.filter((b): b is BodyPlan => typeof b === 'string' && b in BODIES) : [],
    shape: s.shape && s.shape in SHAPES ? s.shape : 'melee',
    range: n(s.range, 0.5, 15, 1.6), radius: n(s.radius, 0.2, 8, 1.2), angle: n(s.angle, 15, 180, 60),
    power: Math.round(n(s.power, 0, 400, 0)), heal: Math.round(n(s.heal, 0, 400, 0)), energy: Math.round(n(s.energy, 0, 100, 0)),
    cooldown: n(s.cooldown, 0.3, 60, 1), windup: n(s.windup, 0, 3, 0.3),
    status: st,
    anim: typeof s.anim === 'string' ? s.anim : 'attack',
    vfx: { style: v.style && v.style in VFX_STYLES ? v.style : 'impacto', color: v.color === 'essence' || v.color === 'companion' || (typeof v.color === 'string' && /^#[0-9a-f]{6}$/i.test(v.color)) ? v.color : 'essence', ground: !!v.ground },
    unlockBond: Math.round(n(s.unlockBond, 1, 20, 1)),
  };
}

/** Serve para este Companion? (essência igual ou neutra; corpo na lista ou lista vazia) */
export function skillFits(s: SkillDef, essence: Element | null, body: BodyPlan): boolean {
  return (s.essence === null || s.essence === essence) && (!s.bodies.length || s.bodies.includes(body));
}

export interface Kit { basic: SkillDef | null; essence: SkillDef[]; form: SkillDef | null; supreme: SkillDef | null; locked: SkillDef[] }

/**
 * Kit de um Companion a partir do catálogo: um golpe básico (o específico do corpo vence o genérico), até duas de
 * essência, a de forma e a suprema. O que ainda não abriu pelo vínculo vai para `locked`.
 */
export function kitFor(catalog: SkillDef[], c: { essence: Element | null; body: BodyPlan; bond: number }): Kit {
  const fit = catalog.filter((s) => skillFits(s, c.essence, c.body)).sort((a, b) => b.bodies.length - a.bodies.length || (b.essence ? 1 : 0) - (a.essence ? 1 : 0) || a.slug.localeCompare(b.slug));
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
