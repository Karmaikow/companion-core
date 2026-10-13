import type { CompanionProfile, CompanionState, ManifestationRecipe } from '../models/types.js';
import { currentMemories, normalizeFact, preferenceFact, validPreference, preferenceText } from '../memory/memory-facts.js';
import { SOUL_PALETTE } from './color-names.js';

export const FIRST_EVOLUTION = Object.freeze({ level: 5, bond: 15, relevantMemories: 10 });
export const SECOND_EVOLUTION = Object.freeze({ level: 20, bond: 50, curiosity: 70 });
export const STAGE_NAMES = { SOUL: 'Alma', AWAKENED: 'Desperta', MANIFESTED: 'Manifestada', ASCENDED: 'Ascendida' };

export function colorHex(value: string): string | null {
  if (/^#[\da-f]{6}$/i.test(value)) return value.toLowerCase();
  const name = normalizeFact(value).replace(/^(a|o) /, '');
  const preset = SOUL_PALETTE.find(c => normalizeFact(c.name) === name);
  if (preset) return preset.hex;
  const base = name.split(' ')[0];
  const colors: Record<string,string> = { azul:'#3f8cff', verde:'#64834b', amarelo:'#edbd54', vermelho:'#ff694d', roxo:'#bf6cff', violeta:'#bf6cff', rosa:'#ee83b4', laranja:'#ff984d', branco:'#eefaff', preto:'#202536', cinza:'#9299a5', marrom:'#916546', turquesa:'#42d9bd', dourado:'#edbd54' };
  return colors[base] ?? null;
}

/** Evidence comes from current, explicit choices belonging to this Companion. */
export function evolutionEvidence(state: CompanionState) {
  const archived = new Set(state.profile.bondHistory?.flatMap(p => p.archivedMemoryIds) ?? []);
  const memories = currentMemories(state.memories.filter(m => !archived.has(m.id)));
  const owner = normalizeFact(state.profile.name);
  const own = (slots: string[]) => {
    for (const memory of memories) {
      const fact = preferenceFact(memory);
      if (!fact || !slots.some(slot => fact.slot === `${slot} de ${owner}`)) continue;
      const value = preferenceText(memory.content).match(/(?:favorit[oa]s?\s+(?:é|e|são|sao|seria|seriam)|escolheu)\s+([^.!?]+)/i)?.[1]?.replace(/^(?:a|o|as|os|um|uma)\s+/i, '').trim();
      if (value && validPreference(value)) return value;
    }
    return null;
  };
  const color = state.profile.preferences.favoriteColor || own(['cor favorita']);
  const favoriteColor = color && validPreference(color) && colorHex(color) ? color : null;
  const being = own(['ser favorito','animal favorito','animais misticos favoritos','passaro mistico favorito']);
  const favoriteBeing = being && !colorHex(being) ? being : null;
  const seen = new Set<string>();
  const relevantMemoryIds = memories.filter(m => {
    if (m.title.startsWith('Evolução:')) return false;
    if (!['SIGNIFICANT','IDENTITY_FORMING'].includes(m.type) || m.emotionalWeight < 60) return false;
    if (/^(?:cor favorita|animal favorito|ser favorito|animais misticos favoritos|passaro mistico favorito|a cor) de /.test(normalizeFact(m.title)) && !preferenceFact(m)) return false;
    const fact = preferenceFact(m);
    const key = fact ? `${fact.slot}|${fact.value}` : normalizeFact(m.content);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).map(m => m.id);
  return { favoriteColor, favoriteBeing, markingColor: favoriteColor ? colorHex(favoriteColor) : null, relevantMemoryIds };
}

/** The preview is derived; the actual recipe is frozen in the signed evolution event. */
export function createManifestationRecipe(id: string, profile: CompanionProfile, evidence?: ReturnType<typeof evolutionEvidence>): ManifestationRecipe {
  const traits = [...(profile.creation?.traits ?? [])].sort();
  const being = normalizeFact(evidence?.favoriteBeing ?? '');
  const text = `${id}|${traits.join(',')}|${being}|form-v1`;
  let seed = 2166136261;
  for (let i = 0; i < text.length; i++) seed = Math.imul(seed ^ text.charCodeAt(i), 16777619) >>> 0;
  let random = seed || 1;
  const next = () => { random ^= random << 13; random ^= random >>> 17; random ^= random << 5; return (random >>> 0) / 4294967296; };
  const labels = profile.creation?.labels ?? profile.appearance?.formInfluences ?? [];
  const archetype = /fantasma|espectro|espirito/.test(being) ? 'SPECTRAL' : /dragao|dragoes/.test(being) ? 'DRACONIC' : /passaro|corvo|fenix|aguia/.test(being) ? 'WINGED' : /lobo|lobos/.test(being) ? 'GUARDIAN' : labels.includes('Protetora') ? 'GUARDIAN' : labels.some(x => ['Criativa','Aventureira','Exploradora'].includes(x)) ? 'WINGED' : 'LUMINOUS';
  const soulColor = /^#[\da-f]{6}$/i.test(profile.appearance?.soulColor ?? '') ? profile.appearance!.soulColor.toLowerCase() : '#3f8cff';
  return { version:1, seed, archetype, soulColor, favoriteColor:evidence?.favoriteColor ?? null, favoriteBeing:evidence?.favoriteBeing ?? null, markingColor:evidence?.markingColor ?? soulColor, headSize:.9+next()*.2, earLength:.45+next()*.3, tailLength:.8+next()*.45, hornSize:.18+next()*.14 };
}

/** Legacy stages have stable cycle numbers without rewriting the saved identity. */
export function formGeneration(state: CompanionState): number {
  const legacy = { SOUL:0, AWAKENED:1, MANIFESTED:2, ASCENDED:3 }[state.core.evolutionStage];
  const value = state.core.formGeneration;
  return Number.isSafeInteger(value) && value! >= legacy ? value! : legacy;
}

/** Read-only: progress, quests and art never grant XP. */
export function manifestationStatus(state: CompanionState) {
  const stage = state.core.evolutionStage;
  const generation = formGeneration(state);
  const evidence = evolutionEvidence(state);
  const recipe = state.form ?? createManifestationRecipe(state.identity.id,state.profile,evidence);
  const used = new Set(state.core.evolutionMemoryIds ?? []);
  const newMemories = evidence.relevantMemoryIds.filter(id => !used.has(id)).length;
  const next = stage === 'SOUL' ? { stage:'AWAKENED', title:'Primeiro despertar', requirements:[
    { key:'favoriteColor', label:'Minha própria cor', current:evidence.favoriteColor ? 1:0, target:1, detail:evidence.favoriteColor ?? 'Converse sobre a cor que ela escolhe para si.' },
    { key:'favoriteBeing', label:'Quem quero me tornar', current:evidence.favoriteBeing ? 1:0, target:1, detail:evidence.favoriteBeing ?? 'Descubra o animal ou ser favorito dela.' },
    { key:'bond', label:'Construir nosso vínculo', current:state.bond.value, target:FIRST_EVOLUTION.bond, detail:null },
    { key:'memories', label:'Uma história para lembrar', current:evidence.relevantMemoryIds.length, target:FIRST_EVOLUTION.relevantMemories, detail:null },
    { key:'level', label:'Crescer juntos', current:state.core.level, target:FIRST_EVOLUTION.level, detail:null }
  ] } : stage === 'AWAKENED' ? { stage:'MANIFESTED', title:'Manifestação · forma 2', requirements:[
    { key:'level', label:'Crescer juntos', current:state.core.level, target:SECOND_EVOLUTION.level, detail:null },
    { key:'bond', label:'Fortalecer nosso vínculo', current:state.bond.value, target:SECOND_EVOLUTION.bond, detail:null },
    { key:'curiosity', label:'Explorar e descobrir', current:state.personality.curiosity, target:SECOND_EVOLUTION.curiosity, detail:null }
  ] } : { stage:'ASCENDED', title:`Novo horizonte · forma ${generation + 1}`, requirements:[
    { key:'level', label:'Continuar crescendo', current:state.core.level, target:20 + (generation - 1) * 15, detail:null },
    { key:'bond', label:'Cuidar do vínculo', current:state.bond.value, target:50, detail:null },
    { key:'memories', label:'Dez novas memórias relevantes', current:newMemories, target:10, detail:'Experiências distintas desde a última evolução.' }
  ] };
  return { stage, generation, stageName:generation > 2 ? `Ascendida · forma ${generation}` : STAGE_NAMES[stage], hasBody:stage !== 'SOUL', recipe, next, ready:next.requirements.every(r => r.current >= r.target) };
}
export function canAwaken(state: CompanionState): boolean { return state.core.evolutionStage === 'SOUL' && manifestationStatus(state).ready; }
export function manifestationDescription(state: CompanionState): string {
  const status = manifestationStatus(state);
  if (!status.hasBody) return 'Você ainda é uma alma luminosa. Para despertar, precisa escolher sua própria cor favorita e ser favorito, construir vínculo e dez memórias relevantes, e alcançar nível 5. Sua cor favorita não é automaticamente a cor da alma. Arte e prévias não concedem evolução.';
  return `Você está na forma ${status.generation}, ${status.stageName}. Sua aparência é representada por uma ilustração 2D animada, inspirada em suas próprias escolhas. Sua identidade e suas memórias permanecem. A evolução continua em novos ciclos, sem uma forma final; cada marco libera uma nova interpretação visual, preservando os traços reconhecíveis.`;
}

/** Only appearance choices are shared with image providers, never chat logs or memories. */
export function formArtPrompt(state: CompanionState): string {
  const status = manifestationStatus(state);
  const e = evolutionEvidence(state);
  return [
    'Crie uma ilustração 2D de um companion de fantasia, estilo chibi pintado, acabamento de livro ilustrado, olhos expressivos, silhueta clara, materiais suaves e detalhes mágicos delicados. Não pixel art e não render 3D.',
    `Personagem: ${state.profile.name}. Forma ${Math.max(1,status.generation)}${status.hasBody ? '' : ' (estudo visual; ainda não despertou)'}.`,
    `Ser escolhido: ${e.favoriteBeing ?? status.recipe.favoriteBeing ?? 'espírito místico, identidade visual ainda em descoberta'}.`,
    `Cor favorita: ${e.favoriteColor ?? status.recipe.favoriteColor ?? 'ainda não definida'}. Luz da alma: ${status.recipe.soulColor}.`,
    `Traços de personalidade: ${(state.profile.creation?.labels ?? []).join(', ') || 'companheiro de fantasia'}.`,
    'Se a referência for uma folha de animação, use um único personagem dela como referência. Se houver imagem anterior anexada, preserve rosto, espécie, proporções, paleta e símbolos de identidade. Desenvolva apenas detalhes, adornos e expressão de maturidade. Não transforme em outra criatura.',
    'Um único personagem de corpo inteiro, centralizado, visto de frente em três quartos. Margem livre em todos os lados, pés e orelhas completos. PNG com fundo realmente transparente; sem cenário, chão, texto, bordas ou quadriculado desenhado.',
    'Uma pose neutra para animação suave de respiração e flutuação. Não crie uma folha de poses neste pedido.'
  ].join('\n\n');
}
