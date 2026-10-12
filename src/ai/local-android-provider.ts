import path from 'node:path';
import { stat } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { AIContext, AIProvider } from './ai-provider.js';
import { AIConnectionError } from './openai-provider.js';
import { resolveIdentityQuestion } from './identity-grounding.js';

/** Private packaged executable. No external endpoint or automatic online fallback. */
export class LocalAndroidProvider implements AIProvider {
  readonly name = 'local';
  private child?: ChildProcess;
  private loading?: Promise<void>;
  private idle?: NodeJS.Timeout;
  private readonly key = Buffer.from(randomBytes(32)).toString('hex');
  private readonly endpoint = 'http://127.0.0.1:4188';
  constructor(private readonly directory: string, private readonly nativeDirectory: string) {}
  stop() { clearTimeout(this.idle); this.child?.kill('SIGKILL'); this.child = undefined; }
  private async start() {
    let size = 0;
    try { size = (await stat(path.join(this.directory, 'models', 'qwen-1.5b-q4.gguf'))).size; } catch {}
    if (size !== 1117320736) throw new AIConnectionError('Baixe a IA local em Conversa → IA no celular. O download é necessário apenas uma vez.');
    if (!this.nativeDirectory) throw new AIConnectionError('O motor local não está disponível neste APK. Atualize o aplicativo.');
    this.child = spawn(path.join(this.nativeDirectory, 'liblocal-runner.so'), [
      path.join(this.nativeDirectory, 'libllama-server.so'),
      '-m', path.join(this.directory, 'models', 'qwen-1.5b-q4.gguf'),
      '--host', '127.0.0.1', '--port', '4188', '-c', '4096', '-t', '4', '-b', '128', '-ub', '128',
      '-np', '1', '--no-webui', '--log-disable',
    ], { stdio: 'ignore', env: { PATH: '/system/bin', LLAMA_API_KEY: this.key, COMPANION_PARENT_PID: String(process.pid) } });
    const child = this.child;
    let failed = false;
    child.on('error', () => { failed = true; });
    child.on('exit', () => { if (this.child === child) this.child = undefined; failed = true; });
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (failed) throw new AIConnectionError('A IA local não conseguiu iniciar. Feche outros aplicativos e tente novamente.');
      try {
        const response = await fetch(this.endpoint + '/v1/models', { headers: { Authorization: `Bearer ${this.key}` }, signal: AbortSignal.timeout(500), redirect: 'error' });
        if (response.ok) return;
      } catch {}
      await delay(300);
    }
    this.stop(); throw new AIConnectionError('O carregamento da IA local demorou demais. Tente novamente.');
  }
  async generateResponse(context: AIContext): Promise<string> {
    const grounded = resolveIdentityQuestion(context);
    if (grounded !== null) return grounded;
    clearTimeout(this.idle);
    try {
      if (!this.child && !this.loading) this.loading = this.start();
      if (this.loading) { try { await this.loading; } finally { this.loading = undefined; } }
      const messages = [
        { role: 'system', content: context.systemPrompt + '\nResponda em português brasileiro, em até 120 palavras. Preserve os fatos conhecidos de cada pessoa.' },
        ...context.recentMessages.slice(-6).map(m => ({ role: m.role === 'USER' ? 'user' : m.role === 'COMPANION' ? 'assistant' : 'system', content: m.content.slice(0, 1200) })),
        { role: 'user', content: context.userMessage },
      ];
      const response = await fetch(this.endpoint + '/v1/chat/completions', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(110_000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.key}` },
        body: JSON.stringify({ messages, stream: false, max_tokens: 256, temperature: 0.7 }),
      });
      if (!response.ok) throw new AIConnectionError('A IA local não conseguiu processar a conversa. Tente uma mensagem mais curta.');
      const data: any = await response.json();
      const choice = data?.choices?.[0];
      if (choice?.finish_reason !== 'stop' || typeof choice?.message?.content !== 'string' || !choice.message.content.trim())
        throw new AIConnectionError('A IA local não concluiu a resposta. Tente pedir uma resposta mais curta.');
      return choice.message.content.trim();
    } catch (error) {
      if (error instanceof AIConnectionError) throw error;
      this.stop();
      throw new AIConnectionError('A IA local foi interrompida ou demorou demais. Tente novamente.');
    } finally {
      this.idle = setTimeout(() => this.stop(), 60_000); this.idle.unref();
    }
  }
}
