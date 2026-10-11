import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { resolveIdentityQuestion } from './identity-grounding.js';
import type { AIContext, AIProvider } from './ai-provider.js';
import { MockAIProvider } from './mock-ai-provider.js';
import { OllamaProvider } from './ollama-provider.js';
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
    return { name: 'ollama', async generateResponse(context: AIContext) {
      const grounded = resolveIdentityQuestion(context);
      if (grounded !== null) return grounded;
      let settings: { baseUrl?: string; model?: string; token?: string };
      try { settings = JSON.parse(await readFile(settingsFile, 'utf8')); }
      catch { throw new AIConnectionError('Configure um servidor Ollama em IA no aplicativo.'); }
      if (!settings.baseUrl?.startsWith('https://')) throw new AIConnectionError('Configure um servidor Ollama HTTPS em IA no aplicativo.');
      return new OllamaProvider(settings).generateResponse(context);
    }};
  }
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
  throw new Error('MAYUNA_AI_PROVIDER inválido. Use ollama, openai, hybrid ou mock.');
}
