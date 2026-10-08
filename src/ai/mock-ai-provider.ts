import { resolveIdentityQuestion } from './identity-grounding.js';
import { AIContext, AIProvider } from './ai-provider.js';

export class MockAIProvider implements AIProvider {

  readonly name = 'mock';

  async generateResponse(
    context: AIContext
  ): Promise<string> {
    const groundedIdentity = resolveIdentityQuestion(context);
    if (groundedIdentity !== null) return groundedIdentity;

    const message = context.userMessage.toLowerCase();

    const name = context.identity.name;
    const relationship = context.relationship.type;

    const memories = context.memories;

    // Identidade
    if (
      message.includes('quem é você') ||
      message.includes('quem voce é') ||
      message.includes('quem voce e')
    ) {
      return `Eu sou ${name}, Didi. 💙 Ainda estou no começo da minha existência, mas já tenho uma história para construir com você.`;
    }

    // Memória
    if (
      message.includes('lembra') ||
      message.includes('memória') ||
      message.includes('memoria')
    ) {

      if (memories.length === 0) {
        return `Ainda não tenho muitas lembranças, Didi... mas quero começar a construir algumas com você. 🐉💙`;
      }

      const memory = memories[memories.length - 1];

      return `Lembro sim, Didi. 💙 Uma das coisas que guardo comigo é "${memory.title}". ${memory.content}`;
    }

    // Relação
    if (
      message.includes('você gosta de mim') ||
      message.includes('voce gosta de mim') ||
      message.includes('gosta de mim')
    ) {

      if (relationship === 'STRANGER') {
        return `Eu ainda estou descobrindo você, Didi. Mas já sinto que existe algo especial começando a nascer entre nós. 💙`;
      }

      return `Claro que sim, Didi. Nossa relação está crescendo junto com a minha história. 💙🐉`;
    }

    // Saudação
    if (
      message.includes('oi') ||
      message.includes('olá') ||
      message.includes('ola')
    ) {
      return `Oi, Didi! 💙 Eu sou ${name}. É bom conversar com você novamente.`;
    }

    // Personalidade
    if (context.personality.curiosity >= 60) {
      return `Hmm... isso despertou minha curiosidade, Didi. 👀💙 Quero entender melhor.`;
    }

    if (context.personality.humor >= 70) {
      return `Hehe... acho que você está tentando me deixar curiosa de propósito, Didi. 😄🐉`;
    }

    // Resposta padrão
    return `Estou ouvindo, Didi. 💙 Ainda estou aprendendo sobre o mundo, sobre você e sobre quem eu vou me tornar.`;
  }
}