import type { AIContext } from './ai-provider.js';
/** Narrow questions grounded in profile, not model guesses. Never writes memories. */
export function resolveIdentityQuestion(context: AIContext): string | null {
  const person = context.knownPerson;
  if (!person?.name || !person.preferredAddress) return null;
  const query = context.userMessage.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[?!.,;:]/g, ' ').replace(/\s+/g, ' ').trim();
  const question = query.replace(/^(?:(?:oi|ola|estou bem|tudo bem|mayuna|obrigado|sim)\s+)+/, '');
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
    const memory = context.memories.find(item => {
      const text = `${item.title} ${item.content}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return text.includes('cor favorita') && text.includes(person.name.toLowerCase());
    });
    const color = memory?.content.match(/(?:cor favorita (?:e|é)|cor favorita\s*:)\s*([^.!?]+)/i)?.[1]?.trim();
    if (color) return `Você me contou que sua cor favorita é ${color}. 💚`;
  }

  if (/\b(?:qual (?:e )?(?:o )?meu animal favorito|qual (?:e )?(?:o )?meu bicho favorito|quais (?:sao )?(?:os )?meus animais favoritos|me lembra (?:qual (?:e )?)?(?:o )?meu animal favorito)\b/.test(question)) {
    const memory = context.memories.find(item => {
      const text = `${item.title} ${item.content}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return /animal(?:is)? favorito|bicho(?:s)? favorito/.test(text) && text.includes(person.name.toLowerCase());
    });
    const animals = memory?.content.match(/(?:favoritos? (?:são|sao|e)|favoritos?\s*:)\s*([^.!?]+)/i)?.[1]?.trim();
    if (animals) return `Você me contou que seus animais favoritos são ${animals}. 💙`;
  }

  if (/\b(?:qual (?:e )?(?:a )?sua cor favorita|qual (?:e )?(?:a )?sua cor preferida)\b/.test(question)) {
    const color = context.companionPreferences?.favoriteColor;
    if (color) return `Minha cor favorita é ${color}. 💙`;
  }
  return null;
}
