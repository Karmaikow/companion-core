/**
 * Escolas de Áster: prédios na cidade onde se aprende um ofício de criação.
 *
 *  - Escola da Forja: só Taurinas. É o ÚNICO lugar onde equipamentos são forjados, reforjados e encomendas aceitas
 *    (a bancada saiu das habilidades da classe, no painel do Pacto).
 *  - Escola do Veneno: aceita Companions de essência Natureza ou Água. Prepara poções e comidas com as plantas do
 *    Vale e ensina as técnicas de veneno (Cuspe Tóxico, Névoa Venenosa). Veneno deixou de ser essência de Companion
 *    (quem tinha virou Natureza); continua como elemento de monstros e tipo de dano.
 *
 * A matrícula é gratuita e feita no prédio. O servidor confere matrícula e classe/essência a cada ação.
 */
import type { Element } from './identity.ts';
import { canCompleteEquipment, type Forms } from './pacto.ts';
import { goodById } from './shop.ts';
import { MATERIALS, parseBatchKey } from './ecos.ts';
import type { SkillDef } from './combat/skills.ts';
import { weaponBlock, type WeaponReq } from './tiers.ts';

export type CitySchool = 'forja' | 'veneno' | 'arcana';
export const CITY_SCHOOLS: Record<CitySchool, { label: string; icon: string; master: string; focus: string; who: string }> = {
  forja: { label: 'Escola da Forja', icon: '🔨', master: 'Mestra Ferreira', focus: 'Forja, reforja e encomendas de equipamentos.', who: 'Só Taurinas.' },
  veneno: { label: 'Escola do Veneno', icon: '☠️', master: 'Boticária', focus: 'Poções, comidas e as técnicas de veneno.', who: 'Companions de essência Natureza ou Água.' },
  arcana: { label: 'Escola Arcana', icon: '🔮', master: 'Arquimaga Selene', focus: 'As técnicas arcanas do cajado: Seta Arcana, Selo Rúnico e Explosão Arcana.', who: 'Quem empunha um cajado de duas mãos T4 ou maior.' },
};
/** Escolas que pedem uma arma para a matrícula (conferida só ao se matricular). */
export const SCHOOL_WEAPON: Partial<Record<CitySchool, WeaponReq>> = { arcana: { kind: 'cajado', tier: 4, twoHanded: true } };
export const CITY_SCHOOL_IDS = Object.keys(CITY_SCHOOLS) as CitySchool[];
export const isCitySchool = (v: unknown): v is CitySchool => typeof v === 'string' && v in CITY_SCHOOLS;
export const cleanSchools = (v: unknown): CitySchool[] => (Array.isArray(v) ? [...new Set(v.filter(isCitySchool))] : []);

const VENENO_ESSENCES: Element[] = ['natureza', 'agua'];
/**
 * Pode estudar nesta escola? Devolve o motivo de não poder (null = pode). `weapon`: a arma na mão, para as escolas que
 * pedem arma (só na matrícula; sem o argumento, não confere a arma).
 */
export function schoolBlock(school: CitySchool, forms: Forms, essences: readonly (Element | null)[], weapon?: { type: string; tier?: number; twoHanded?: boolean } | null): string | null {
  if (school === 'arcana') return weapon === undefined ? null : weaponBlock(SCHOOL_WEAPON.arcana, weapon);
  if (school === 'forja') return canCompleteEquipment(forms) ? null : 'A Escola da Forja é só para Taurinas.';
  return essences.some((e) => e && VENENO_ESSENCES.includes(e)) ? null : 'A Escola do Veneno aceita só Companions de essência Natureza ou Água.';
}
/** Está matriculado(a) e ainda pode estudar? */
export const studiesAt = (school: CitySchool, schools: readonly string[], forms: Forms, essences: readonly (Element | null)[]) =>
  schools.includes(school) && !schoolBlock(school, forms, essences);

// ---------------------------------------------------------------------------
// Técnicas ensinadas pela escola (as habilidades do antigo elemento Veneno)
// ---------------------------------------------------------------------------

const SCHOOL_ELEMENT: Partial<Record<CitySchool, Element>> = { veneno: 'veneno' };
/** Habilidades que a escola ensina (abrem pelo vínculo, como as da essência). */
export function schoolSkills(catalog: SkillDef[], schools: readonly CitySchool[]): SkillDef[] {
  const els = schools.map((k) => SCHOOL_ELEMENT[k]).filter(Boolean);
  return catalog.filter((s) => s.slot === 'essence' && !s.learning && s.essence && els.includes(s.essence) && !s.classes.length && !s.bodies.length);
}

// ---------------------------------------------------------------------------
// Bancada da Escola do Veneno: poções e comidas com as plantas do Vale
// ---------------------------------------------------------------------------

export interface Brew { id: string; good: string; qty: number; inputs: { material: string; qty: number }[] }
const R = (good: string, qty: number, ...inputs: [string, number][]): Brew => ({ id: good, good, qty, inputs: inputs.map(([material, q]) => ({ material, qty: q })) });
export const BREWS: Brew[] = [
  R('pocao-vida-p', 2, ['erva-orvalho-folha', 3]),
  R('pocao-vida-m', 1, ['erva-orvalho-raiz', 1], ['erva-orvalho-folha', 2]),
  R('pocao-sp-p', 2, ['erva-orvalho-flor', 1], ['erva-orvalho-folha', 2]),
  R('pocao-sp-m', 1, ['seiva-azul', 1], ['erva-orvalho-flor', 1]),
  R('pao-de-mel', 2, ['erva-orvalho-folha', 2], ['erva-orvalho-flor', 1]),
  R('sopa-de-raizes', 2, ['erva-orvalho-raiz', 2]),
  R('torta-de-frutas', 1, ['erva-orvalho-folha', 1], ['erva-orvalho-flor', 1], ['erva-orvalho-raiz', 1], ['seiva-azul', 1]),
  // superiores: refinados da Casa dos Ecos e a Erva Lunar (variedade que a missão da escola ensina)
  R('pocao-vida-g', 1, ['extrato-de-orvalho', 1], ['erva-lunar', 1]),
  R('pocao-sp-g', 1, ['extrato-de-orvalho', 1], ['seiva-azul', 1]),
  R('elixir-lunar', 1, ['erva-lunar', 2], ['quartzo-lapidado', 1]),
  // lendária: a Lágrima da Nascente Azul (missão lendária "A Seiva Azul")
  R('agua-da-vida', 1, ['lagrima-da-nascente', 1], ['extrato-de-orvalho', 1]),
];
export const brewById = (id: string) => BREWS.find((r) => r.id === id) ?? null;
export const MAX_BREW = 10;

/**
 * Preparar `times` vezes uma receita com a mochila do Vale. Usa primeiro os lotes de maior potência.
 * Bônus: se todas as plantas usadas tiverem potência alta, sai +1 por preparo.
 */
export function brewCheck(Brew: Brew | null, times: number, bag: { key: string; qty: number }[]):
  { ok: true; consume: { key: string; qty: number }[]; give: number; bonus: boolean } | { ok: false; reason: string } {
  if (!Brew || !goodById(Brew.good)) return { ok: false, reason: 'Receita inexistente.' };
  if (!Number.isInteger(times) || times < 1 || times > MAX_BREW) return { ok: false, reason: `Prepare de 1 a ${MAX_BREW} vezes.` };
  const consume: { key: string; qty: number }[] = [];
  const missing: string[] = [];
  let allHigh = true;
  const rank = (k: string) => ({ alta: 2, media: 1, baixa: 0 })[parseBatchKey(k)?.bands.potencia ?? 'baixa'];
  for (const inp of Brew.inputs) {
    let need = inp.qty * times;
    const lots = bag.filter((b) => b.qty > 0 && parseBatchKey(b.key)?.material === inp.material).sort((a, b) => rank(b.key) - rank(a.key) || a.key.localeCompare(b.key));
    for (const b of lots) {
      if (!need) break;
      const take = Math.min(need, b.qty);
      consume.push({ key: b.key, qty: take }); need -= take;
      if (MATERIALS[inp.material].category === 'planta' && parseBatchKey(b.key)?.bands.potencia !== 'alta') allHigh = false;
    }
    if (need) missing.push(`${need}× ${MATERIALS[inp.material].name}`);
  }
  if (missing.length) return { ok: false, reason: 'Faltam: ' + missing.join(', ') + '.' };
  const plants = Brew.inputs.some((i) => MATERIALS[i.material].category === 'planta');
  const bonus = plants && allHigh;
  return { ok: true, consume, give: (Brew.qty + (bonus ? 1 : 0)) * times, bonus };
}
