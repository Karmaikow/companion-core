import type { AIContext, AIProvider } from './ai-provider.js';
import { resolveIdentityQuestion } from './identity-grounding.js';

export class AIConnectionError extends Error {}
export class OnlineUnavailableError extends AIConnectionError {}

/** Expression only. Never receives a private key, Core handle or mutation tools. */
export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  constructor(private readonly apiKey: string, private readonly model: string) {
    if (!apiKey.trim()) throw new Error('Configure OPENAI_API_KEY no backend.');
    if (!model.trim()) throw new Error('Configure MAYUNA_OPENAI_MODEL no backend.');
  }

  async generateResponse(context: AIContext): Promise<string> {
    const grounded = resolveIdentityQuestion(context);
    if (grounded !== null) return grounded;
    let response: Response;
    let data: any;
    try {
      response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model, store: false, max_output_tokens: 1024,
          instructions: context.systemPrompt,
          input: [
            ...context.recentMessages.map(message => ({
              role: message.role === 'USER' ? 'user' : message.role === 'COMPANION' ? 'assistant' : 'user',
              content: message.content
            })),
            { role: 'user', content: context.userMessage }
          ]
        })
      });
      // Do not relay provider error bodies: they may include request data.
      if (!response.ok) {
        const detail = response.status === 401 ? 'Confira a chave da API no backend.'
          : response.status === 429 ? 'Confira a cota e os limites da API.'
          : 'Confira o modelo configurado e a disponibilidade da API.';
        throw new AIConnectionError(`OpenAI HTTP ${response.status}. ${detail}`);
      }
      data = await response.json();
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError' || error instanceof TypeError)) {
        throw new OnlineUnavailableError('Não foi possível alcançar a IA online dentro do prazo.');
      }
      throw error;
    }
    if (data.status !== 'completed') throw new AIConnectionError('A IA online não concluiu a resposta. Tente novamente.');
    const text = (Array.isArray(data.output) ? data.output : [])
      .filter((item: any) => item.type === 'message' && item.role === 'assistant')
      .flatMap((item: any) => Array.isArray(item.content) ? item.content : [])
      .filter((item: any) => item.type === 'output_text' && typeof item.text === 'string')
      .map((item: any) => item.text).join('\n').trim();
    if (!text) throw new AIConnectionError('A IA online não retornou uma resposta textual válida.');
    return text;
  }
}
