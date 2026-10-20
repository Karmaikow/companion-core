// Provedor de linguagem plugável. Ordem: Anthropic -> Groq -> nenhum (respondedor offline).
// Prompts e respostas nunca são registrados em log.
import type { ChatLine } from './rules/index.ts';

const ANTHROPIC = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const GROQ = Deno.env.get('GROQ_API_KEY') ?? '';
const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-haiku-4-5';
const GROQ_MODEL = Deno.env.get('GROQ_MODEL') ?? 'openai/gpt-oss-20b';

export function providerName(): 'anthropic' | 'groq' | 'offline' {
  return ANTHROPIC ? 'anthropic' : GROQ ? 'groq' : 'offline';
}

export async function complete(system: string, history: ChatLine[], user: string): Promise<string | null> {
  const msgs = history.slice(-12).map((h) => ({ role: h.role === 'player' ? 'user' : 'assistant', content: h.text || '…' }));
  if (ANTHROPIC) {
    // Mensagens precisam alternar e começar com user.
    const merged: { role: string; content: string }[] = [];
    for (const m of [...msgs, { role: 'user', content: user }]) {
      const last = merged[merged.length - 1];
      if (last && last.role === m.role) last.content += '\n' + m.content;
      else merged.push({ ...m });
    }
    while (merged.length && merged[0].role !== 'user') merged.shift();
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(25_000),
      headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 700, system, messages: merged }),
    });
    if (!r.ok) throw new Error('anthropic ' + r.status);
    const data = await r.json();
    return (data?.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('') || null;
  }
  if (GROQ) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(25_000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ}` },
      body: JSON.stringify({
        model: GROQ_MODEL, reasoning_effort: 'low', include_reasoning: false, max_completion_tokens: 1200,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, ...msgs, { role: 'user', content: user }],
      }),
    });
    if (!r.ok) throw new Error('groq ' + r.status);
    const data = await r.json();
    return data?.choices?.[0]?.message?.content ?? null;
  }
  return null;
}
