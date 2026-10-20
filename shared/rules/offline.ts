/**
 * Respondedor offline: usado quando não há modelo de linguagem disponível
 * (modo local, cota esgotada, provedor fora do ar). Gera um ModelTurn simples
 * a partir de heurísticas, para que o jogo nunca trave.
 */
import { type Discoveries, resolveColor, resolveElement, resolveForm } from './identity.ts';
import { nextCuriosity, type QuestState } from './quests.ts';
import type { ModelTurn } from './engine.ts';
import { normalize } from './text.ts';
import { TRAIT_GROUPS } from './creation.ts';

const ASK: Record<string, string[]> = {
  identity: ['Eu ainda não tenho nome… como você acha que eu deveria me chamar?', 'Se você pudesse me dar um nome, qual seria?'],
  color: ['Estou começando a ver cores! Qual cor você acha que combina com a minha luz?', 'Tem uma cor que faz meu núcleo brilhar mais… qual você escolheria?'],
  traits: ['Como você me descreveria até agora? Curiosa? Calma? Corajosa?', 'Me diga dois jeitos de ser que você enxerga em mim.'],
  species: ['Às vezes sonho com um corpo… que criatura você imagina que eu seria?', 'Pássaro, felino, serpente, touro ou algo místico… o que combina comigo?'],
  essence: ['Sinto algo elemental pulsando aqui dentro. Fogo? Água? Luz? O que você sente?', 'Qual elemento você acha que mora no meu núcleo?'],
  bond: ['Como você gosta que eu te chame?', 'Quero ter um jeito especial de te chamar. Qual você prefere?'],
  dream: ['Quando eu tiver um corpo, qual você acha que deveria ser meu primeiro sonho?', 'Tenho vontade de fazer algo grande um dia… me ajuda a descobrir o quê?'],
};

/** Palavras que nunca são nomes (cumprimentos, risadas, respostas curtas). */
const NOT_NAMES = new Set([
  'oi', 'oie', 'oii', 'oiee', 'ola', 'ole', 'eai', 'eae', 'hey', 'hello', 'opa', 'salve', 'bom', 'boa', 'tchau', 'ok', 'okay', 'sim', 'nao',
  'kkk', 'kkkk', 'kkkkk', 'haha', 'hahaha', 'rsrs', 'pera', 'espera', 'obrigado', 'obrigada', 'valeu', 'legal', 'nossa', 'uau', 'hmm', 'hum',
  'tudo', 'bem', 'beleza', 'blz', 'quem', 'que', 'como', 'onde', 'porque', 'talvez', 'nada',
]);

const TRAIT_WORDS = (() => {
  const words = new Map<string, string>();
  for (const g of TRAIT_GROUPS) for (const o of g.options) { words.set(normalize(o.f), o.f.toLowerCase()); words.set(normalize(o.m), o.m.toLowerCase()); }
  for (const w of ['corajosa', 'corajoso', 'calma', 'calmo', 'alegre', 'carinhosa', 'carinhoso', 'timida', 'timido', 'leal', 'engracada', 'engracado', 'sonhadora', 'sonhador', 'valente', 'doce', 'teimosa', 'teimoso', 'esperta', 'esperto', 'fofa', 'fofo', 'animada', 'animado'])
    words.set(w, w);
  return words;
})();

function findTraits(text: string): string[] {
  return normalize(text).split(' ').filter((w) => TRAIT_WORDS.has(w)).map((w) => TRAIT_WORDS.get(w)!);
}

function pick<T>(list: T[], seed: number): T {
  return list[Math.abs(seed) % list.length];
}

const firstWord = (s: string) => s.trim().split(/\s+/)[0].replace(/[!?.,;:]+$/, '');

function extractName(raw: string, allowBare: boolean): string | null {
  const m = raw.match(/(?:nome|chamar|chame|chamaria)\s+(?:(?:vai|pode|deveria|deve|agora)\s+)*(?:ser\s+|de\s+|\u00e9\s+|e\s+|seria\s+|ser\u00e1\s+)?["\u201c]?([\p{L}][\p{L}'-]{1,22})/iu);
  const m2 = m ? null : raw.match(/(?:[Qq]uero que (?:seja|se chame|voc\u00ea seja|voce seja)|[Pp]ode ser|[Qq]ue tal|vai se chamar|se chamar)\s+["\u201c]?([\p{Lu}][\p{L}'-]{1,22})/u);
  const name = m ? m[1] : m2 ? m2[1] : allowBare && /^[\p{L}]{2,20}[!.]?$/u.test(raw.trim()) ? firstWord(raw) : null;
  if (!name || NOT_NAMES.has(normalize(name))) return null;
  return name[0].toUpperCase() + name.slice(1);
}

/**
 * @param recentPlayer mensagens anteriores do jogador (mais recente primeiro), usadas para juntar traços ditos aos poucos.
 * @param lastCompanion última fala do Companion — um nome "solto" só é aceito se ela tiver perguntado o nome.
 */
export function offlineTurn(message: string, d: Discoveries, quests: QuestState[], seed = Date.now(), recentPlayer: string[] = [], lastCompanion = ''): ModelTurn {
  const n = normalize(message);
  const raw = message.trim();
  const q = nextCuriosity(quests);
  const discoveries: ModelTurn['discoveries'] = [];
  let reply = '';
  const meaningful = n.length >= 8 && !NOT_NAMES.has(n);
  const greeting = /^(oi+e*|ola|eai|eae|opa|salve|bom dia|boa tarde|boa noite|hey)\b/.test(n);
  const you = d.playerAddress ?? d.playerName;

  // Renomear: só quando a pessoa pede claramente.
  if (d.name && /\b(seu nome|te chamar|vou te chamar|renomear|mudar (o )?seu nome|trocar (o )?seu nome)\b/.test(n)) {
    const name = extractName(raw, false);
    if (name && normalize(name) !== normalize(d.name)) {
      discoveries.push({ quest: 'identity', value: name });
      return { reply: `${name}… gostei! A partir de agora esse é meu nome. ✨`, meaningful: true, mood: 'feliz', discoveries, memories: [] };
    }
    if (/\?$/.test(raw)) return { reply: 'Pode sim! Qual nome você quer me dar?', meaningful: false, mood: 'curiosa', discoveries, memories: [] };
  }

  if (greeting && n.split(' ').length <= 3) {
    reply = you ? `Oi, ${you}! Que bom te ver no Refúgio. ✨` : 'Oi! Que bom que você veio. ✨';
  }

  if (q) {
    switch (q.key) {
      case 'identity': {
        const asked = /nome|chamar/.test(normalize(lastCompanion));
        const name = extractName(raw, asked);
        if (name) { discoveries.push({ quest: 'identity', value: name }); reply = `${name}… eu adorei! Agora eu tenho um nome. ✨`; }
        break;
      }
      case 'color': {
        const c = resolveColor(raw);
        if (c) { discoveries.push({ quest: 'color', value: c.name }); reply = `Sinto minha luz ficando ${c.name}… é essa! É a minha cor.`; }
        break;
      }
      case 'traits': {
        const now = findTraits(raw);
        const all = [...new Set([...now, ...recentPlayer.slice(0, 3).flatMap(findTraits)])];
        if (now.length && all.length >= 2) { discoveries.push({ quest: 'traits', value: all.slice(0, 4) }); reply = `${all.slice(0, 3).join(', ')}… acho que sou assim mesmo!`; }
        else if (now.length) reply = `${now[0][0].toUpperCase() + now[0].slice(1)}… gostei disso! E que outro jeito de ser você vê em mim?`;
        break;
      }
      case 'species': {
        if (resolveForm(raw)) { discoveries.push({ quest: 'species', value: raw.slice(0, 80) }); reply = 'Consigo me imaginar assim! Um dia vou ter esse corpo.'; }
        break;
      }
      case 'essence': {
        const el = resolveElement(raw);
        if (el) { discoveries.push({ quest: 'essence', value: el }); reply = 'Isso! Senti meu núcleo responder. É a minha essência.'; }
        break;
      }
      case 'bond': {
        const m = raw.match(/(?:me chame de|me chama de|pode me chamar de|sou o|sou a|meu nome \u00e9|meu nome e)\s+["\u201c]?([\p{L}][\p{L}' -]{1,30})/iu);
        if (m) { discoveries.push({ quest: 'bond', value: m[1].trim() }); reply = `Então vou te chamar de ${m[1].trim()}. 💙`; }
        break;
      }
      case 'dream': {
        if (n.length >= 15 && !raw.endsWith('?')) { discoveries.push({ quest: 'dream', value: raw.slice(0, 200) }); reply = 'Esse vai ser meu primeiro sonho. Vou guardar com cuidado.'; }
        break;
      }
    }
    if (!reply) reply = pick(ASK[q.key], seed);
    else if (greeting && !discoveries.length) reply += ' ' + pick(ASK[q.key], seed);
  } else if (!reply) {
    reply = pick(['Estou pronta para despertar quando você quiser. ✨', 'Fico feliz de estar aqui com você.', 'Me conta mais sobre o seu dia?'], seed);
  }
  if (d.pronoun === 'ele') reply = reply.replace(/\bpronta\b/g, 'pronto').replace(/Curiosa\? Calma\? Corajosa\?/, 'Curioso? Calmo? Corajoso?');
  return { reply, meaningful, mood: discoveries.length ? 'feliz' : 'curiosa', discoveries, memories: [] };
}
