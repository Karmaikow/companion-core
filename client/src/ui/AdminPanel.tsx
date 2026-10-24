/**
 * O Administrador — painel do ADM (abre em /#/admin): Fábrica de Companions, Biomas, Forja, Invocador, Arsenal, Servidor.
 * Lista os pedidos de arte gerados no despertar, mostra o prompt de criação
 * montado a partir do contrato de identidade e recebe a arte final.
 */
import { useCallback, useEffect, useState } from 'react';
import { buildArtPrompt, animKind, ANIM_KINDS, type ArtPrompt, type IdentityContractV1 } from '@rules';
import { supabase } from '../backend/online';
import { BiomeStudio } from './BiomeStudio';
import { ForgeStudio } from './ForgeStudio';
import { SummonerStudio } from './SummonerStudio';
import { ArsenalStudio } from './ArsenalStudio';
import { ServerStudio } from './ServerStudio';
import { SkillAnimPicker } from './SkillAnimPicker';
import { CompanionsAdmin } from './AdminCompanions';
import { AdminVoid } from './AdminVoid';
import { AnimStudio } from './AnimStudio';
import { AutoRig, glbHasRig } from './RigEditor';

type View = 'companions' | 'animacoes' | 'biomas' | 'forja' | 'invocador' | 'arsenal' | 'servidor';
const VIEWS: { key: View; label: string; hash: string; title: string; hint: string }[] = [
  { key: 'companions', label: 'Companions', hash: '#/admin', title: 'Companions', hint: 'Todos os Companions: ficha, progressão, coleta, build e os pedidos de arte da Fábrica. O jogador nunca vê este painel.' },
  { key: 'animacoes', label: 'Animações', hash: '#/admin/animacoes', title: 'Animações', hint: 'Qual clipe faz cada papel (parado, andando, golpes, coleta…) para Companions e monstros, com campo de treino.' },
  { key: 'biomas', label: 'Biomas', hash: '#/admin/biomas', title: 'Estúdio de Biomas', hint: 'Refúgios e regiões do Companion World: cores, modelos e a aparência de cada modelo, com prévia 3D.' },
  { key: 'forja', label: 'Forja de Batalha', hash: '#/admin/forja', title: 'Forja de Batalha', hint: 'Habilidades genéricas que qualquer Companion daquela essência e corpo pode usar.' },
  { key: 'invocador', label: 'Invocador de Monstros', hash: '#/admin/invocador', title: 'Invocador de Monstros', hint: 'O catálogo de criaturas: corpo, jeito de lutar, onde aparecem e o que soltam.' },
  { key: 'arsenal', label: 'Arsenal', hash: '#/admin/arsenal', title: 'Arsenal', hint: 'Armas e equipamentos: modelo, atributos, raridade, pegada na mão e a receita da Forja (só Taurinas forjam).' },
  { key: 'servidor', label: 'Servidor', hash: '#/admin/servidor', title: 'Servidor', hint: 'IA dos Companions, XP de vínculo e clima — vale na hora para todos os jogadores.' },
];

export interface Job {
  id: string; companionId: string; status: string; createdAt: string; updatedAt: string; contractVersion: number;
  name: string; contract: IdentityContractV1; prompt: ArtPrompt; artUrl?: string; artPath: string | null; error?: string | null;
  model?: { url: string; anims?: { url: string; kind: string; name: string }[] }; modelPath: string | null; animPaths: { path: string; kind: string; name: string }[];
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
  /** o servidor diz se a conta é administradora; sem isso, nenhuma aba aparece (só a tela da partícula) */
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [view, setView] = useState<View>(() => VIEWS.find((v) => v.key !== 'companions' && location.hash.includes(v.hash.split('/').pop()!))?.key ?? 'companions');
  const V = VIEWS.find((v) => v.key === view)!;

  useEffect(() => {
    supabase().auth.getSession().then(({ data }) => setSession(!!data.session && !data.session.user.is_anonymous));
  }, []);

  const load = useCallback(async () => {
    setBusy(true); setMsg(null);
    try { setJobs(withPrompt((await call('admin.jobs')).jobs)); setAdmin(true); }
    catch (e) { const m = (e as Error).message; if (/administrador/i.test(m)) setAdmin(false); else { setMsg(m); setAdmin((a) => a ?? true); } setJobs(null); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { if (session) void load(); }, [session, load]);

  async function login(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const r = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (r.error) setMsg('E-mail ou senha incorretos.'); else setSession(true);
  }

  async function update(job: Job, status: string, extra: Record<string, unknown> = {}): Promise<boolean> {
    setBusy(true); setMsg(null);
    try { setJobs(withPrompt((await call('admin.update', { jobId: job.id, status, ...extra })).jobs)); return true; } catch (e) { setMsg((e as Error).message); return false; } finally { setBusy(false); }
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
  // Modelo sem rig: depois de enviado, o rig automático (Mesh2Motion) encaixa o esqueleto humano e o modelo riggado
  // substitui o enviado.
  async function uploadModel(job: Job, file: File, opts: { rigged?: boolean } = {}): Promise<boolean> {
    if (!/\.glb$/i.test(file.name)) { setMsg('Envie o modelo em .GLB.'); return false; }
    setBusy(true); setMsg(null);
    try {
      const rigged = opts.rigged ?? await glbHasRig(file);
      const modelPath = await put(job, file, 'model', 'model/gltf-binary');
      const kind = animKind(file.name);
      // o arquivo do corpo também costuma trazer uma animação (ex.: "parado"); entra na lista se o nome disser qual é
      const ok = await update(job, job.status === 'approved' ? 'approved' : 'review', { modelPath, ...(kind ? { addAnims: [{ path: modelPath, kind, name: file.name }] } : {}) });
      if (ok && !rigged) setRigJob({ id: job.id, name: job.name, url: null, path: modelPath });
      return ok;
    } catch (e) { setMsg((e as Error).message); setBusy(false); return false; }
  }
  // rig automático do modelo recém-enviado (ou refeito pelo botão); o endereço sai da lista de pedidos atualizada
  const [rigJob, setRigJob] = useState<{ id: string; name: string; url: string | null; path: string | null } | null>(null);
  async function uploadAnims(job: Job, files: File[], opts: { dropPrefix?: string } = {}): Promise<boolean> {
    const glbs = files.filter((f) => /\.glb$/i.test(f.name));
    if (!glbs.length) { setMsg('Envie as animações em .GLB.'); return false; }
    setBusy(true); setMsg(null);
    try {
      const addAnims = [];
      for (const f of glbs) addAnims.push({ path: await put(job, f, 'anims', 'model/gltf-binary'), kind: animKind(f.name) ?? 'special', name: f.name });
      return await update(job, job.status === 'approved' ? 'approved' : 'review', { addAnims, ...(opts.dropPrefix ? { dropAnimsPrefix: opts.dropPrefix } : {}) });
    } catch (e) { setMsg((e as Error).message); setBusy(false); return false; }
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

  const renderJob = (j: Job) => (
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
                <div className="class-line">
                  <b>{j.prompt.sheet.species.label}</b> · humanoide · {j.prompt.sheet.species.features}
                  <small>{j.prompt.sheet.appendages.note}</small>
                </div>
                <label>1. Referência para o modelo 3D (Tripo, rig humanoide) <button className="link" onClick={() => void navigator.clipboard?.writeText(j.prompt.modelPrompt)}>copiar</button></label>
                <textarea readOnly value={j.prompt.modelPrompt} rows={6} />
                <small>Evitar: {j.prompt.modelNegative}</small>
                <label>Folha de vistas da referência (frente, esquerda, direita, verso → multivista do Tripo) <button className="link" onClick={() => void navigator.clipboard?.writeText(j.prompt.views)}>copiar</button></label>
                <textarea readOnly value={j.prompt.views} rows={4} />
                <label>2. Arte do retrato (com {j.prompt.sheet.appendages.tail || j.prompt.sheet.appendages.wings ? 'cauda/asas' : 'todos os traços'}; não vai para o Tripo) <button className="link" onClick={() => void navigator.clipboard?.writeText(j.prompt.prompt)}>copiar</button></label>
                <textarea readOnly value={j.prompt.prompt} rows={5} />
                <label>Evitar no retrato <button className="link" onClick={() => void navigator.clipboard?.writeText(j.prompt.negative)}>copiar</button></label>
                <textarea readOnly value={j.prompt.negative} rows={2} />
                <small>Formato: {j.prompt.size} · Rig no Tripo: <b>humanoide</b> (o mesmo para todos; animações prontas de humanoide servem)</small>
                <details open><summary>Ficha do personagem (JSON)</summary><pre>{JSON.stringify(j.prompt.sheet, null, 2)}</pre><button className="link" onClick={() => void navigator.clipboard?.writeText(JSON.stringify(j.prompt.sheet, null, 2))}>copiar ficha</button></details>
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
                  {j.modelPath ? <small className="ok">Modelo enviado: {j.modelPath.split('/').pop()}</small> : <small>Sem modelo ainda (.GLB do Tripo, com ou sem rig)</small>}
                  <label className="upload">
                    <input type="file" accept=".glb,model/gltf-binary" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadModel(j, f); e.target.value = ''; }} />
                    {j.modelPath ? 'Trocar modelo .GLB' : 'Enviar modelo .GLB'}
                  </label>
                  {j.model?.url && <button className="link" disabled={busy} onClick={() => setRigJob({ id: j.id, name: j.name, url: j.model!.url, path: null })} title="Encaixa o esqueleto humano de novo, sozinho (se o rig do modelo saiu torto)">refazer o rig automático</button>}
                  <small className="hint">Envie o .GLB sem rig: o esqueleto é encaixado aqui, sozinho.</small>
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
                <SkillAnimPicker companionId={j.companionId} contract={j.contract} modelUrl={j.model?.url} anims={j.animPaths} />
                <RefugeBiomePicker companionId={j.companionId} />
                <div className="row">
                  {j.status === 'queued' && <button className="ghost" disabled={busy} onClick={() => void update(j, 'generating')}>Marcar "gerando"</button>}
                  {(j.artPath || j.modelPath) && j.status !== 'approved' && <button className="primary" disabled={busy} onClick={() => void update(j, 'approved')}>Aprovar e liberar no jogo</button>}
                  {j.status === 'approved' && <button className="ghost" disabled={busy} onClick={() => void update(j, 'review')}>Tirar do jogo</button>}
                </div>
              </div>
            </div>
          </article>
  );

  // sem permissão (ou sem login): só a tela genérica com a partícula — nada do painel
  if (session === null || (session && admin === null)) return <div className="admin-void" aria-busy="true" />;
  if (session && admin === false) return <AdminVoid />;
  if (session === false) return (
    <>
      <AdminVoid onLogin={showLogin ? undefined : () => setShowLogin(true)} />
      {showLogin && (
        <form className="admin-login admin-void-form" onSubmit={login}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e-mail" autoComplete="email" required aria-label="E-mail" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="senha" autoComplete="current-password" required aria-label="Senha" />
          <button className="primary" disabled={busy}>Entrar</button>
          {msg && <p className="msg err">{msg}</p>}
        </form>
      )}
    </>
  );

  return (
    <div className="admin">
      <header className="admin-head">
        <div>
          <h1>O Administrador</h1>
          <p><b>{V.title}</b> · {V.hint}</p>
          {(
            <nav className="admin-tabs" aria-label="Seções">
              {VIEWS.map((v) => <button key={v.key} className={view === v.key ? 'on' : ''} onClick={() => { setView(v.key); history.replaceState(null, '', v.hash); }}>{v.label}</button>)}
            </nav>
          )}
        </div>
        <div className="admin-actions">
                    {session && view === 'companions' && <button className="ghost" disabled={busy} onClick={() => void load()}>Atualizar</button>}
          <a className="link" href="#/">Voltar ao jogo</a>
        </div>
      </header>


      {msg && <p className="msg err">{msg}</p>}

      {session && view === 'animacoes' && <AnimStudio jobs={jobs ?? []} onUploadAnims={uploadAnims} busy={busy} />}
      {rigJob && (() => {
        const job = jobs?.find((x) => x.id === rigJob.id);
        const url = rigJob.url ?? (job?.model?.url && (!rigJob.path || job.modelPath === rigJob.path) ? job.model.url : null);
        if (!job || !url) return null;
        return (
          <AutoRig url={url} name={rigJob.name} rig="human" onClose={() => setRigJob(null)}
            onDone={async (file) => {
              if (await uploadModel(job, file, { rigged: true })) { setRigJob(null); setMsg(`Rig de ${job.name} pronto e salvo como modelo. Agora em Animações → Aplicar o pacote padrão (e salve).`); }
            }} />
        );
      })()}
      {session && view === 'biomas' && <BiomeStudio />}
      {session && view === 'forja' && <ForgeStudio />}
      {session && view === 'invocador' && <SummonerStudio />}
      {session && view === 'arsenal' && <ArsenalStudio />}
      {session && view === 'servidor' && <ServerStudio />}
      {session && view === 'companions' && (
        <CompanionsAdmin jobs={jobs ?? []} renderJob={renderJob} reloadKey={jobs} />
      )}
    </div>
  );
}

/**
 * Refúgio do Companion: todos usam o bioma padrão "refugio"; um Companion evoluído pode ganhar um Refúgio próprio
 * (qualquer bioma publicado no Estúdio — de preferência um com "Aparece no mundo" desligado).
 */
function RefugeBiomePicker({ companionId }: { companionId: string }) {
  const [list, setList] = useState<{ slug: string; name: string; status: string }[] | null>(null);
  const [cur, setCur] = useState<string>('');
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const [b, mine] = await Promise.all([
        supabase().from('biomes').select('slug,name,status').order('name'),
        supabase().from('companion_biomes').select('biome_slug').eq('companion_id', companionId).maybeSingle(),
      ]);
      if (!alive) return;
      setList(b.data ?? []);
      setCur(mine.data?.biome_slug ?? '');
    })();
    return () => { alive = false; };
  }, [companionId]);
  async function choose(slug: string) {
    setNote(null);
    const uid = (await supabase().auth.getUser()).data.user?.id;
    const r = slug
      ? await supabase().from('companion_biomes').upsert({ companion_id: companionId, biome_slug: slug, updated_at: new Date().toISOString(), updated_by: uid })
      : await supabase().from('companion_biomes').delete().eq('companion_id', companionId);
    if (r.error) { setNote('Não deu para salvar: ' + r.error.message); return; }
    setCur(slug);
    const b = list?.find((x) => x.slug === slug);
    setNote(slug ? (b?.status === 'published' ? 'Salvo. O Refúgio muda na próxima vez que a pessoa abrir o jogo.' : 'Salvo, mas este bioma é rascunho: publique no Estúdio para valer no jogo.') : 'Voltou para o Refúgio padrão.');
  }
  if (!list) return null;
  return (
    <div className="model-box">
      <strong>Refúgio deste Companion</strong>
      <select value={cur} onChange={(e) => void choose(e.target.value)} aria-label="Bioma do Refúgio">
        <option value="">Padrão (bioma "refugio")</option>
        {list.filter((b) => b.slug !== 'refugio').map((b) => <option key={b.slug} value={b.slug}>{b.name}{b.status === 'published' ? '' : ' (rascunho)'}</option>)}
      </select>
      {note && <small>{note}</small>}
    </div>
  );
}
