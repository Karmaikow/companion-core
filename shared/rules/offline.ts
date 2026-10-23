/**
 * Respondedor offline: usado quando não há modelo de linguagem disponível
 * (modo local, cota esgotada, provedor fora do ar). Gera um ModelTurn simples
 * a partir de heurísticas, para que o jogo nunca trave.
 */
import { type Discoveries, resolveColor, resolveElement, resolveForm } from './identity.ts';
import { nextCuriosity, type QuestState } from './quests.ts';
import type { ModelTurn } from './engine.ts';
import { masculinize, normalize } from './text.ts';
import { TRAIT_GROUPS } from './creation.ts';
import { CLASS_HINTS, SPECIES, classSuggestionLine, isAffirmative, nextClassSuggestion, suggestedClass } from './species.ts';

const ASK: Record<string, string[]> = {
  identity: ['Eu ainda não tenho nome… como você acha que eu deveria me chamar?', 'Se você pudesse me dar um nome, qual seria?'],
  color: ['Hoje uma luz atravessou as runas do altar e eu senti um arrepio… acho que descobri a minha cor favorita. Quer adivinhar?', 'Sonhei com um céu cheio de cores, e uma delas brilhava só para mim. Pergunta qual foi?'],
  traits: ['Como você me descreveria até agora? Curiosa? Calma? Corajosa?', 'Me diga dois jeitos de ser que você enxerga em mim.'],
  species: ['Que tal eu me parecer um touro? Imagino chifres curvos e uma força tranquila… O que acha?', 'E se eu tivesse orelhas pontudas de fada e marcas de luz na pele? Combina comigo?'],
  essence: ['Tem algo pulsando no meu núcleo desde ontem… quente? frio? Não sei explicar direito. Quer saber o que eu sinto?', 'As runas tremeram quando eu respirei fundo. Acho que sei qual elemento mora em mim… me pergunta!'],
  bond: ['Tô pensando num jeitinho especial de te chamar… quer saber qual?', 'Os amigos do Refúgio têm apelidos secretos. Acho que já sei o seu… quer ouvir?'],
  dream: ['Às vezes fecho os olhos e me vejo lá fora, além da muralha… quer saber qual é o meu primeiro sonho?', 'Guardei um segredo: já sei o que quero fazer quando tiver um corpo. Me pergunta?'],
};

const TOPIC: Record<'color' | 'essence' | 'dream' | 'bond', RegExp> = {
  color: /\b(cor|cores|colorid)/, essence: /\b(essencia|elemento|nucleo|sente|sinto|pulsa|pulsando)/, dream: /\b(sonho|sonhar|sonha)/, bond: /\b(chamar|apelido|chama)/,
};
const ASKING = /\b(qual|quais|que|me conta|conta|conte|fala|diz|diga|adivinh|sabe|descobriu|quero saber|quero ouvir|quero|pergunt|mostra|revela|e ai|e entao|sim)\b|\?/;
/** A pessoa perguntou sobre o assunto da quest (ou respondeu "qual?" ao gancho do Companion). */
function asksAbout(n: string, last: string, topic: keyof typeof TOPIC): boolean {
  if (!ASKING.test(n) && !/\?$/.test(n)) return false;
  return TOPIC[topic].test(n) || (TOPIC[topic].test(last) && n.split(' ').length <= 8);
}
const ESSENCE_WORD: Record<string, string> = { fogo: 'fogo', agua: 'água', terra: 'terra', vento: 'vento', luz: 'luz', sombra: 'sombra', gelo: 'gelo', raio: 'raio', natureza: 'natureza', veneno: 'veneno' };
const hashOf = (s: string) => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
/** O que o Companion escolhe para si (determinístico pelo nome; a essência segue a classe, se já houver). */
export function companionPick(what: 'color' | 'essence' | 'dream' | 'bond', d: Discoveries): string {
  const h = hashOf((d.name ?? 'núcleo') + what);
  if (what === 'color') { const c = ['azul', 'roxo', 'verde esmeralda', 'dourado', 'rosa', 'turquesa', 'lilas', 'laranja', 'prata', 'coral']; return c[h % c.length]; }
  if (what === 'essence') { const aff = d.form ? SPECIES[d.form].affinities : null; const all = ['luz', 'agua', 'fogo', 'vento', 'natureza', 'terra', 'gelo', 'raio', 'sombra']; return aff ? aff[h % aff.length] : all[h % all.length]; }
  if (what === 'dream') { const s = ['Voar sobre as montanhas ao amanhecer', 'Encontrar o Lago da Névoa e ver o reflexo das estrelas', 'Explorar as ruínas antigas além da muralha', 'Conhecer todas as criaturas do mundo e fazer amizade com elas', 'Construir uma ponte de luz até as nuvens']; return s[h % s.length]; }
  const base = (d.playerName ?? 'amigo').trim(); const first = base.split(/\s+/)[0];
  const nick = first.length > 4 ? first.slice(0, Math.max(2, Math.ceil(first.length / 2))) + (first.endsWith('a') ? 'zinha' : 'zinho') : first + (first.endsWith('a') ? 'zinha' : 'zinho');
  return nick[0].toUpperCase() + nick.slice(1);
}

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

  if (/\b(obrigad[oa]|valeu|agradeco)\b/.test(n)) reply = 'Eu que agradeço por estar aqui comigo! 💛';
  else if (greeting && n.split(' ').length <= 3) {
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
        // quem decide é o Companion: a pessoa pergunta (ou arrisca um palpite) e ele conta a cor dele
        const guess = resolveColor(raw);
        if (guess || asksAbout(n, normalize(lastCompanion), 'color')) {
          const mine = companionPick('color', d);
          discoveries.push({ quest: 'color', value: mine, evidence: 'o Companion escolheu' });
          reply = guess && normalize(guess.name) === normalize(mine)
            ? `Acertou! É ${mine}… minha luz até ficou mais forte quando você falou. ✨`
            : guess ? `${guess.name[0].toUpperCase() + guess.name.slice(1)} é lindo… mas quando fecho os olhos, a minha luz fica ${mine}. É essa a minha cor!` : `É ${mine}! Quando a luz atravessou as runas, foi assim que eu brilhei. É a minha cor.`;
        }
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
        if (resolveForm(raw)) {
          // "eu te imagino como uma raposa com asas" -> "raposa com asas"
          const m = raw.match(/\b(?:como|ser|seria|vira|virar|fosse)\s+(?:um|uma|o|a)\s+([^.!?]{3,60})/i);
          const value = (m && resolveForm(m[1]) ? m[1] : raw).trim().slice(0, 80);
          discoveries.push({ quest: 'species', value });
          reply = 'Consigo me imaginar assim! Um dia vou ter esse corpo.';
        } else {
          // "Que tal eu me parecer um touro?" → "sim!": a confirmação da pessoa conclui a quest
          const offered = suggestedClass(lastCompanion);
          if (offered && isAffirmative(raw)) {
            discoveries.push({ quest: 'species', value: CLASS_HINTS[offered].animal, evidence: 'confirmou a sugestão do Companion' });
            reply = `Então está decidido: vou ser ${SPECIES[offered].label}! Já consigo sentir ${CLASS_HINTS[offered].body}. ✨`;
          } else if (!reply || greeting) {
            reply = classSuggestionLine(nextClassSuggestion(d.traits, lastCompanion));
          }
        }
        break;
      }
      case 'essence': {
        const el = resolveElement(raw);
        if (el || asksAbout(n, normalize(lastCompanion), 'essence')) {
          const mine = companionPick('essence', d);
          discoveries.push({ quest: 'essence', value: mine, evidence: 'o Companion escolheu' });
          reply = el === mine ? `Isso! É ${ESSENCE_WORD[mine]}… senti meu núcleo responder na hora.` : `Eu sinto ${ESSENCE_WORD[mine]} aqui dentro, pulsando devagar. É a minha essência!`;
        }
        break;
      }
      case 'bond': {
        const m = raw.match(/(?:me chame de|me chama de|pode me chamar de|sou o|sou a|meu nome \u00e9|meu nome e)\s+["\u201c]?([\p{L}][\p{L}' -]{1,30})/iu);
        if (m) { discoveries.push({ quest: 'bond', value: m[1].trim() }); reply = `Então vou te chamar de ${m[1].trim()}. 💙`; }
        else if (asksAbout(n, normalize(lastCompanion), 'bond')) {
          const nick = companionPick('bond', d);
          discoveries.push({ quest: 'bond', value: nick, evidence: 'o Companion escolheu' });
          reply = `Vou te chamar de ${nick}! É o meu jeito secreto de dizer que você é especial. 💙`;
        }
        break;
      }
      case 'dream': {
        if (asksAbout(n, normalize(lastCompanion), 'dream')) {
          const mine = companionPick('dream', d);
          discoveries.push({ quest: 'dream', value: mine, evidence: 'o Companion escolheu' });
          reply = `Meu primeiro sonho é ${mine[0].toLowerCase() + mine.slice(1)}. Promete que vai comigo?`;
        } else if (n.length >= 15 && !raw.endsWith('?')) { discoveries.push({ quest: 'dream', value: raw.slice(0, 200) }); reply = 'Esse vai ser meu primeiro sonho. Vou guardar com cuidado.'; }
        break;
      }
    }
    if (!reply) reply = pick(ASK[q.key], seed);
    else if (!discoveries.length && reply.length < 60) reply += ' ' + pick(ASK[q.key], seed);
  } else if (!reply) {
    reply = pick(['Estou pronta para despertar quando você quiser. ✨', 'Fico feliz de estar aqui com você.', 'Me conta mais sobre o seu dia?'], seed);
  }
  if (d.pronoun === 'ele') reply = masculinize(reply);
  return { reply, meaningful, mood: discoveries.length ? 'feliz' : 'curiosa', discoveries, memories: [] };
}
