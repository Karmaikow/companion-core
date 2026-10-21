/**
 * Fábrica de Companions — painel do ADM (abre em /#/admin).
 * Lista os pedidos de arte gerados no despertar, mostra o prompt de criação
 * montado a partir do contrato de identidade e recebe a arte final.
 */
import { useCallback, useEffect, useState } from 'react';
import { buildArtPrompt, type ArtPrompt, type IdentityContractV1 } from '@rules';
import { supabase } from '../backend/online';

interface Job {
  id: string; companionId: string; status: string; createdAt: string; updatedAt: string; contractVersion: number;
  name: string; contract: IdentityContractV1; prompt: ArtPrompt; artUrl?: string; artPath: string | null; error?: string | null;
}

const STATUS: Record<string, string> = { queued: 'Na fila', generating: 'Gerando', review: 'Em revisão', approved: 'Aprovada (no jogo)', failed: 'Falhou' };

async function call(action: string, extra: Record<string, unknown> = {}): Promise<{ jobs: Job[] }> {
  const { data, error } = await supabase().functions.invoke('refuge', { body: { action, ...extra } });
  if (error) {
    let msg = 'Falha ao falar com o servidor.';
    try { const b = await (error as { context?: Response }).context?.json(); if (b?.error) msg = b.error; } catch { /* mantém */ }
    throw new Error(msg);
  }
  return data;
}

// O prompt é montado aqui, com as mesmas regras do servidor: ajustar o estilo não exige republicar a função.
const withPrompt = (jobs: Job[]) => jobs.map((j) => ({ ...j, prompt: buildArtPrompt(j.contract) }));

export function AdminPanel() {
  const [session, setSession] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'open' | 'all'>('open');

  useEffect(() => {
    supabase().auth.getSession().then(({ data }) => setSession(!!data.session && !data.session.user.is_anonymous));
  }, []);

  const load = useCallback(async () => {
    setBusy(true); setMsg(null);
    try { setJobs(withPrompt((await call('admin.jobs')).jobs)); } catch (e) { setMsg((e as Error).message); setJobs(null); } finally { setBusy(false); }
  }, []);
  useEffect(() => { if (session) void load(); }, [session, load]);

  async function login(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const r = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (r.error) setMsg('E-mail ou senha incorretos.'); else setSession(true);
  }

  async function update(job: Job, status: string, artPath?: string) {
    setBusy(true); setMsg(null);
    try { setJobs(withPrompt((await call('admin.update', { jobId: job.id, status, artPath })).jobs)); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  async function upload(job: Job, file: File) {
    if (!/^image\/(png|webp)$/.test(file.type)) { setMsg('Envie PNG ou WebP com fundo transparente.'); return; }
    if (file.size > 6 * 1024 * 1024) { setMsg('Arquivo grande demais (máx. 6 MB).'); return; }
    setBusy(true); setMsg(null);
    const ext = file.type === 'image/webp' ? 'webp' : 'png';
    const path = `companions/${job.companionId}/v${job.contractVersion}-${Date.now()}.${ext}`;
    const { error } = await supabase().storage.from('companion-studio').upload(path, file, { contentType: file.type, upsert: false });
    if (error) { setBusy(false); setMsg('Falha no envio: ' + error.message); return; }
    await update(job, 'review', path);
  }

  const shown = (jobs ?? []).filter((j) => filter === 'all' || j.status !== 'approved');

  return (
    <div className="admin">
      <header className="admin-head">
        <div>
          <h1>Fábrica de Companions</h1>
          <p>Pedidos de arte gerados quando um Companion desperta. O jogador nunca vê este painel.</p>
        </div>
        <div className="admin-actions">
          {session && <select value={filter} onChange={(e) => setFilter(e.target.value as 'open' | 'all')} aria-label="Filtro"><option value="open">Pendentes</option><option value="all">Todos</option></select>}
          {session && <button className="ghost" disabled={busy} onClick={() => void load()}>Atualizar</button>}
          <a className="link" href="#/">Voltar ao jogo</a>
        </div>
      </header>

      {session === false && (
        <form className="admin-login" onSubmit={login}>
          <h2>Entrar como ADM</h2>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e-mail" autoComplete="email" required />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="senha" autoComplete="current-password" required />
          <button className="primary" disabled={busy}>Entrar</button>
        </form>
      )}

      {msg && <p className="msg err">{msg}</p>}
      {jobs && !shown.length && <p className="empty">Nenhum pedido {filter === 'open' ? 'pendente' : ''}. Eles aparecem aqui quando um Companion desperta.</p>}

      <div className="jobs">
        {shown.map((j) => (
          <article key={j.id} className={'job ' + j.status}>
            <header>
              <div>
                <strong>{j.name}</strong>
                <small>{new Date(j.createdAt).toLocaleString('pt-BR')} · contrato v{j.contractVersion}</small>
              </div>
              <span className={'pill ' + j.status}>{STATUS[j.status] ?? j.status}</span>
            </header>
            <p className="summary-line">{j.prompt.summaryPt}</p>
            <div className="palette" aria-label="Paleta">
              {Object.entries(j.contract.palette).map(([k, v]) => <span key={k} title={`${k} ${v}`} style={{ background: v }} />)}
            </div>
            <div className="job-body">
              <div className="prompt">
                <label>Prompt de criação <button className="link" onClick={() => void navigator.clipboard?.writeText(j.prompt.prompt)}>copiar</button></label>
                <textarea readOnly value={j.prompt.prompt} rows={7} />
                <label>Evitar <button className="link" onClick={() => void navigator.clipboard?.writeText(j.prompt.negative)}>copiar</button></label>
                <textarea readOnly value={j.prompt.negative} rows={2} />
                <small>Formato: {j.prompt.size}</small>
                <details><summary>Contrato de identidade (JSON)</summary><pre>{JSON.stringify(j.contract, null, 2)}</pre></details>
              </div>
              <div className="art">
                {j.artUrl ? <img src={j.artUrl} alt={`Arte de ${j.name}`} /> : <div className="art-empty">Sem arte ainda</div>}
                <label className="upload">
                  <input type="file" accept="image/png,image/webp" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(j, f); e.target.value = ''; }} />
                  {j.artUrl ? 'Trocar arte' : 'Enviar arte (PNG transparente)'}
                </label>
                <div className="row">
                  {j.status === 'queued' && <button className="ghost" disabled={busy} onClick={() => void update(j, 'generating')}>Marcar "gerando"</button>}
                  {j.artPath && j.status !== 'approved' && <button className="primary" disabled={busy} onClick={() => void update(j, 'approved')}>Aprovar e liberar no jogo</button>}
                  {j.status === 'approved' && <button className="ghost" disabled={busy} onClick={() => void update(j, 'review')}>Tirar do jogo</button>}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
