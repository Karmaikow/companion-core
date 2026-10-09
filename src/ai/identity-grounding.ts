import type { AIContext } from './ai-provider.js';
/** Narrow questions grounded in profile, not model guesses. Never writes memories. */
export function resolveIdentityQuestion(context: AIContext): string | null {
  const person = context.knownPerson;
  if (!person?.name || !person.preferredAddress) return null;
  const query = context.userMessage.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\bpreferid([oa]s?)\b/g, 'favorit$1').replace(/[?!.,;:]/g, ' ').replace(/\s+/g, ' ').trim();
  const question = query.replace(/^(?:(?:oi+e?|ola|estou bem|tudo bem|mayuna|obrigado|sim)\s+)+/, '');
  if (/(?:o que|oq) (?:voce )?(?:fez|estava fazendo)(?: (?:nes+s+e|no|durante) (?:tempo|periodo|intervalo))?/.test(query) || /o que voce fez enquanto eu estava fora/.test(query)) {
    return `Enquanto a conversa estava pausada, eu não fiz atividades nem conversei com ninguém, ${person.preferredAddress}. Posso retomar com você daqui. 💙`;
  }
  if (/^(?:qual (?:e )?(?:o )?meu nome completo|voce sabe (?:o )?meu nome completo)$/.test(question)) {
    return `Conheço você como ${person.name} e te chamo de ${person.preferredAddress}. Seu nome completo não está registrado no meu perfil.`;
  }
  if (/^(?:qual (?:e )?(?:o )?meu nome|como (?:eu )?me chamo|voce sabe (?:qual (?:e )?)?(?:o )?meu nome|quem (?:eu )?sou(?: eu)?|voce (?:me conhece|lembra de mim)|lembra de mim)$/.test(question)) {
    return `Você é ${person.name}, meu companheiro. Eu te conheço como ${person.preferredAddress}. 💙`;
  }

  if (/\b(?:qual (?:e )?(?:a )?minha cor favorita|qual (?:e )?(?:a )?minha cor preferida|voce lembra da minha cor favorita)\b/.test(question)) {
    const color = context.memories.filter(item => {
      const text = `${item.title} ${item.content}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const owner = person.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return text.includes('cor favorita') && text.includes(owner);
    }).map(item => item.content.match(/(?:cor favorita (?:e|é)|cor favorita\s*:)\s*([^.!?]+)/i)?.[1]?.trim())
      .find(value => value && !/^(?:vc sabe|voce sabe|nao sei|nao lembro|qual|o que)$/i.test(value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
    if (color) return `Você me contou que sua cor favorita é ${color.replace(/^(?:a|o)\s+/i, '')}. 💚`;
    return `Você ainda não me contou qual é sua cor favorita, ${person.preferredAddress}. 😊`;
  }

  if (/\b(?:quais (?:sao )?(?:os )?meus animais misticos favoritos|qual (?:e )?(?:o )?meu animal favorito|qual (?:e )?(?:o )?meu bicho favorito|quais (?:sao )?(?:os )?meus animais favoritos|me lembra (?:qual (?:e )?)?(?:o )?meu animal favorito)\b/.test(question)) {
    const asksMystical = /animais misticos favoritos/.test(question);
    const memory = context.memories.find(item => {
      const text = `${item.title} ${item.content}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const topicMatches = asksMystical ? /animais misticos favoritos de/.test(text) : /animal favorito de|bicho favorito de/.test(text);
      return topicMatches && text.includes(person.name.toLowerCase());
    });
    const content = memory?.content.toLowerCase();
    const animals = content?.match(/(?:favorito (?:é|e|são|sao|seria|seriam)|favoritos (?:são|sao|seriam)|favorito\s*:)\s*(?:(?:um|uma|os|as)\s+)?([^.!?,]+)/i)?.[1]?.trim();
    const colorStoredAsAnimal = /^(?:azul|azul-safira|verde|verde-musgo|vermelho|amarelo|roxo|preto|branco|rosa|laranja|cinza)$/i.test(animals ?? '');
    if (animals && !colorStoredAsAnimal) return asksMystical
      ? `Você me contou que seus animais místicos favoritos são ${animals}. 💙`
      : `Você me contou que seu animal favorito é ${animals}. 💙`;
    return asksMystical
      ? `Você ainda não me contou quais são seus animais místicos favoritos, ${person.preferredAddress}. 😊`
      : `Você ainda não me contou qual é seu animal favorito, ${person.preferredAddress}. 😊`;
  }

  if (/\b(?:(?:e )?seu animal favorito (?:e )?qual|qual (?:e )?(?:o )?seu animal favorito|qual animal voce prefere|qual (?:e )?(?:o )?seu passaro mistico favorito)\b/.test(question)) {
    const isMysticBird = /passaro mistico/.test(question);
    const memory = context.memories.find(item => {
      const text = `${item.title} ${item.content}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const kindMatches = isMysticBird ? /passaro mistico favorito de/.test(text) : /animal favorito de/.test(text);
      return kindMatches && text.includes(context.identity.name.toLowerCase());
    });
    if (memory) {
      const prefix = isMysticBird
        ? `${context.identity.name} imaginou que seu pássaro místico favorito seria `
        : `${context.identity.name} escolheu `;
      const fact = memory.content.toLowerCase().startsWith(prefix.toLowerCase())
        ? memory.content.slice(prefix.length).replace(/[.!?]+$/, '').trim()
        : '';
      if (fact) return isMysticBird ? `Meu pássaro místico favorito é ${fact}. 💙` : `Meu animal favorito é ${fact}. 💙`;
    }
    // Let the Companion choose once. InteractionEngine records that first
    // answer so later sessions can stay consistent.
    return null;
  }

  if (/\b(?:voce tem (?:uma )?cor favorita|qual (?:e )?(?:a )?sua cor favorita|qual (?:e )?(?:a )?sua cor preferida)\b/.test(question)) {
    const color = context.companionPreferences?.favoriteColor;
    if (color) return `Minha cor favorita é ${color}. 💙`;
  }
  return null;
}
