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
  return null;
}
