import type { AIContext, AIProvider } from './ai-provider.js';
import { resolveIdentityQuestion } from './identity-grounding.js';
import { AIConnectionError } from './openai-provider.js';

export const GROQ_MODEL = 'openai/gpt-oss-20b';

/** User's own Groq key; expression context only, no tools or Core/private keys. */
export class GroqProvider implements AIProvider {
  readonly name = 'groq';
  constructor(private readonly apiKey: string) {
    if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey)) throw new AIConnectionError('Configure sua chave Groq em Conversa no aplicativo.');
  }
  async generateResponse(context: AIContext): Promise<string> {
    const grounded = resolveIdentityQuestion(context);
    if (grounded !== null) return grounded;
    let response: Response;
    try {
      response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey.trim()}` },
        body: JSON.stringify({
          model: GROQ_MODEL, stream: false, reasoning_effort: 'low', include_reasoning: false, max_completion_tokens: 2048,
          messages: [
            { role: 'system', content: context.systemPrompt },
            ...context.recentMessages.map(message => ({ role: message.role === 'USER' ? 'user' : message.role === 'COMPANION' ? 'assistant' : 'system', content: message.content })),
            { role: 'user', content: context.userMessage },
          ],
        }),
      });
    } catch {
      throw new AIConnectionError('Não foi possível conectar ao Groq. Confira sua internet e tente novamente.');
    }
    // Response bodies can contain prompts or credentials. Never relay them.
    if (!response.ok) {
      const message = response.status === 429 ? 'Limite do Groq atingido. Aguarde a renovação da cota; nenhum outro serviço foi acionado.'
        : response.status === 401 || response.status === 403 ? 'Chave Groq inválida ou sem acesso. Confira a chave em Conversa.'
        : response.status === 400 || response.status === 404 ? 'O modelo Groq não está disponível para esta conta. Confira o acesso no painel Groq.'
        : 'Groq indisponível no momento. Tente novamente mais tarde.';
      throw new AIConnectionError(message);
    }
    let data: any;
    try { data = await response.json(); } catch { throw new AIConnectionError('Groq retornou uma resposta inválida.'); }
    const choice = data?.choices?.[0];
    const text = choice?.message?.content;
    if (choice?.finish_reason !== 'stop' || typeof text !== 'string' || !text.trim() || text.length > 24000) {
      throw new AIConnectionError('Groq não concluiu uma resposta textual válida. Tente uma mensagem mais curta.');
    }
    return text.trim();
  }
}
