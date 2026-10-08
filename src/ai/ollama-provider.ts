import { resolveIdentityQuestion } from './identity-grounding.js';
import type {
  AIContext,
  AIProvider
} from './ai-provider.js';

export class OllamaProvider
  implements AIProvider {

  readonly name = 'ollama';

  private readonly endpoint =
    'http://localhost:11434/api/chat';

  private readonly model =
    'gemma3:4b';

  async generateResponse(
    context: AIContext
  ): Promise<string> {
    const groundedIdentity = resolveIdentityQuestion(context);
    if (groundedIdentity !== null) return groundedIdentity;

    const messages = [
      {
        role: 'system' as const,
        content: context.systemPrompt
      },

      ...context.recentMessages.map(
        message => ({
          role:
            message.role === 'USER'
              ? 'user'
              : message.role === 'COMPANION'
                ? 'assistant'
                : 'system',

          content:
            message.content
        })
      ),

      {
        role: 'user' as const,
        content: context.userMessage
      }
    ];

    const started = performance.now();
    const response =
      await fetch(
        this.endpoint,
        {
          method: 'POST',
          signal: AbortSignal.timeout(120_000),

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            model: this.model,

            messages,

            stream: false,

            options: {
              temperature: 0.75,

              num_ctx: 2048,

              num_predict: 256
            }
          })
        }
      );

    if (!response.ok) {
      const errorText =
        await response.text();

      throw new Error(
        `Ollama respondeu com erro ${response.status}: ${errorText}`
      );
    }

    const data =
      await response.json();

    if (process.env.MAYUNA_DIAGNOSTICS === '1') {
      // Timing only: do not log prompts, messages, memory content or credentials.
      console.info('[Mayuna timing] Ollama', {
        requestMs: Math.round(performance.now() - started),
        totalMs: typeof data.total_duration === 'number' ? Math.round(data.total_duration / 1e6) : null,
        loadMs: typeof data.load_duration === 'number' ? Math.round(data.load_duration / 1e6) : null,
        promptMs: typeof data.prompt_eval_duration === 'number' ? Math.round(data.prompt_eval_duration / 1e6) : null,
        generationMs: typeof data.eval_duration === 'number' ? Math.round(data.eval_duration / 1e6) : null,
        promptTokens: data.prompt_eval_count ?? null,
        responseTokens: data.eval_count ?? null
      });
    }
    const content =
      data?.message?.content;

    if (
      typeof content !== 'string' ||
      content.trim().length === 0
    ) {
      throw new Error(
        'Ollama não retornou uma resposta válida.'
      );
    }

    return content.trim();
  }
}
