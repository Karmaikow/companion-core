import { resolveIdentityQuestion } from './identity-grounding.js';
import type { AIContext, AIProvider } from './ai-provider.js';

export interface OllamaProviderOptions {
  /** Base URL of Ollama or an authenticated HTTPS gateway in front of it. */
  baseUrl?: string;
  model?: string;
  /** Used only when the configured gateway expects Bearer authentication. */
  token?: string;
}

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'gemma3:4b';

function isLoopback(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '[::1]';
}

function chatEndpoint(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('MAYUNA_OLLAMA_BASE_URL precisa ser uma URL válida.');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('O endpoint do Ollama deve usar HTTPS ou HTTP local.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Configure autenticação em MAYUNA_OLLAMA_TOKEN, não na URL.');
  }
  if (url.protocol === 'http:' && !isLoopback(url.hostname)) {
    throw new Error('Ollama remoto exige HTTPS. HTTP é permitido apenas para loopback.');
  }

  const path = url.pathname.replace(/\/+$/, '');
  if (path.endsWith('/api/chat')) return url.toString();
  url.pathname = path.endsWith('/api') ? `${path}/chat` : `${path}/api/chat`;
  return url.toString();
}

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  private readonly endpoint: string;
  private readonly model: string;
  private readonly token?: string;

  constructor(options: OllamaProviderOptions = {}) {
    this.endpoint = chatEndpoint(options.baseUrl?.trim() || DEFAULT_BASE_URL);
    this.model = options.model?.trim() || DEFAULT_MODEL;
    this.token = options.token?.trim() || undefined;
  }

  async generateResponse(context: AIContext): Promise<string> {
    const groundedIdentity = resolveIdentityQuestion(context);
    if (groundedIdentity !== null) return groundedIdentity;

    const messages = [
      { role: 'system' as const, content: context.systemPrompt },
      ...context.recentMessages.map(message => ({
        role: message.role === 'USER' ? 'user' : message.role === 'COMPANION' ? 'assistant' : 'system',
        content: message.content
      })),
      { role: 'user' as const, content: context.userMessage }
    ];

    const started = performance.now();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    const response = await fetch(this.endpoint, {
      method: 'POST',
      signal: AbortSignal.timeout(120_000),
      headers,
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        options: { temperature: 0.75, num_ctx: 2048, num_predict: 256 }
      })
    });

    if (!response.ok) {
      // Do not pass a gateway/Ollama response body to chat logs or the client.
      throw new Error(`Ollama respondeu com erro HTTP ${response.status}.`);
    }

    const data = await response.json();
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

    const content = data?.message?.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new Error('Ollama não retornou uma resposta válida.');
    }
    return content.trim();
  }
}
