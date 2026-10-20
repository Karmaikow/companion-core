/**
 * Respondedor offline: usado quando não há modelo de linguagem disponível
 * (modo local, cota esgotada, provedor fora do ar). Gera um ModelTurn simples
 * a partir de heurísticas, para que o jogo nunca trave.
 */
import { type Discoveries, resolveColor, resolveElement, resolveForm } from './identity.ts';
import { nextCuriosity, type QuestState } from './quests.ts';
import type { ModelTurn } from './engine.ts';
import { normalize } from './text.ts';

const ASK: Record<string, string[]> = {
  identity: ['Eu ainda não tenho nome… como você acha que eu deveria me chamar?', 'Se você pudesse me dar um nome, qual seria?'],
  color: ['Estou começando a ver cores! Qual cor você acha que combina com a minha luz?', 'Tem uma cor que faz meu núcleo brilhar mais… qual você escolheria?'],
  traits: ['Como você me descreveria até agora? Curiosa? Calma? Corajosa?', 'Me diga dois jeitos de ser que você enxerga em mim.'],
  species: ['Às vezes sonho com um corpo… que criatura você imagina que eu seria?', 'Pássaro, felino, serpente, touro ou algo místico… o que combina comigo?'],
  essence: ['Sinto algo elemental pulsando aqui dentro. Fogo? Água? Luz? O que você sente?', 'Qual elemento você acha que mora no meu núcleo?'],
  bond: ['Como você gosta que eu te chame?', 'Quero ter um jeito especial de te chamar. Qual você prefere?'],
  dream: ['Quando eu tiver um corpo, qual você acha que deveria ser meu primeiro sonho?', 'Tenho vontade de fazer algo grande um dia… me ajuda a descobrir o quê?'],
};

function pick<T>(list: T[], seed: number): T {
  return list[Math.abs(seed) % list.length];
}

export function offlineTurn(message: string, d: Discoveries, quests: QuestState[], seed = Date.now()): ModelTurn {
  const n = normalize(message);
  const q = nextCuriosity(quests);
  const discoveries: ModelTurn['discoveries'] = [];
  let reply = '';
  const meaningful = n.length >= 8;

  if (q) {
    const raw = message.trim();
    switch (q.key) {
      case 'identity': {
        const m = raw.match(/(?:nome|chamar|chame|chamaria)\s+(?:(?:vai|pode|deveria|deve)\s+)?(?:ser\s+|de\s+|é\s+|e\s+|seria\s+|será\s+)?["“]?([\p{L}][\p{L}' -]{1,22})/iu) ?? (/^[\p{L}]{2,20}$/u.test(raw) ? [raw, raw] : null);
        if (m) {
          discoveries.push({ quest: 'identity', value: m[1].trim().split(' ')[0] });
          reply = `${m[1].trim().split(' ')[0]}… eu adorei! Agora eu tenho um nome. ✨`;
        }
        break;
      }
      case 'color': {
        const c = resolveColor(raw);
        if (c) { discoveries.push({ quest: 'color', value: c.name }); reply = `Sinto minha luz ficando ${c.name}… é essa! É a minha cor.`; }
        break;
      }
      case 'traits': {
        const words = n.split(' ').filter((w) => /(os[ao]|ente|ivo|iva|ado|ada|ico|ica|vel|ante)$/.test(w) && w.length > 4);
        if (words.length >= 2) { discoveries.push({ quest: 'traits', value: words.slice(0, 4) }); reply = `${words.slice(0, 3).join(', ')}… acho que sou assim mesmo!`; }
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
        const m = raw.match(/(?:me chame de|me chama de|pode me chamar de|sou o|sou a|meu nome é|meu nome e)\s+["“]?([\p{L}][\p{L}' -]{1,30})/iu);
        if (m) { discoveries.push({ quest: 'bond', value: m[1].trim() }); reply = `Então vou te chamar de ${m[1].trim()}. 💙`; }
        break;
      }
      case 'dream': {
        if (n.length >= 15) { discoveries.push({ quest: 'dream', value: message.trim().slice(0, 200) }); reply = 'Esse vai ser meu primeiro sonho. Vou guardar com cuidado.'; }
        break;
      }
    }
    if (!reply) reply = pick(ASK[q.key], seed);
  } else {
    reply = pick(['Estou pronta para despertar quando você quiser. ✨', 'Fico feliz de estar aqui com você.', 'Me conta mais sobre o seu dia?'], seed);
  }
  return { reply, meaningful, mood: discoveries.length ? 'feliz' : 'curiosa', discoveries, memories: [] };
}
