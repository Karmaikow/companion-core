// Provedor de linguagem plugável.
// - O ADM escolhe a IA geral no painel (aba Servidor → tabela ai_settings, só a função lê a chave).
// - Sem escolha (provider 'auto') ou sem chave: segue os segredos da função, Anthropic -> Groq -> offline.
// - Se a IA escolhida falhar numa chamada, tenta a dos segredos antes de ficar sem resposta.
// Prompts, respostas e chaves nunca são registrados em log.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { ChatLine } from './rules/index.ts';

export const AI_PROVIDERS = ['auto', 'anthropic', 'groq', 'openai', 'gemini', 'openrouter', 'custom'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];
type Wire = 'anthropic' | 'openai';

/** Endereço e modelos padrão de cada IA (o ADM pode trocar o modelo no painel). */
export const AI_DEFAULTS: Record<Exclude<AiProvider, 'auto'>, { label: string; baseUrl: string; model: string; modelHq: string; wire: Wire }> = {
  anthropic: { label: 'Anthropic (Claude)', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-haiku-4-5', modelHq: 'claude-haiku-4-5', wire: 'anthropic' },
  groq: { label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', modelHq: 'openai/gpt-oss-120b', wire: 'openai' },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', modelHq: 'gpt-4.1', wire: 'openai' },
  gemini: { label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', modelHq: 'gemini-2.5-flash', wire: 'openai' },
  openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4.1-mini', modelHq: 'openai/gpt-4.1', wire: 'openai' },
  custom: { label: 'Outra compatível com OpenAI', baseUrl: '', model: '', modelHq: '', wire: 'openai' },
};

export interface AiTarget { provider: Exclude<AiProvider, 'auto'>; key: string; baseUrl: string; model: string; modelHq: string }

// ---- segredos da função (o jeito antigo, continua valendo como reserva)
const ENV_ANTHROPIC = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const ENV_GROQ = Deno.env.get('GROQ_API_KEY') ?? '';
const ENV_TARGET: AiTarget | null = ENV_ANTHROPIC
  ? { provider: 'anthropic', key: ENV_ANTHROPIC, baseUrl: AI_DEFAULTS.anthropic.baseUrl, model: Deno.env.get('ANTHROPIC_MODEL') ?? AI_DEFAULTS.anthropic.model, modelHq: Deno.env.get('ANTHROPIC_MODEL') ?? AI_DEFAULTS.anthropic.modelHq }
  : ENV_GROQ
    ? { provider: 'groq', key: ENV_GROQ, baseUrl: AI_DEFAULTS.groq.baseUrl, model: Deno.env.get('GROQ_MODEL') ?? AI_DEFAULTS.groq.model, modelHq: Deno.env.get('GROQ_MODEL_HQ') ?? AI_DEFAULTS.groq.modelHq }
    : null;
export const envProviderName = () => ENV_TARGET?.provider ?? 'offline';
export const envTarget = () => ENV_TARGET;

// ---- escolha do ADM, lida do banco com cache curto (muda para todos em até 30 s, ou na hora após salvar)
export interface AiRow { provider: AiProvider; model: string | null; model_hq: string | null; base_url: string | null; api_key: string | null }
let chosen: AiTarget | null = null;
let loadedAt = 0;
const TTL = 30_000;

export function targetFromRow(row: AiRow | null): AiTarget | null {
  if (!row || row.provider === 'auto' || !AI_DEFAULTS[row.provider]) return null;
  const d = AI_DEFAULTS[row.provider];
  const baseUrl = (row.base_url?.trim() || d.baseUrl).replace(/\/+$/, '');
  const model = row.model?.trim() || d.model;
  const key = row.api_key?.trim() ?? '';
  if (!baseUrl || !model || (!key && row.provider !== 'custom')) return null;
  return { provider: row.provider, key, baseUrl, model, modelHq: row.model_hq?.trim() || model };
}

export async function loadAiRow(db: SupabaseClient): Promise<AiRow | null> {
  const { data } = await db.from('ai_settings').select('provider,model,model_hq,base_url,api_key').eq('id', 1).maybeSingle();
  return (data as AiRow | null) ?? null;
}

/** Chamado no começo de cada pedido; só vai ao banco quando o cache venceu. */
export async function refreshAi(db: SupabaseClient, force = false) {
  if (!force && Date.now() - loadedAt < TTL) return;
  try { chosen = targetFromRow(await loadAiRow(db)); loadedAt = Date.now(); } catch { /* sem tabela ou sem banco: segue com o que tinha */ }
}

const active = () => chosen ?? ENV_TARGET;

export function providerName(): string {
  return active()?.provider ?? 'offline';
}

type Opts = { maxTokens?: number; timeoutMs?: number; quality?: boolean };

export async function complete(system: string, history: ChatLine[], user: string, opts: Opts = {}): Promise<string | null> {
  const t = active();
  if (!t) return null;
  try {
    return await callTarget(t, system, history, user, opts);
  } catch (e) {
    // a IA escolhida no painel falhou: tenta a dos segredos para o Companion não ficar mudo
    if (chosen && ENV_TARGET && t === chosen) return await callTarget(ENV_TARGET, system, history, user, opts);
    throw e;
  }
}

export async function callTarget(t: AiTarget, system: string, history: ChatLine[], user: string, opts: Opts = {}): Promise<string | null> {
  const msgs = history.slice(-12).map((h) => ({ role: h.role === 'player' ? 'user' : 'assistant', content: h.text || '…' }));
  const model = opts.quality ? t.modelHq : t.model;
  const signal = () => AbortSignal.timeout(opts.timeoutMs ?? 25_000);

  if (AI_DEFAULTS[t.provider].wire === 'anthropic') {
    // Mensagens precisam alternar e começar com user.
    const merged: { role: string; content: string }[] = [];
    for (const m of [...msgs, { role: 'user', content: user }]) {
      const last = merged[merged.length - 1];
      if (last && last.role === m.role) last.content += '\n' + m.content;
      else merged.push({ ...m });
    }
    while (merged.length && merged[0].role !== 'user') merged.shift();
    const r = await fetch(t.baseUrl + '/messages', {
      method: 'POST',
      signal: signal(),
      headers: { 'content-type': 'application/json', 'x-api-key': t.key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: opts.maxTokens ?? 700, system, messages: merged }),
    });
    if (!r.ok) throw new Error('anthropic ' + r.status);
    const data = await r.json();
    return (data?.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('') || null;
  }

  // Todas as outras falam o formato de chat da OpenAI.
  const groq = t.provider === 'groq', openai = t.provider === 'openai';
  const max = opts.maxTokens ?? 1200;
  const call = (json: boolean) => fetch(t.baseUrl + '/chat/completions', {
    method: 'POST',
    signal: signal(),
    headers: {
      'Content-Type': 'application/json',
      ...(t.key ? { Authorization: `Bearer ${t.key}` } : {}),
      ...(t.provider === 'openrouter' ? { 'X-Title': 'Companion Core' } : {}),
    },
    body: JSON.stringify({
      model,
      ...(groq ? { reasoning_effort: 'low', include_reasoning: false } : {}),
      ...(groq || openai ? { max_completion_tokens: max } : { max_tokens: max }),
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      messages: [{ role: 'system', content: system }, ...msgs, { role: 'user', content: user }],
    }),
  });
  let r = await call(true);
  // Limite de uso (429): espera o tempo pedido (até 6 s) e tenta mais uma vez.
  if (r.status === 429) {
    const wait = Math.min(6, Number(r.headers.get('retry-after')) || 2);
    await new Promise((ok) => setTimeout(ok, wait * 1000));
    r = await call(true);
  }
  // Modo JSON às vezes falha na validação do provedor (400/422): tenta de novo em texto livre;
  // parseModelTurn extrai o JSON da resposta ou usa o texto como fala.
  if (r.status === 400 || r.status === 422) r = await call(false);
  if (!r.ok) throw new Error(t.provider + ' ' + r.status);
  const data = await r.json();
  return data?.choices?.[0]?.message?.content || null;
}
