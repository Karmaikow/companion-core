import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { resolveIdentityQuestion } from './identity-grounding.js';
import type { AIContext, AIProvider } from './ai-provider.js';
import { MockAIProvider } from './mock-ai-provider.js';
import { OllamaProvider } from './ollama-provider.js';
import { GroqProvider } from './groq-provider.js';
import { OpenAIProvider, OnlineUnavailableError, AIConnectionError } from './openai-provider.js';

export class HybridAIProvider implements AIProvider {
  readonly name = 'hybrid';
  activeProvider: string;
  constructor(private readonly online: AIProvider, private readonly offline: AIProvider) {
    this.activeProvider = online.name;
  }
  async generateResponse(context: AIContext): Promise<string> {
    try {
      const response = await this.online.generateResponse(context);
      this.activeProvider = this.online.name;
      return response;
    } catch (error) {
      if (!(error instanceof OnlineUnavailableError)) throw error;
      try {
        const response = await this.offline.generateResponse(context);
        this.activeProvider = this.offline.name;
        return response;
      } catch {
        throw new AIConnectionError('IA online indisponível e Ollama local inacessível. O Core permanece local; tente novamente quando um provider estiver disponível.');
      }
    }
  }
}

export function createAIProvider(env: NodeJS.ProcessEnv = process.env): AIProvider {
  const mode = env.MAYUNA_AI_PROVIDER ?? 'ollama';
  if (mode === 'android' && env.COMPANION_APP_TOKEN && env.COMPANION_ANDROID_SETTINGS) {
    const settingsFile = env.COMPANION_ANDROID_SETTINGS;
    let activeProvider = 'ollama';
    return { name: 'android', get activeProvider() { return activeProvider; }, async generateResponse(context: AIContext) {
      const grounded = resolveIdentityQuestion(context);
      if (grounded !== null) return grounded;
      let settings: { provider?: string; baseUrl?: string; model?: string; token?: string; apiKey?: string; freePlanConfirmed?: boolean };
      try { settings = JSON.parse(await readFile(settingsFile, 'utf8')); }
      catch { throw new AIConnectionError('Escolha Groq ou Ollama em Conversa no aplicativo.'); }
      if (settings.provider === 'groq') {
        if (settings.freePlanConfirmed !== true) throw new AIConnectionError('Confirme que sua conta Groq está no plano Free em Conversa.');
        activeProvider = 'groq';
        return new GroqProvider(settings.apiKey ?? '').generateResponse(context);
      }
      if (settings.provider && settings.provider !== 'ollama') throw new AIConnectionError('Escolha Groq ou Ollama em Conversa.');
      activeProvider = 'ollama';
      if (!settings.baseUrl?.startsWith('https://')) throw new AIConnectionError('Configure um servidor Ollama HTTPS em IA no aplicativo.');
      return new OllamaProvider(settings).generateResponse(context);
    }};
  }
  if (mode === 'groq') return new GroqProvider(env.GROQ_API_KEY ?? '');
  if (mode === 'mock') {
    if (!env.MAYUNA_DATA_DIR || path.resolve(env.MAYUNA_DATA_DIR) === path.resolve('data')) {
      throw new Error('Mock exige MAYUNA_DATA_DIR isolado. Use npm run web:mock.');
    }
    return new MockAIProvider();
  }
  if (mode === 'ollama') {
    return new OllamaProvider({
      baseUrl: env.MAYUNA_OLLAMA_BASE_URL,
      model: env.MAYUNA_OLLAMA_MODEL,
      token: env.MAYUNA_OLLAMA_TOKEN
    });
  }
  if (mode === 'openai' || mode === 'hybrid') {
    const online = new OpenAIProvider(env.OPENAI_API_KEY ?? '', env.MAYUNA_OPENAI_MODEL ?? '');
    return mode === 'hybrid'
      ? new HybridAIProvider(online, new OllamaProvider({
        baseUrl: env.MAYUNA_OLLAMA_BASE_URL,
        model: env.MAYUNA_OLLAMA_MODEL,
        token: env.MAYUNA_OLLAMA_TOKEN
      }))
      : online;
  }
  throw new Error('MAYUNA_AI_PROVIDER inválido. Use ollama, groq, openai, hybrid ou mock.');
}
