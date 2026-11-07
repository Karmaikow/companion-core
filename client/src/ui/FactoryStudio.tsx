/**
 * Fábrica de Companions — etapas de criação da arte e do modelo 3D de cada pedido (`visual_jobs`):
 * 1. Referência (prompts e upload da arte 2D)
 * 2. Modelo 3D (.GLB com rig automático Mesh2Motion)
 * 3. Animações (.GLB adicionais e tipos de clipe)
 * 4. Refúgio e aprovação para publicação no jogo
 */
import { useEffect, useState, type ReactNode } from 'react';
import { ANIM_KINDS, type ArtPrompt, type IdentityContractV1 } from '@rules';
import { Tabs, ask, useAdminDirty } from './adminKit';
import { supabase } from '../backend/online';
import { SkillAnimPicker } from './SkillAnimPicker';
import { STANDARD_PREFIX } from '../m2m/slots';

export interface Job {
  id: string; companionId: string; status: string; createdAt: string; updatedAt: string; contractVersion: number;
  name: string; contract: IdentityContractV1; prompt: ArtPrompt; artUrl?: string; artPath: string | null; error?: string | null;
  model?: { url: string; anims?: { url: string; kind: string; name: string }[] }; modelPath: string | null; animPaths: { path: string; kind: string; name: string }[];
}

const STATUS: Record<string, string> = { queued: 'Na fila', generating: 'Gerando', review: 'Em revisão', approved: 'No jogo', failed: 'Falhou' };

export async function putJobFile(job: Job, file: File, folder: string, type: string) {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
  const safe = file.name.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[^\w-]+/g, '_').slice(0, 40);
  const path = `companions/${job.companionId}/${folder}/v${job.contractVersion}-${Date.now()}-${safe}.${ext}`;
  // o navegador não informa tipo para .glb (vira application/octet-stream, que o bucket recusa): reembala com o tipo certo
  const body = file.type === type ? file : new Blob([file], { type });
  const { error } = await supabase().storage.from('companion-studio').upload(path, body, { contentType: type, upsert: false, cacheControl: '31536000' });
  if (error) throw new Error('Falha no envio de ' + file.name + ': ' + error.message);
  return path;
}

/** Prepara o pacote de animações padrão do rig humano antes de publicar, com rollback se a atualização falhar. */
export async function finishHumanRigJob(
  job: Job,
  file: File,
  updateJob: (job: Job, status: string, extra: Record<string, unknown>) => Promise<boolean>,
  progress: (message: string) => void,
) {
  const { prepareRigPackage } = await import('../m2m/rigPackage');
  const pack = await prepareRigPackage(file, progress);
  progress('Enviando modelo e animações…');
  const modelPath = await putJobFile(job, file, 'model', 'model/gltf-binary');
  const animPath = await putJobFile(job, pack.animations, 'anims', 'model/gltf-binary');
  const db = supabase();
  const previous = await db.from('companion_skill_anims').select('anims').eq('companion_id', job.companionId).maybeSingle();
  if (previous.error) throw new Error(previous.error.message);
  const old = (previous.data?.anims ?? {}) as Record<string, string>;
  const uid = (await db.auth.getUser()).data.user?.id;
  const writeMap = (anims: Record<string, string>) =>
    db.from('companion_skill_anims').upsert({ companion_id: job.companionId, anims, updated_at: new Date().toISOString(), updated_by: uid });
  const mapping = await writeMap({ ...old, ...pack.slots });
  if (mapping.error) throw new Error(mapping.error.message);
  const ok = await updateJob(job, job.status === 'approved' ? 'approved' : 'review', {
    modelPath, addAnims: [{ path: animPath, kind: 'special', name: pack.animations.name }], dropAnimsPrefix: STANDARD_PREFIX,
  });
  if (!ok) {
    const rollback = await writeMap(old);
    throw new Error(
      rollback.error
        ? 'Falha ao publicar o modelo e ao restaurar as escolhas de animação. Confira a aba Animações.'
        : 'Não foi possível publicar o rig animado; as escolhas anteriores foram restauradas.',
    );
  }
  return pack.count;
}

export interface FactoryJobProps {
  job: Job;
  busy: boolean;
  onUpdate: (job: Job, status: string, extra?: Record<string, unknown>) => Promise<boolean>;
  onUploadArt: (job: Job, file: File) => Promise<void>;
  onUploadModel: (job: Job, file: File) => Promise<boolean>;
  onUploadAnims: (job: Job, files: File[]) => Promise<boolean>;
  onRequestRig: (job: Job) => void;
  onRepairAnims: (job: Job) => Promise<void>;
}

export function FactoryJobView({
  job: j,
  busy,
  onUpdate,
  onUploadArt,
  onUploadModel,
  onUploadAnims,
  onRequestRig,
  onRepairAnims,
}: FactoryJobProps) {
  const copy = (text: string) => void navigator.clipboard?.writeText(text);

  async function saveAnimKinds(changes: { path: string; kind: string }[]) {
    for (const c of changes) if (!(await onUpdate(j, j.status, { setAnim: c }))) return false;
    return true;
  }

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
            <input type="file" accept="image/png,image/webp,image/jpeg" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUploadArt(j, f); e.target.value = ''; }} />
            {j.artUrl ? 'Trocar imagem de referência' : 'Enviar imagem de referência'}
          </label>
        </div>
      </div>
    ),
    model: (
      <div className="model-box">
        {j.modelPath ? <small className="ok">Modelo enviado: {j.modelPath.split('/').pop()}</small> : <small>Sem modelo ainda (.GLB do Tripo, com ou sem rig).</small>}
        <label className="upload">
          <input type="file" accept=".glb,model/gltf-binary" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUploadModel(j, f); e.target.value = ''; }} />
          {j.modelPath ? 'Trocar modelo .GLB' : 'Enviar modelo .GLB'}
        </label>
        <small className="hint">Envie o .GLB sem rig: o esqueleto é encaixado aqui e recebe o pacote de animações automaticamente.</small>
        {j.model?.url && (
          <details className="job-tools">
            <summary>Ferramentas do rig</summary>
            <button className="ghost" disabled={busy} onClick={() => onRequestRig(j)} title="Encaixa o esqueleto humano de novo, sozinho (se o rig do modelo saiu torto)">Refazer o rig automático</button>
            <button className="ghost" disabled={busy} onClick={() => void onRepairAnims(j)}>Gerar animações deste rig</button>
          </details>
        )}
      </div>
    ),
    anims: (
      <div className="model-box">
        {j.animPaths.length ? (
          <AnimKinds key={j.id + j.updatedAt} job={j} busy={busy} onSave={saveAnimKinds} onRemove={(a) => void ask({ title: `Tirar a animação "${a.name || a.path.split('/').pop()}"?`, body: `Sai da lista de ${j.name}. O arquivo continua guardado.`, confirm: 'Tirar', danger: true }).then((ok) => { if (ok) void onUpdate(j, j.status, { removeAnim: a.path }); })} />
        ) : <small>Nenhuma. Exporte cada animação do mesmo rig num .GLB e ponha o tipo no nome: parado, andando, correndo, ataque, desmaiado, feliz, dormindo, pulo, comendo.</small>}
        <label className="upload">
          <input type="file" accept=".glb,model/gltf-binary" multiple disabled={busy || !j.modelPath} onChange={(e) => { const fs = [...(e.target.files ?? [])]; if (fs.length) void onUploadAnims(j, fs); e.target.value = ''; }} />
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
        {j.status === 'queued' && <button className="ghost" disabled={busy} onClick={() => void onUpdate(j, 'generating')}>Marcar "gerando"</button>}
        {live
          ? <button className="ghost" disabled={busy} onClick={() => void ask({ title: `Despublicar a arte de ${j.name}?`, body: 'Some do jogo agora e volta para revisão.', confirm: 'Despublicar' }).then((ok) => { if (ok) void onUpdate(j, 'review'); })}>Despublicar</button>
          : <button className="primary" disabled={busy || !(j.artPath || j.modelPath)} onClick={() => void ask({ title: `Publicar a arte de ${j.name}?`, body: `A pessoa passa a ver ${j.modelPath ? 'o modelo 3D' : 'a imagem'} no jogo.`, confirm: 'Publicar' }).then((ok) => { if (ok) void onUpdate(j, 'approved'); })}>Publicar</button>}
      </div>
    </div>
  );

  return <JobCard job={j} steps={steps} panes={panes} foot={foot} />;
}

/** Um pedido da Fábrica: abre na primeira etapa que falta; o rodapé de publicar fica sempre à vista. */
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
