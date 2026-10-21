/**
 * Fábrica de Companions — painel do ADM (abre em /#/admin).
 * Lista os pedidos de arte gerados no despertar, mostra o prompt de criação
 * montado a partir do contrato de identidade e recebe a arte final.
 */
import { useCallback, useEffect, useState } from 'react';
import { buildArtPrompt, animKind, ANIM_KINDS, type ArtPrompt, type IdentityContractV1 } from '@rules';
import { supabase } from '../backend/online';
import { BiomeStudio } from './BiomeStudio';

interface Job {
  id: string; companionId: string; status: string; createdAt: string; updatedAt: string; contractVersion: number;
  name: string; contract: IdentityContractV1; prompt: ArtPrompt; artUrl?: string; artPath: string | null; error?: string | null;
  model?: { url: string }; modelPath: string | null; animPaths: { path: string; kind: string; name: string }[];
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
  const [view, setView] = useState<'companions' | 'biomas'>(() => (location.hash.includes('biomas') ? 'biomas' : 'companions'));

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

  async function update(job: Job, status: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setMsg(null);
    try { setJobs(withPrompt((await call('admin.update', { jobId: job.id, status, ...extra })).jobs)); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  async function put(job: Job, file: File, folder: string, type: string) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
    const safe = file.name.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[^\w-]+/g, '_').slice(0, 40);
    const path = `companions/${job.companionId}/${folder}/v${job.contractVersion}-${Date.now()}-${safe}.${ext}`;
    // o navegador não informa tipo para .glb (vira application/octet-stream, que o bucket recusa): reembala com o tipo certo
    const body = file.type === type ? file : new Blob([file], { type });
    const { error } = await supabase().storage.from('companion-studio').upload(path, body, { contentType: type, upsert: false });
    if (error) throw new Error('Falha no envio de ' + file.name + ': ' + error.message);
    return path;
  }

  // Modelo 3D (.GLB do Tripo) e animações: cada animação vem num .GLB separado do mesmo rig.
  async function uploadModel(job: Job, file: File) {
    if (!/\.glb$/i.test(file.name)) { setMsg('Envie o modelo em .GLB.'); return; }
    setBusy(true); setMsg(null);
    try {
      const modelPath = await put(job, file, 'model', 'model/gltf-binary');
      const kind = animKind(file.name);
      // o arquivo do corpo também costuma trazer uma animação (ex.: "parado"); entra na lista se o nome disser qual é
      await update(job, job.status === 'approved' ? 'approved' : 'review', { modelPath, ...(kind ? { addAnims: [{ path: modelPath, kind, name: file.name }] } : {}) });
    } catch (e) { setMsg((e as Error).message); setBusy(false); }
  }
  async function uploadAnims(job: Job, files: File[]) {
    const glbs = files.filter((f) => /\.glb$/i.test(f.name));
    if (!glbs.length) { setMsg('Envie as animações em .GLB.'); return; }
    setBusy(true); setMsg(null);
    try {
      const addAnims = [];
      for (const f of glbs) addAnims.push({ path: await put(job, f, 'anims', 'model/gltf-binary'), kind: animKind(f.name) ?? 'special', name: f.name });
      await update(job, job.status === 'approved' ? 'approved' : 'review', { addAnims });
    } catch (e) { setMsg((e as Error).message); setBusy(false); }
  }

  async function upload(job: Job, file: File) {
    if (!/^image\/(png|webp|jpeg)$/.test(file.type)) { setMsg('Envie a imagem em PNG, JPG ou WebP.'); return; }
    if (file.size > 6 * 1024 * 1024) { setMsg('Arquivo grande demais (máx. 6 MB).'); return; }
    setBusy(true); setMsg(null);
    const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/jpeg' ? 'jpg' : 'png';
    const path = `companions/${job.companionId}/v${job.contractVersion}-${Date.now()}.${ext}`;
    const { error } = await supabase().storage.from('companion-studio').upload(path, file, { contentType: file.type, upsert: false });
    if (error) { setBusy(false); setMsg('Falha no envio: ' + error.message); return; }
    await update(job, 'review', { artPath: path });
  }

  const shown = (jobs ?? []).filter((j) => filter === 'all' || j.status !== 'approved');

  return (
    <div className="admin">
      <header className="admin-head">
        <div>
          <h1>{view === 'biomas' ? 'Estúdio de Biomas' : 'Fábrica de Companions'}</h1>
          <p>{view === 'biomas' ? 'Cores e modelos de cada bioma, com prévia 3D. O bioma "refugio" publicado vira o Refúgio do jogo.' : 'Pedidos de arte gerados quando um Companion desperta. O jogador nunca vê este painel.'}</p>
          {session && (
            <nav className="admin-tabs" aria-label="Seções">
              <button className={view === 'companions' ? 'on' : ''} onClick={() => { setView('companions'); history.replaceState(null, '', '#/admin'); }}>Companions</button>
              <button className={view === 'biomas' ? 'on' : ''} onClick={() => { setView('biomas'); history.replaceState(null, '', '#/admin/biomas'); }}>Biomas</button>
            </nav>
          )}
        </div>
        <div className="admin-actions">
          {session && view === 'companions' && <select value={filter} onChange={(e) => setFilter(e.target.value as 'open' | 'all')} aria-label="Filtro"><option value="open">Pendentes</option><option value="all">Todos</option></select>}
          {session && view === 'companions' && <button className="ghost" disabled={busy} onClick={() => void load()}>Atualizar</button>}
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

      {session && view === 'biomas' && <BiomeStudio />}
      <div className="jobs" hidden={view === 'biomas'}>
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
                <label>Folha de vistas (frente, esquerda, direita, verso → multivista do Tripo) <button className="link" onClick={() => void navigator.clipboard?.writeText(j.prompt.views)}>copiar</button></label>
                <textarea readOnly value={j.prompt.views} rows={5} />
                <small>Evitar na folha: {j.prompt.viewsNegative}</small>
                <label>Evitar <button className="link" onClick={() => void navigator.clipboard?.writeText(j.prompt.negative)}>copiar</button></label>
                <textarea readOnly value={j.prompt.negative} rows={2} />
                <small>Formato: {j.prompt.size} · Rig no Tripo: <b>{j.prompt.body}</b> ({j.prompt.bodyPt})</small>
                <details><summary>Contrato de identidade (JSON)</summary><pre>{JSON.stringify(j.contract, null, 2)}</pre></details>
              </div>
              <div className="art">
                {j.artUrl ? <img src={j.artUrl} alt={`Arte de ${j.name}`} /> : <div className="art-empty">Sem arte ainda</div>}
                <label className="upload">
                  <input type="file" accept="image/png,image/webp,image/jpeg" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(j, f); e.target.value = ''; }} />
                  {j.artUrl ? 'Trocar imagem de referência' : 'Enviar imagem de referência'}
                </label>
                <div className="model-box">
                  <strong>Modelo 3D</strong>
                  {j.modelPath ? <small className="ok">Modelo enviado: {j.modelPath.split('/').pop()}</small> : <small>Sem modelo ainda (.GLB do Tripo, com rig)</small>}
                  <label className="upload">
                    <input type="file" accept=".glb,model/gltf-binary" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadModel(j, f); e.target.value = ''; }} />
                    {j.modelPath ? 'Trocar modelo .GLB' : 'Enviar modelo .GLB'}
                  </label>
                  <strong>Animações</strong>
                  {j.animPaths.length ? (
                    <ul className="anim-list">
                      {j.animPaths.map((a) => (
                        <li key={a.path}>
                          <span title={a.name}>{a.name || a.path.split('/').pop()}</span>
                          <select value={a.kind} disabled={busy} onChange={(e) => void update(j, j.status, { setAnim: { path: a.path, kind: e.target.value } })} aria-label={'Tipo de ' + a.name}>
                            {ANIM_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                            <option value="special">Especial</option>
                          </select>
                          <button className="link" disabled={busy} onClick={() => void update(j, j.status, { removeAnim: a.path })}>tirar</button>
                        </li>
                      ))}
                    </ul>
                  ) : <small>Nenhuma. Exporte cada animação do mesmo rig num .GLB e ponha o tipo no nome: parado, andando, correndo, ataque, desmaiado, feliz, dormindo, pulo, comendo.</small>}
                  <label className="upload">
                    <input type="file" accept=".glb,model/gltf-binary" multiple disabled={busy || !j.modelPath} onChange={(e) => { const fs = [...(e.target.files ?? [])]; if (fs.length) void uploadAnims(j, fs); e.target.value = ''; }} />
                    + Animações .GLB (pode escolher várias)
                  </label>
                </div>
                <div className="row">
                  {j.status === 'queued' && <button className="ghost" disabled={busy} onClick={() => void update(j, 'generating')}>Marcar "gerando"</button>}
                  {(j.artPath || j.modelPath) && j.status !== 'approved' && <button className="primary" disabled={busy} onClick={() => void update(j, 'approved')}>Aprovar e liberar no jogo</button>}
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
