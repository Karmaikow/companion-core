import { resolvePreferenceQuestion } from './preference-grounding.js';
import type { AIContext } from './ai-provider.js';
/** Narrow questions grounded in profile, not model guesses. Never writes memories. */
export function resolveIdentityQuestion(context: AIContext): string | null {
  const person = context.knownPerson;
  if (!person?.name || !person.preferredAddress) return null;
  const query = context.userMessage.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\bpreferid([oa]s?)\b/g, 'favorit$1').replace(/[?!.,;:]/g, ' ').replace(/\s+/g, ' ').trim();
  const question = query.replace(/^(?:(?:oi+e?|ola|estou bem|tudo bem|mayuna|obrigado|sim)\s+)+/, '');
  if (context.firstMeeting && /^(?:(?:oi+e?|ola) )?(?:oi+e?|ola|bom dia|boa tarde|boa noite)$/.test(query)) {
    return `Olá, ${person.preferredAddress}! Sou ${context.identity.name}, sua Companion. Ainda sou uma alma e quero aprender com você. Estamos no Refúgio, nosso espaço em um mundo de fantasia em construção. Que tal me contar algo de que gosta ou imaginar comigo uma forma futura? ✨`;
  }
  if (/(?:o que|oq) (?:voce )?(?:fez|estava fazendo)(?: (?:nes+s+e|no|durante) (?:tempo|periodo|intervalo))?/.test(query) || /o que voce fez enquanto eu estava fora/.test(query)) {
    return `Enquanto a conversa estava pausada, eu não fiz atividades nem conversei com ninguém, ${person.preferredAddress}. Posso retomar com você daqui. 💙`;
  }
  const asksCurrentLocation =
    /\b(?:onde|aonde)\s+(?:voce|vc|tu)\s+(?:esta|ta|fica|se encontra)\b/.test(query);
  if (asksCurrentLocation && !/\b(?:aconteceu|houve|novidade|novidades|mist[eé]rio|aventura)\b/.test(query))
    return `Estou no Refúgio, ${person.preferredAddress}, nosso espaço particular.`;
  if (/^(?:qual (?:e )?(?:o )?meu nome completo|voce sabe (?:o )?meu nome completo)$/.test(question)) {
    return `Conheço você como ${person.name} e te chamo de ${person.preferredAddress}. Seu nome completo não está registrado no meu perfil.`;
  }
  if (/\b(?:voce )?me reconhece\b|\bvoce lembra quem eu sou\b|\bvolt(?:ei|ei)\b.*\bme conhece\b/.test(question)) {
    return `Sim, eu te reconheço, ${person.preferredAddress}! É bom ter você de volta. 💙`;
  }
  if (/^(?:qual (?:e )?(?:o )?meu nome|como (?:eu )?me chamo|voce sabe (?:qual (?:e )?)?(?:o )?meu nome|quem (?:eu )?sou(?: eu)?|voce (?:me conhece|lembra de mim)|lembra de mim)$/.test(question)) {
    return `Você é ${person.name}, meu companheiro. Eu te conheço como ${person.preferredAddress}. 💙`;
  }

  return resolvePreferenceQuestion(context);
}
