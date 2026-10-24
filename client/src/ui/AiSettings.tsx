/**
 * IA geral dos Companions (painel do ADM → Servidor): qual API escreve as falas, encontros, diário e conversas de grupo.
 * Grava na tabela ai_settings pela função (a chave nunca volta inteira ao navegador) e vale para todos em até 30 s.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../backend/online';

type Provider = 'auto' | 'anthropic' | 'groq' | 'openai' | 'gemini' | 'openrouter' | 'nvidia' | 'custom';
interface Defaults { label: string; baseUrl: string; model: string; modelHq: string }
interface AiState {
  provider: Provider; model: string; modelHq: string; baseUrl: string; hasKey: boolean; keyHint: string;
  active: string; env: string; ready: boolean; defaults: Record<Exclude<Provider, 'auto'>, Defaults>;
}
interface TestResult { ok: boolean; ms?: number; provider?: string; model?: string; sample?: string; error?: string }

const ORDER: Provider[] = ['auto', 'anthropic', 'groq', 'openai', 'gemini', 'openrouter', 'nvidia', 'custom'];
const NAMES: Record<string, string> = { auto: 'Padrão do servidor', anthropic: 'Anthropic (Claude)', groq: 'Groq', openai: 'OpenAI', gemini: 'Google Gemini', openrouter: 'OpenRouter', nvidia: 'NVIDIA (Nemotron)', custom: 'Outra (compatível com OpenAI)', offline: 'sem IA (respostas simples)' };
const KEY_HELP: Record<string, string> = {
  anthropic: 'console.anthropic.com → API Keys',
  groq: 'console.groq.com → API Keys',
  openai: 'platform.openai.com → API keys',
  gemini: 'aistudio.google.com → Get API key',
  openrouter: 'openrouter.ai → Keys',
  nvidia: 'build.nvidia.com → Get API Key (começa com nvapi-)',
  custom: 'a chave do seu provedor (pode ficar vazia se ele não pedir)',
};

async function call<T>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase().functions.invoke('refuge', { body: { action, ...extra } });
  if (error) {
    let msg = 'Falha ao falar com o servidor.';
    try { const b = await (error as { context?: Response }).context?.json(); if (b?.error) msg = b.error; } catch { /* mantém */ }
    throw new Error(msg);
  }
  return data as T;
}

export function AiSettings() {
  const [s, setS] = useState<AiState | null>(null);
  const [provider, setProvider] = useState<Provider>('auto');
  const [model, setModel] = useState('');
  const [modelHq, setModelHq] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);
  const [models, setModels] = useState<string[]>([]);

  const absorb = (r: AiState) => { setS(r); setProvider(r.provider); setModel(r.model); setModelHq(r.modelHq); setBaseUrl(r.baseUrl); setApiKey(''); };
  useEffect(() => { call<AiState>('admin.ai.get').then(absorb, (e) => setMsg({ text: (e as Error).message })); }, []);

  if (!s) return <fieldset><legend>IA dos Companions</legend>{msg ? <p className="msg err">{msg.text}</p> : <small className="hint">Carregando…</small>}</fieldset>;

  const d = provider === 'auto' ? null : s.defaults[provider];
  const sameAsSaved = provider === s.provider;
  const keepsKey = sameAsSaved && s.hasKey && !apiKey;
  const draft = { provider, model, modelHq, baseUrl, apiKey };

  async function save() {
    setBusy(true); setMsg(null); setTest(null);
    try { absorb(await call<AiState>('admin.ai.set', draft)); setMsg({ ok: true, text: 'IA salva: vale para todos os Companions em até 30 s.' }); }
    catch (e) { setMsg({ text: (e as Error).message }); }
    finally { setBusy(false); }
  }
  async function loadModels() {
    setBusy(true); setMsg(null);
    try {
      const r = await call<{ models: string[]; error?: string }>('admin.ai.models', draft);
      setModels(r.models);
      setMsg(r.error ? { text: r.error } : { ok: true, text: `${r.models.length} modelos: toque no campo do modelo para escolher.` });
    } catch (e) { setMsg({ text: (e as Error).message }); }
    finally { setBusy(false); }
  }
  async function runTest() {
    setBusy(true); setMsg(null); setTest(null);
    try { setTest(await call<TestResult>('admin.ai.test', draft)); }
    catch (e) { setMsg({ text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  return (
    <fieldset className="ai-settings">
      <legend>IA dos Companions</legend>
      <small className="hint">
        Escreve a conversa, os encontros no mundo, as conversas de grupo e o diário. Agora: <b>{NAMES[s.active] ?? s.active}</b>
        {s.provider === 'auto' && <> (pelos segredos da função)</>}. Se a IA escolhida falhar, o servidor usa a dos segredos ({NAMES[s.env] ?? s.env}) como reserva.
      </small>

      <div className="chips">
        {ORDER.map((p) => (
          <button key={p} className={'chip' + (provider === p ? ' on' : '')} onClick={() => { setProvider(p); setTest(null); if (p !== s.provider) { setModel(''); setModelHq(''); setBaseUrl(''); } else { setModel(s.model); setModelHq(s.modelHq); setBaseUrl(s.baseUrl); } }}>
            {NAMES[p]}
          </button>
        ))}
      </div>

      {provider === 'auto' ? (
        <small className="hint">Usa os segredos da função (ANTHROPIC_API_KEY ou GROQ_API_KEY). Hoje: {NAMES[s.env] ?? s.env}.</small>
      ) : (
        <div className="grid-form">
          <label>Chave da API
            <input type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={keepsKey ? `guardada ${s.keyHint} — deixe vazio para manter` : 'cole a chave aqui'} />
            <small className="hint">{KEY_HELP[provider]}</small>
          </label>
          <label>Modelo
            <input list="ai-models" value={model} onChange={(e) => setModel(e.target.value)} placeholder={d?.model || 'ex.: llama-3.3-70b'} spellCheck={false} />
            <small className="hint">Conversa e diário.{d?.model ? ` Vazio = ${d.model}` : ''}</small>
          </label>
          <label>Modelo das falas curtas
            <input list="ai-models" value={modelHq} onChange={(e) => setModelHq(e.target.value)} placeholder={d?.modelHq || 'igual ao modelo'} spellCheck={false} />
            <small className="hint">Encontros e conversas de grupo (vale um modelo melhor). Vazio = {d?.modelHq || 'o mesmo'}.</small>
          </label>
          {(provider === 'custom' || provider === 'openrouter' || baseUrl) && (
            <label>Endereço da API
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={d?.baseUrl || 'https://…/v1'} spellCheck={false} />
              <small className="hint">Base que termina antes de /chat/completions.{d?.baseUrl ? ` Vazio = ${d.baseUrl}` : ''}</small>
            </label>
          )}
          <datalist id="ai-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
        </div>
      )}

      <div className="row">
        <button className="primary" disabled={busy} onClick={() => void save()}>Salvar IA</button>
        <button disabled={busy} onClick={() => void runTest()}>{busy ? 'Aguarde…' : 'Testar'}</button>
        {provider !== 'auto' && provider !== 'anthropic' && <button disabled={busy} onClick={() => void loadModels()}>Ver modelos</button>}
        {s.provider !== 'auto' && keepsKey && <button className="link" disabled={busy} onClick={() => { if (confirm('Apagar a chave guardada e voltar ao padrão do servidor?')) { setBusy(true); call<AiState>('admin.ai.set', { provider: 'auto', clearKey: true }).then((r) => { absorb(r); setMsg({ ok: true, text: 'Voltou ao padrão do servidor.' }); }, (e) => setMsg({ text: (e as Error).message })).finally(() => setBusy(false)); } }}>apagar chave</button>}
      </div>
      {test && (
        <p className={'msg' + (test.ok ? ' ok' : ' err')} role="status">
          {test.ok ? <>Funcionou em {((test.ms ?? 0) / 1000).toFixed(1)} s ({NAMES[test.provider ?? ''] ?? test.provider}{test.model ? ` · ${test.model}` : ''}): “{test.sample}”{!sameAsSaved || apiKey ? ' — falta salvar.' : ''}</> : test.error}
        </p>
      )}
      {msg && <p className={'msg' + (msg.ok ? ' ok' : ' err')}>{msg.text}</p>}
    </fieldset>
  );
}
