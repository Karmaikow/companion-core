/**
 * O Administrador — painel do ADM (abre em /#/admin): Fábrica de Companions, Biomas, Forja, Invocador, Arsenal, Servidor.
 * Lista os pedidos de arte gerados no despertar, mostra o prompt de criação
 * montado a partir do contrato de identidade e recebe a arte final.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { buildArtPrompt, animKind } from '@rules';
import { AdminDialogHost, AdminDirty, Icon, ask } from './adminKit';
import './admin.css';
import { supabase } from '../backend/online';
import { BiomeStudio } from './BiomeStudio';
import { CityStudio } from './CityStudio';
import { ForgeStudio } from './ForgeStudio';
import { SummonerStudio } from './SummonerStudio';
import { ArsenalStudio } from './ArsenalStudio';
import { MissionStudio } from './MissionStudio';
import { ServerStudio } from './ServerStudio';
import { ShopStudio } from './ShopStudio';
import { CompanionsAdmin } from './AdminCompanions';
import { AdminVoid } from './AdminVoid';
import { AnimStudio } from './AnimStudio';
import { AutoRig, glbHasRig } from './RigEditor';
import { FactoryJobView, finishHumanRigJob, putJobFile, type Job } from './FactoryStudio';

export type { Job } from './FactoryStudio';

type View = 'companions' | 'animacoes' | 'biomas' | 'cidade' | 'lojas' | 'forja' | 'invocador' | 'arsenal' | 'missoes' | 'servidor';
const VIEWS: { key: View; label: string; hash: string; title: string; hint: string }[] = [
  { key: 'companions', label: 'Companions', hash: '#/admin', title: 'Companions', hint: 'Todos os Companions: ficha, progressão, coleta, build e os pedidos de arte da Fábrica. O jogador nunca vê este painel.' },
  { key: 'animacoes', label: 'Animações', hash: '#/admin/animacoes', title: 'Animações', hint: 'Qual clipe faz cada papel (parado, andando, golpes, coleta…) para Companions e monstros, com campo de treino.' },
  { key: 'biomas', label: 'Biomas', hash: '#/admin/biomas', title: 'Estúdio de Biomas', hint: 'Refúgios e regiões do Companion World: cores, modelos e a aparência de cada modelo, com prévia 3D.' },
  { key: 'cidade', label: 'Cidade', hash: '#/admin/cidade', title: 'Estúdio da Cidade', hint: 'Áster, a Cidade-Farol: monte o interior com os seus modelos, marque lojas, escolas e portões, e encaixe a cidade vista de fora.' },
  { key: 'lojas', label: 'Lojas', hash: '#/admin/lojas', title: 'Lojas', hint: 'O que cada loja de Áster vende, preços e limites, e o Mercadão rotativo (estoque diário e requisitos).' },
  { key: 'forja', label: 'Forja', hash: '#/admin/forja', title: 'Forja de Batalha', hint: 'Habilidades genéricas que qualquer Companion daquela essência e corpo pode usar.' },
  { key: 'invocador', label: 'Invocador', hash: '#/admin/invocador', title: 'Invocador de Monstros', hint: 'O catálogo de criaturas: corpo, jeito de lutar, onde aparecem e o que soltam.' },
  { key: 'arsenal', label: 'Arsenal', hash: '#/admin/arsenal', title: 'Arsenal', hint: 'Armas e equipamentos: modelo, atributos, raridade, pegada na mão e a receita da Forja (só Taurinas forjam).' },
  { key: 'missoes', label: 'Missões', hash: '#/admin/missoes', title: 'Missões', hint: 'Missões de coleta, caça e fabricação: quem dá, requisitos (missão anterior, vínculo, escola, classe, essência), objetivos, prêmios, raridade e repetição.' },
  { key: 'servidor', label: 'Servidor', hash: '#/admin/servidor', title: 'Servidor', hint: 'IA dos Companions, XP de vínculo e clima — vale na hora para todos os jogadores.' },
];
// o menu em grupos: quem são os Companions, o mundo, o catálogo do jogo e o que vale para o servidor inteiro
const GROUPS: { label: string; views: View[] }[] = [
  { label: 'Companions', views: ['companions'] },
  { label: 'Mundo', views: ['cidade', 'biomas', 'lojas', 'missoes'] },
  { label: 'Catálogo', views: ['forja', 'invocador', 'arsenal', 'animacoes'] },
  { label: 'Ao vivo', views: ['servidor'] },
];
const DIRTY_ASK = 'Há alterações não salvas nesta aba. Se sair agora, elas se perdem.';

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
  // alterações não salvas: cada estúdio avisa pelo AdminDirty; trocar de aba ou fechar a página pergunta antes
  const dirtyIds = useRef(new Set<string>());
  const reportDirty = useCallback((id: string, d: boolean) => { if (d) dirtyIds.current.add(id); else dirtyIds.current.delete(id); }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirtyIds.current.size) e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  async function go(next: View) {
    if (next === view) return;
    if (dirtyIds.current.size && !(await ask({ title: 'Sair sem salvar?', body: DIRTY_ASK, confirm: 'Sair e descartar', cancel: 'Continuar editando', danger: true }))) return;
    dirtyIds.current.clear();
    const swap = () => { flushSync(() => setView(next)); window.scrollTo({ top: 0 }); };
    history.replaceState(null, '', VIEWS.find((v) => v.key === next)!.hash);
    const doc = document as Document & { startViewTransition?: (f: () => void) => unknown };
    if (doc.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) doc.startViewTransition(swap); else swap();
  }
  // altura do cabeçalho fixo → --admin-head (barras laterais e telas 3D se encaixam abaixo dele)
  const shell = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = shell.current, head = el?.querySelector<HTMLElement>('.admin-head');
    if (!el || !head) return;
    const ro = new ResizeObserver(() => el.style.setProperty('--admin-head', head.offsetHeight + 'px'));
    ro.observe(head);
    return () => ro.disconnect();
  });

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

  // rig automático do modelo recém-enviado (ou refeito pelo botão); o endereço sai da lista de pedidos atualizada
  const [rigJob, setRigJob] = useState<{ id: string; name: string; url: string | null; path: string | null } | null>(null);

  async function uploadModel(job: Job, file: File, opts: { rigged?: boolean } = {}): Promise<boolean> {
    if (!/\.glb$/i.test(file.name)) { setMsg('Envie o modelo em .GLB.'); return false; }
    setBusy(true); setMsg(null);
    try {
      const rigged = opts.rigged ?? await glbHasRig(file);
      const modelPath = await putJobFile(job, file, 'model', 'model/gltf-binary');
      const kind = animKind(file.name);
      const ok = await update(job, job.status === 'approved' ? 'approved' : 'review', { modelPath, ...(kind ? { addAnims: [{ path: modelPath, kind, name: file.name }] } : {}) });
      if (ok && !rigged) setRigJob({ id: job.id, name: job.name, url: null, path: modelPath });
      return ok;
    } catch (e) { setMsg((e as Error).message); setBusy(false); return false; }
  }

  async function finishHumanRig(job: Job, file: File, progress: (message: string) => void = setMsg) {
    setBusy(true); setMsg(null);
    try {
      const count = await finishHumanRigJob(job, file, update, progress);
      setMsg('Rig de ' + job.name + ' salvo com ' + count + ' animações novas. Reabra o jogo para carregar o modelo atualizado.');
    } finally { setBusy(false); }
  }

  async function repairAnimations(job: Job) {
    if (!job.model?.url) return;
    setBusy(true); setMsg('Abrindo o rig atual de ' + job.name + '…');
    try {
      const response = await fetch(job.model.url);
      if (!response.ok) throw new Error('Não foi possível baixar o modelo atual (' + response.status + ').');
      const file = new File([await response.blob()], job.name.replace(/[^\w-]/g, '_') + '-rig.glb', { type: 'model/gltf-binary' });
      await finishHumanRig(job, file);
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Falha ao gerar animações.'); }
    finally { setBusy(false); }
  }

  async function uploadAnims(job: Job, files: File[], opts: { dropPrefix?: string } = {}): Promise<boolean> {
    const glbs = files.filter((f) => /\.glb$/i.test(f.name));
    if (!glbs.length) { setMsg('Envie as animações em .GLB.'); return false; }
    setBusy(true); setMsg(null);
    try {
      const addAnims = [];
      for (const f of glbs) addAnims.push({ path: await putJobFile(job, f, 'anims', 'model/gltf-binary'), kind: animKind(f.name) ?? 'special', name: f.name });
      return await update(job, job.status === 'approved' ? 'approved' : 'review', { addAnims, ...(opts.dropPrefix ? { dropAnimsPrefix: opts.dropPrefix } : {}) });
    } catch (e) { setMsg((e as Error).message); setBusy(false); return false; }
  }

  async function uploadArt(job: Job, file: File) {
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
    <FactoryJobView
      key={j.id}
      job={j}
      busy={busy}
      onUpdate={update}
      onUploadArt={uploadArt}
      onUploadModel={uploadModel}
      onUploadAnims={uploadAnims}
      onRequestRig={(job) => setRigJob({ id: job.id, name: job.name, url: job.model!.url, path: null })}
      onRepairAnims={repairAnimations}
    />
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
    <AdminDirty.Provider value={reportDirty}>
    <div className="admin" ref={shell}>
      <AdminDialogHost />
      <header className="admin-head">
        <div className="admin-bar">
          <h1>O Administrador</h1>
          <nav className="admin-tabs" aria-label="Seções">
            {GROUPS.map((g) => (
              <div key={g.label} className="admin-group" role="group" aria-label={g.label}>
                <span className="admin-group-label" aria-hidden>{g.label}</span>
                {g.views.map((k) => { const v = VIEWS.find((x) => x.key === k)!; return <button key={k} className={view === k ? 'on' : ''} aria-current={view === k ? 'page' : undefined} title={v.label} onClick={() => void go(k)}><Icon name={k} />{v.label}</button>; })}
              </div>
            ))}
          </nav>
          <a className="admin-back" href="#/" title="Voltar ao jogo"><Icon name="back" size={16} />Voltar ao jogo</a>
        </div>
      </header>
      <div className="admin-title">
        <h2>{V.title}</h2>
        <p>{V.hint}</p>
      </div>

      {msg && <p className="msg err" role="alert">{msg}</p>}

      {session && view === 'animacoes' && <AnimStudio jobs={jobs ?? []} onUploadAnims={uploadAnims} busy={busy} />}
      {rigJob && (() => {
        const job = jobs?.find((x) => x.id === rigJob.id);
        const url = rigJob.url ?? (job?.model?.url && (!rigJob.path || job.modelPath === rigJob.path) ? job.model.url : null);
        if (!job || !url) return null;
        return (
          <AutoRig url={url} name={rigJob.name} rig="human" onClose={() => setRigJob(null)}
            onDone={async (file, progress) => {
              await finishHumanRig(job, file, progress);
              setRigJob(null);
            }} />
        );
      })()}
      {session && view === 'biomas' && <BiomeStudio />}
      {session && view === 'cidade' && <CityStudio />}
      {session && view === 'forja' && <ForgeStudio />}
      {session && view === 'invocador' && <SummonerStudio />}
      {session && view === 'arsenal' && <ArsenalStudio />}
      {session && view === 'missoes' && <MissionStudio />}
      {session && view === 'servidor' && <ServerStudio />}
      {session && view === 'lojas' && <ShopStudio />}
      {session && view === 'companions' && (
        <CompanionsAdmin jobs={jobs ?? []} renderJob={renderJob} reloadKey={jobs} onReloadJobs={() => void load()} busy={busy} />
      )}
    </div>
    </AdminDirty.Provider>
  );
}
