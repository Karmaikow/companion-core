/**
 * O Administrador — painel do ADM (abre em /#/admin): Fábrica de Companions, Biomas, Forja, Invocador, Arsenal, Servidor.
 * Lista os pedidos de arte gerados no despertar, mostra o prompt de criação
 * montado a partir do contrato de identidade e recebe a arte final.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { buildArtPrompt, animKind, ANIM_KINDS, type ArtPrompt, type IdentityContractV1 } from '@rules';
import { AdminDialogHost, AdminDirty, Icon, Tabs, ask, useAdminDirty } from './adminKit';
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
import { SkillAnimPicker } from './SkillAnimPicker';
import { CompanionsAdmin } from './AdminCompanions';
import { AdminVoid } from './AdminVoid';
import { AnimStudio } from './AnimStudio';
import { AutoRig, glbHasRig } from './RigEditor';
import { STANDARD_PREFIX } from '../m2m/slots';

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

export interface Job {
  id: string; companionId: string; status: string; createdAt: string; updatedAt: string; contractVersion: number;
  name: string; contract: IdentityContractV1; prompt: ArtPrompt; artUrl?: string; artPath: string | null; error?: string | null;
  model?: { url: string; anims?: { url: string; kind: string; name: string }[] }; modelPath: string | null; animPaths: { path: string; kind: string; name: string }[];
}

const STATUS: Record<string, string> = { queued: 'Na fila', generating: 'Gerando', review: 'Em revisão', approved: 'No jogo', failed: 'Falhou' };

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
  /** Prepare both artifacts before publishing; never attach an old rig's standard pack. */
  async function finishHumanRig(job: Job, file: File, progress: (message: string) => void = setMsg) {
    setBusy(true); setMsg(null);
    try {
      const { prepareRigPackage } = await import('../m2m/rigPackage');
      const pack = await prepareRigPackage(file, progress);
      progress('Enviando modelo e animações…');
      const modelPath = await put(job, file, 'model', 'model/gltf-binary');
      const animPath = await put(job, pack.animations, 'anims', 'model/gltf-binary');
      const db = supabase();
      const previous = await db.from('companion_skill_anims').select('anims').eq('companion_id', job.companionId).maybeSingle();
      if (previous.error) throw new Error(previous.error.message);
      const old = (previous.data?.anims ?? {}) as Record<string, string>;
      const uid = (await db.auth.getUser()).data.user?.id;
      const writeMap = (anims: Record<string, string>) => db.from('companion_skill_anims').upsert({ companion_id: job.companionId, anims, updated_at: new Date().toISOString(), updated_by: uid });
      const mapping = await writeMap({ ...old, ...pack.slots });
      if (mapping.error) throw new Error(mapping.error.message);
      const ok = await update(job, job.status === 'approved' ? 'approved' : 'review', {
        modelPath, addAnims: [{ path: animPath, kind: 'special', name: pack.animations.name }], dropAnimsPrefix: STANDARD_PREFIX,
      });
      if (!ok) {
        const rollback = await writeMap(old);
        throw new Error(rollback.error ? 'Falha ao publicar o modelo e ao restaurar as escolhas de animação. Confira a aba Animações.' : 'Não foi possível publicar o rig animado; as escolhas anteriores foram restauradas.');
      }
      setMsg('Rig de ' + job.name + ' salvo com ' + pack.count + ' animações novas. Reabra o jogo para carregar o modelo atualizado.');
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

  const copy = (text: string) => void navigator.clipboard?.writeText(text);
  const renderJob = (j: Job) => {
    // o caminho de um pedido, na ordem em que acontece: referência → modelo → animações → no jogo
    const steps = [
      { key: 'ref', label: 'Referência', done: !!j.artPath },
      { key: 'model', label: 'Modelo 3D', done: !!j.modelPath },
      { key: 'anims', label: 'Animações', done: j.animPaths.length > 0 },
      { key: 'jogo', label: 'Refúgio e jogo', done: j.status === 'approved' },
    ];
    const panes: Record<string, ReactNode> = {
      ref: (
        <div className="job-body">
          <div className="prompt">
            <p className="summary-line">{j.prompt.summaryPt}</p>
            <div className="palette" aria-label="Paleta">
              {Object.entries(j.contract.palette).map(([k, v]) => <span key={k} title={`${k} ${v}`} style={{ background: v }} />)}
            </div>
            <div className="class-line">
              <b>{j.prompt.sheet.species.label}</b> · humanoide · {j.prompt.sheet.species.features}
              <small>{j.prompt.sheet.appendages.note}</small>
            </div>
            <details className="job-prompts" open={!j.artPath}>
              <summary>Prompts para gerar a arte e o modelo</summary>
              <label>1. Referência para o modelo 3D (Tripo, rig humanoide) <button className="link" onClick={() => copy(j.prompt.modelPrompt)}>copiar</button></label>
              <textarea readOnly value={j.prompt.modelPrompt} rows={6} />
              <small>Evitar: {j.prompt.modelNegative}</small>
              <label>Folha de vistas da referência (frente, esquerda, direita, verso → multivista do Tripo) <button className="link" onClick={() => copy(j.prompt.views)}>copiar</button></label>
              <textarea readOnly value={j.prompt.views} rows={4} />
              <label>2. Arte do retrato (com {j.prompt.sheet.appendages.tail || j.prompt.sheet.appendages.wings ? 'cauda/asas' : 'todos os traços'}; não vai para o Tripo) <button className="link" onClick={() => copy(j.prompt.prompt)}>copiar</button></label>
              <textarea readOnly value={j.prompt.prompt} rows={5} />
              <label>Evitar no retrato <button className="link" onClick={() => copy(j.prompt.negative)}>copiar</button></label>
              <textarea readOnly value={j.prompt.negative} rows={2} />
              <small>Formato: {j.prompt.size} · Rig no Tripo: <b>humanoide</b> (o mesmo para todos; animações prontas de humanoide servem)</small>
            </details>
            <details><summary>Ficha do personagem (JSON)</summary><pre>{JSON.stringify(j.prompt.sheet, null, 2)}</pre><button className="link" onClick={() => copy(JSON.stringify(j.prompt.sheet, null, 2))}>copiar ficha</button></details>
            <details><summary>Contrato de identidade (JSON)</summary><pre>{JSON.stringify(j.contract, null, 2)}</pre></details>
          </div>
          <div className="art">
            {j.artUrl ? <img src={j.artUrl} alt={`Arte de ${j.name}`} /> : <div className="art-empty">Sem arte ainda</div>}
            <label className="upload">
              <input type="file" accept="image/png,image/webp,image/jpeg" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(j, f); e.target.value = ''; }} />
              {j.artUrl ? 'Trocar imagem de referência' : 'Enviar imagem de referência'}
            </label>
          </div>
        </div>
      ),
      model: (
        <div className="model-box">
          {j.modelPath ? <small className="ok">Modelo enviado: {j.modelPath.split('/').pop()}</small> : <small>Sem modelo ainda (.GLB do Tripo, com ou sem rig).</small>}
          <label className="upload">
            <input type="file" accept=".glb,model/gltf-binary" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadModel(j, f); e.target.value = ''; }} />
            {j.modelPath ? 'Trocar modelo .GLB' : 'Enviar modelo .GLB'}
          </label>
          <small className="hint">Envie o .GLB sem rig: o esqueleto é encaixado aqui e recebe o pacote de animações automaticamente.</small>
          {j.model?.url && (
            <details className="job-tools">
              <summary>Ferramentas do rig</summary>
              <button className="ghost" disabled={busy} onClick={() => setRigJob({ id: j.id, name: j.name, url: j.model!.url, path: null })} title="Encaixa o esqueleto humano de novo, sozinho (se o rig do modelo saiu torto)">Refazer o rig automático</button>
              <button className="ghost" disabled={busy} onClick={() => void repairAnimations(j)}>Gerar animações deste rig</button>
            </details>
          )}
        </div>
      ),
      anims: (
        <div className="model-box">
          {j.animPaths.length ? (
            <AnimKinds key={j.id + j.updatedAt} job={j} busy={busy} onSave={(changes) => saveAnimKinds(j, changes)} onRemove={(a) => void ask({ title: `Tirar a animação "${a.name || a.path.split('/').pop()}"?`, body: `Sai da lista de ${j.name}. O arquivo continua guardado.`, confirm: 'Tirar', danger: true }).then((ok) => { if (ok) void update(j, j.status, { removeAnim: a.path }); })} />
          ) : <small>Nenhuma. Exporte cada animação do mesmo rig num .GLB e ponha o tipo no nome: parado, andando, correndo, ataque, desmaiado, feliz, dormindo, pulo, comendo.</small>}
          <label className="upload">
            <input type="file" accept=".glb,model/gltf-binary" multiple disabled={busy || !j.modelPath} onChange={(e) => { const fs = [...(e.target.files ?? [])]; if (fs.length) void uploadAnims(j, fs); e.target.value = ''; }} />
            {j.modelPath ? '+ Animações .GLB (pode escolher várias)' : 'Envie o modelo 3D antes das animações'}
          </label>
          <SkillAnimPicker companionId={j.companionId} contract={j.contract} modelUrl={j.model?.url} anims={j.animPaths} />
        </div>
      ),
      jogo: <RefugeBiomePicker companionId={j.companionId} />,
    };
    const live = j.status === 'approved';
    const foot = (
      <div className="studio-foot section">
        <div className="studio-foot-state">
          <span className={'pill ' + (live ? 'published' : 'draft')}>{STATUS[j.status] ?? j.status}</span>
          {!live && !(j.artPath || j.modelPath) && <small className="hint">Publicar libera depois da imagem ou do modelo.</small>}
        </div>
        <div className="studio-foot-act">
          {j.status === 'queued' && <button className="ghost" disabled={busy} onClick={() => void update(j, 'generating')}>Marcar "gerando"</button>}
          {live
            ? <button className="ghost" disabled={busy} onClick={() => void ask({ title: `Despublicar a arte de ${j.name}?`, body: 'Some do jogo agora e volta para revisão.', confirm: 'Despublicar' }).then((ok) => { if (ok) void update(j, 'review'); })}>Despublicar</button>
            : <button className="primary" disabled={busy || !(j.artPath || j.modelPath)} onClick={() => void ask({ title: `Publicar a arte de ${j.name}?`, body: `A pessoa passa a ver ${j.modelPath ? 'o modelo 3D' : 'a imagem'} no jogo.`, confirm: 'Publicar' }).then((ok) => { if (ok) void update(j, 'approved'); })}>Publicar</button>}
        </div>
      </div>
    );
    return <JobCard key={j.id} job={j} steps={steps} panes={panes} foot={foot} />;
  };

  // tipos de animação: escolhe na lista e grava tudo de uma vez (antes, cada troca no menu gravava na hora)
  async function saveAnimKinds(job: Job, changes: { path: string; kind: string }[]) {
    for (const c of changes) if (!(await update(job, job.status, { setAnim: c }))) return false;
    return true;
  }

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

/**
 * Refúgio do Companion: todos usam o bioma padrão "refugio"; um Companion evoluído pode ganhar um Refúgio próprio
 * (qualquer bioma publicado no Estúdio — de preferência um com "Aparece no mundo" desligado).
 */
/** um pedido da Fábrica: abre na primeira etapa que falta; o rodapé de publicar fica sempre à vista */
function JobCard({ job, steps, panes, foot }: { job: Job; steps: { key: string; label: string; done: boolean }[]; panes: Record<string, ReactNode>; foot: ReactNode }) {
  const [tab, setTab] = useState(() => steps.find((s) => !s.done)?.key ?? 'ref');
  return (
    <article className={'job ' + job.status}>
      <header>
        <div>
          <strong>{job.name}</strong>
          <small>{new Date(job.createdAt).toLocaleString('pt-BR')} · contrato v{job.contractVersion}</small>
        </div>
      </header>
      <Tabs label={'Etapas do pedido de ' + job.name} idPrefix={job.id} items={steps} value={tab} onChange={setTab} />
      <div className="job-pane" role="tabpanel" aria-labelledby={'tab-' + job.id + tab}>{panes[tab]}</div>
      {foot}
    </article>
  );
}

function AnimKinds({ job, busy, onSave, onRemove }: { job: Job; busy: boolean; onSave: (changes: { path: string; kind: string }[]) => Promise<boolean>; onRemove: (a: Job['animPaths'][number]) => void }) {
  const [kinds, setKinds] = useState<Record<string, string>>({});
  const changes = job.animPaths.filter((a) => kinds[a.path] && kinds[a.path] !== a.kind).map((a) => ({ path: a.path, kind: kinds[a.path] }));
  useAdminDirty(changes.length > 0);
  return (
    <>
      <ul className="anim-list">
        {job.animPaths.map((a) => (
          <li key={a.path} className={kinds[a.path] && kinds[a.path] !== a.kind ? 'changed' : ''}>
            <span title={a.name}>{a.name || a.path.split('/').pop()}</span>
            <select value={kinds[a.path] ?? a.kind} disabled={busy} onChange={(e) => setKinds((k) => ({ ...k, [a.path]: e.target.value }))} aria-label={'Tipo de ' + (a.name || 'animação')}>
              {ANIM_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
              <option value="special">Especial</option>
            </select>
            <button className="link" disabled={busy} onClick={() => onRemove(a)}>tirar</button>
          </li>
        ))}
      </ul>
      {changes.length > 0 && (
        <div className="row inline-save">
          <small className="dirty-note">{changes.length} tipo{changes.length > 1 ? 's' : ''} trocado{changes.length > 1 ? 's' : ''}</small>
          <button className="ghost" disabled={busy} onClick={() => setKinds({})}>Desfazer</button>
          <button className="primary" disabled={busy} onClick={() => void onSave(changes).then((ok) => { if (ok) setKinds({}); })}>Salvar tipos</button>
        </div>
      )}
    </>
  );
}

function RefugeBiomePicker({ companionId }: { companionId: string }) {
  const [list, setList] = useState<{ slug: string; name: string; status: string }[] | null>(null);
  const [cur, setCur] = useState<string>('');
  const [pick, setPick] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useAdminDirty(pick !== null && pick !== cur);
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
    setCur(slug); setPick(null);
    const b = list?.find((x) => x.slug === slug);
    setNote(slug ? (b?.status === 'published' ? 'Salvo. O Refúgio muda na próxima vez que a pessoa abrir o jogo.' : 'Salvo, mas este bioma é rascunho: publique no Estúdio para valer no jogo.') : 'Voltou para o Refúgio padrão.');
  }
  if (!list) return null;
  return (
    <div className="model-box">
      <strong>Refúgio deste Companion</strong>
      <select value={pick ?? cur} onChange={(e) => { setPick(e.target.value); setNote(null); }} aria-label="Bioma do Refúgio">
        <option value="">Padrão (bioma "refugio")</option>
        {list.filter((b) => b.slug !== 'refugio').map((b) => <option key={b.slug} value={b.slug}>{b.name}{b.status === 'published' ? '' : ' (rascunho)'}</option>)}
      </select>
      {pick !== null && pick !== cur && (
        <div className="row inline-save">
          <button className="ghost" onClick={() => setPick(null)}>Desfazer</button>
          <button className="primary" onClick={() => void choose(pick)}>Salvar Refúgio</button>
        </div>
      )}
      {note && <small role="status">{note}</small>}
    </div>
  );
}
