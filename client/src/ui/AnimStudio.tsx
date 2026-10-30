/**
 * O Administrador → Animações: qual clipe do modelo faz cada papel (parado, andando, correndo, golpes, coleta…),
 * com um campo de treino que mostra o comportamento (andando/correndo em círculo, golpes no lugar, ou uma simulação
 * do jogo). Companions gravam em companion_skill_anims ("slot:<papel>"); monstros, em creatures.data.animMap — e
 * monstros também podem usar o movimento por código em qualquer papel.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { COMPANION_ANIM_SLOTS, CREATURE_ANIM_SLOTS, animKind, animRef, attackVariant, parseAnimRef, sanitizeCreature, gatherSlot, type AnimSlot, type CreatureDef } from '@rules';
import { supabase } from '../backend/online';
import { facingYaw, inPlace, restBox, sanitizeSkins } from '../scene/CompanionModel';
import { CreatureBody, type CreatureAct } from '../scene/Creature';
import { useCatalog } from './catalog';
import type { Job } from './AdminPanel';
import { STANDARD_EXTRAS, STANDARD_PREFIX, STANDARD_SLOTS, STANDARD_VIRTUAL } from '../m2m/slots';
import type { Retargeter } from '../m2m/standard';

const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const loadOnce = (() => { const c = new Map<string, Promise<GLTF>>(); return (u: string) => { const k = u.split('?')[0]; if (!c.has(k)) { const p = loader.loadAsync(u); c.set(k, p); p.catch(() => c.delete(k)); } return c.get(k)!; }; })();

interface Clip { file: string; clip: THREE.AnimationClip; kind: string; stride: number }
type Mode = 'slot' | 'idle' | 'walk' | 'run' | 'sim';
type Upload = (job: Job, files: File[], opts?: { dropPrefix?: string }) => Promise<boolean>;

/** Qual clipe o jogo usaria sozinho (pelo nome) para um papel. */
function autoClip(clips: Clip[], key: string): Clip | null {
  if (key.startsWith('attack:')) {
    const v = key.slice(7);
    return clips.find((c) => c.kind === 'attack' && attackVariant(c.clip.name, c.file) === v) ?? null;
  }
  const kind = key === 'mine' || key === 'chop' || key === 'gather' ? 'pickup' : key === 'fidget' ? '__none' : key;
  return clips.find((c) => c.kind === kind) ?? null;
}

export function AnimStudio({ jobs, onUploadAnims, busy }: { jobs: Job[]; onUploadAnims: Upload; busy: boolean }) {
  const [who, setWho] = useState<'companions' | 'monstros'>('companions');
  return (
    <div className="anim-studio">
      <nav className="admin-tabs sub" aria-label="Animações de">
        <button className={who === 'companions' ? 'on' : ''} onClick={() => setWho('companions')}>Companions</button>
        <button className={who === 'monstros' ? 'on' : ''} onClick={() => setWho('monstros')}>Monstros</button>
      </nav>
      {who === 'companions' ? <CompanionAnims jobs={jobs} onUploadAnims={onUploadAnims} busy={busy} /> : <CreatureAnims />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Companions

function CompanionAnims({ jobs, onUploadAnims, busy }: { jobs: Job[]; onUploadAnims: Upload; busy: boolean }) {
  const withModel = useMemo(() => { const seen = new Set<string>(); return jobs.filter((j) => j.model?.url && !seen.has(j.companionId) && seen.add(j.companionId)); }, [jobs]);
  const [cid, setCid] = useState<string | null>(null);
  const job = withModel.find((j) => j.companionId === cid) ?? withModel[0] ?? null;
  const [gltf, setGltf] = useState<GLTF | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [all, setAll] = useState<Record<string, string>>({});
  const [map, setMap] = useState<Record<string, string>>({});
  const [note, setNote] = useState<string | null>(null);
  const [sel, setSel] = useState<string>('idle');
  const [mode, setMode] = useState<Mode>('slot');
  const files = useRef<HTMLInputElement>(null);
  // animações padrão (Mesh2Motion): a biblioteca convertida para este Companion, só enquanto a aba está aberta
  const [rt, setRt] = useState<Retargeter | null>(null);
  const [rtNote, setRtNote] = useState<string | null>(null);
  const [rtBusy, setRtBusy] = useState(false);
  const stdCache = useRef(new Map<string, Clip>());
  const modelKey = job ? job.model!.url.split('?')[0] + '|' + (job.model as { anims?: { url: string }[] }).anims?.map((a) => a.url.split('?')[0]).join(',') : '';
  useEffect(() => { setRt(null); setRtNote(null); stdCache.current.clear(); }, [job?.companionId, modelKey]);
  const stdClip = (name: string): Clip | null => {
    if (!rt) return null;
    const hit = stdCache.current.get(name);
    if (hit) return hit;
    const c = rt.get(name);
    if (!c) return null;
    const cl = c.clone();
    const out: Clip = { file: STANDARD_VIRTUAL, clip: cl, kind: animKind(name) ?? 'special', stride: inPlace(cl) / Math.max(0.01, cl.duration) };
    stdCache.current.set(name, out);
    return out;
  };
  const isStd = (v: string | undefined) => { const r = parseAnimRef(v); return !!r && r !== 'procedural' && (r.file === STANDARD_VIRTUAL || r.file.startsWith(STANDARD_PREFIX)) ? r : null; };

  async function openStandard(fill: boolean) {
    if (!gltf || rtBusy) return;
    setRtBusy(true); setRtNote('Carregando a biblioteca do Mesh2Motion (uns 9 MB, só aqui no Administrador)…');
    try {
      const m2m = await import('../m2m/standard');
      const r = rt ?? await m2m.makeRetargeter(gltf.scene);
      setRt(r);
      if (fill) {
        const next = { ...map };
        const keys = Object.keys(STANDARD_SLOTS);
        for (let i = 0; i < keys.length; i++) {
          setRtNote(`Convertendo para ${job?.name ?? 'o Companion'}: ${i + 1} de ${keys.length}…`);
          await new Promise((ok) => setTimeout(ok, 0));
          if (r.get(STANDARD_SLOTS[keys[i]])) next[keys[i]] = animRef(STANDARD_VIRTUAL, STANDARD_SLOTS[keys[i]]);
        }
        setMap(next);
      }
      const rig = r.rigType === 'mixamo' ? 'Mixamo' : r.rigType === 'rigify' ? 'Rigify' : r.rigType === 'mesh2motion' ? 'do Mesh2Motion (encaixe perfeito)' : 'próprio';
      setRtNote(`Esqueleto ${rig}: ${r.mapped} de ${r.bones} ossos ligados. ${fill ? 'Os 20 papéis usam o pacote padrão — confira no campo de treino e salve.' : 'A biblioteca (165 animações) aparece em cada papel.'}`);
    } catch (e) { setRtNote((e as Error).message); }
    finally { setRtBusy(false); }
  }

  useEffect(() => {
    if (!job) return;
    let alive = true;
    setGltf(null); setClips([]); setNote(null);
    (async () => {
      const m = job.model as { url: string; anims?: { url: string; kind: string; name: string }[] };
      const g = await loadOnce(m.url);
      const out: Clip[] = [];
      const add = (list: THREE.AnimationClip[], file: string, hint: string | null) => list.forEach((clip) => { const cl = clip.clone(); out.push({ file, clip: cl, kind: (hint && hint !== 'special' ? hint : null) ?? animKind(file, clip.name) ?? 'special', stride: inPlace(cl) / Math.max(0.01, cl.duration) }); });
      add(g.animations, 'corpo', g.animations.length > 1 ? null : animKind(m.url.split('?')[0]));
      for (const a of m.anims ?? []) { if (a.url === m.url) continue; try { const ga = await loadOnce(a.url); add(ga.animations, a.name, ga.animations.length > 1 ? null : a.kind); } catch { /* sem essa */ } }
      if (alive) { setGltf(g); setClips(out); }
    })().catch(() => alive && setNote('Não consegui abrir o modelo.'));
    supabase().from('companion_skill_anims').select('anims').eq('companion_id', job.companionId).maybeSingle().then(({ data }) => {
      if (!alive) return;
      const a = (data?.anims ?? {}) as Record<string, string>;
      setAll(a); setMap(Object.fromEntries(Object.entries(a).filter(([k]) => k.startsWith('slot:')).map(([k, v]) => [k.slice(5), v])));
    }, () => {});
    return () => { alive = false; };
  }, [job?.companionId, modelKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (key: string): Clip | null => {
    const ref = parseAnimRef(map[key]);
    if (ref && ref !== 'procedural' && ref.file === STANDARD_VIRTUAL) return stdClip(ref.clip);
    if (ref && ref !== 'procedural') return clips.find((c) => c.clip.name === ref.clip && (ref.file === '*' || c.file === ref.file)) ?? null;
    return autoClip(clips, key);
  };
  const saved = Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith('slot:')).map(([k, v]) => [k.slice(5), v]));
  const dirty = JSON.stringify(map) !== JSON.stringify(saved);

  async function save() {
    if (!job) return;
    setNote(null);
    // clipes do pacote padrão ainda não gravados: um .GLB só de animação com todos os do pacote em uso (troca o anterior)
    let slots = map, file: File | null = null, count = 0;
    if (Object.values(map).some((v) => isStd(v)?.file === STANDARD_VIRTUAL)) {
      if (!rt || !gltf) { setNote('Abra as animações padrão de novo para gravar.'); return; }
      setNote('Gravando o arquivo de animações…');
      const m2m = await import('../m2m/standard');
      const name = `${STANDARD_PREFIX}-${Date.now()}.glb`;
      const used = new Set<string>(STANDARD_EXTRAS), conv: Record<string, string> = {};
      for (const [k, v] of Object.entries(map)) { const r = isStd(v); if (r) { used.add(r.clip); conv[k] = animRef(name, r.clip); } }
      const out = [...used].map((n) => rt.get(n)).filter((c): c is THREE.AnimationClip => !!c);
      count = out.length;
      file = new File([await m2m.exportClips(gltf.scene, out)], name, { type: 'model/gltf-binary' });
      slots = { ...map, ...conv };
    }
    const uid = (await supabase().auth.getUser()).data.user?.id;
    const keep = Object.fromEntries(Object.entries(all).filter(([k]) => !k.startsWith('slot:')));
    const next = { ...keep, ...Object.fromEntries(Object.entries(slots).filter(([, v]) => v).map(([k, v]) => ['slot:' + k, v])) };
    const r = await supabase().from('companion_skill_anims').upsert({ companion_id: job.companionId, anims: next, updated_at: new Date().toISOString(), updated_by: uid });
    if (r.error) { setNote('Não deu para salvar: ' + r.error.message); return; }
    if (file) {
      // as escolhas já apontam para o arquivo novo; se o envio falhar, voltam as anteriores
      if (!(await onUploadAnims(job, [file], { dropPrefix: STANDARD_PREFIX }))) {
        await supabase().from('companion_skill_anims').upsert({ companion_id: job.companionId, anims: all, updated_at: new Date().toISOString(), updated_by: uid });
        setNote('Não deu para enviar o arquivo de animações; as escolhas anteriores continuam valendo.');
        return;
      }
      setMap(slots);
    }
    setAll(next);
    setNote(file ? `Salvo: ${count} animações do Mesh2Motion (${Math.round(file.size / 1024)} KB) no arquivo do jogo. Vale na próxima vez que o jogo do dono abrir.` : 'Salvo. Vale na próxima vez que o jogo do dono abrir (ou ao recarregar).');
  }

  if (!withModel.length) return <p className="hint">Nenhum Companion com modelo 3D ainda. Envie o .GLB na aba Companions (Fábrica).</p>;
  const slot = COMPANION_ANIM_SLOTS.find((s) => s.key === sel)!;
  const missingIdle = !pick('idle');

  return (
    <div className="anim-grid">
      <aside className="anim-side">
        <label>Companion
          <select disabled={rtBusy || busy} value={job?.companionId ?? ''} onChange={(e) => setCid(e.target.value)}>
            {withModel.map((j) => <option key={j.companionId} value={j.companionId}>{j.name}</option>)}
          </select>
        </label>
        <small>{clips.length} animações em {new Set(clips.map((c) => c.file)).size} arquivo(s).</small>
        <div className="model-box m2m-box">
          <strong>Animações padrão (Mesh2Motion)</strong>
          <small>As mesmas animações para todos os Companions, convertidas para o esqueleto deste modelo. As animações que vieram no .GLB continuam na lista, mas não são usadas nos papéis trocados.</small>
          <div className="row">
            <button className="primary" disabled={!gltf || rtBusy} onClick={() => void openStandard(true)}>{rtBusy ? 'Convertendo…' : 'Aplicar o pacote padrão'}</button>
            {!rt && <button className="link" disabled={!gltf || rtBusy} onClick={() => void openStandard(false)}>só abrir a biblioteca</button>}
          </div>
          {rtNote && <small role="status">{rtNote}</small>}
        </div>
        {missingIdle && clips.length > 0 && <p className="hint warn">Sem "Parado": no jogo ele fica com o primeiro quadro do andar. Escolha um clipe para Parado.</p>}
        <ul className="anim-map slots">
          {COMPANION_ANIM_SLOTS.map((s) => {
            const p = pick(s.key), val = map[s.key] ?? '';
            return (
              <li key={s.key} className={sel === s.key ? 'on' : ''}>
                <button className="slot-name" onClick={() => { setSel(s.key); setMode('slot'); }}><b>{s.label}</b><small>{s.hint}</small></button>
                <select value={val} onChange={(e) => { setMap({ ...map, [s.key]: e.target.value }); setSel(s.key); setMode('slot'); }} aria-label={'Clipe para ' + s.label}>
                  <option value="">{(() => { const a = autoClip(clips, s.key); return a ? `automático: ${a.clip.name}` : 'automático: nenhum'; })()}</option>
                  {clips.map((c) => <option key={c.file + '|' + c.clip.name} value={animRef(c.file, c.clip.name)}>{c.file === 'corpo' ? '' : c.file.startsWith(STANDARD_PREFIX) ? 'padrão · ' : c.file.replace(/\.glb$/i, '') + ' · '}{c.clip.name}</option>)}
                  {rt && <optgroup label="Biblioteca Mesh2Motion">{rt.names.map((n) => <option key={'m2m|' + n} value={animRef(STANDARD_VIRTUAL, n)}>{n}</option>)}</optgroup>}
                  {!rt && val && isStd(val)?.file === STANDARD_VIRTUAL && <option value={val}>{isStd(val)!.clip}</option>}
                </select>
                <span className={'slot-state' + (p ? ' ok' : '')} aria-label={p ? 'tem animação' : 'sem animação'}>{p ? '●' : '○'}</span>
              </li>
            );
          })}
        </ul>
        <div className="row">
          <button className="primary" disabled={!dirty || busy || rtBusy} onClick={() => void save()}>Salvar animações</button>
          {dirty && <button className="link" onClick={() => setMap(saved)}>desfazer</button>}
        </div>
        {note && <small>{note}</small>}
        <div className="model-box">
          <strong>Adicionar animação</strong>
          <small>Outros .GLB do mesmo rig (o tipo vem do nome do arquivo; depois é só escolher o papel aqui).</small>
          <input ref={files} type="file" accept=".glb" multiple disabled={busy || !job} onChange={(e) => { const f = [...(e.target.files ?? [])]; if (job && f.length) void onUploadAnims(job, f).then(() => { if (files.current) files.current.value = ''; }); }} />
        </div>
      </aside>
      <section className="anim-stage">
        <div className="anim-modes" role="group" aria-label="Campo de treino">
          {([['slot', 'Papel escolhido'], ['idle', 'Parado'], ['walk', 'Andar em círculo'], ['run', 'Correr em círculo'], ['sim', 'Simular o jogo']] as [Mode, string][]).map(([m, l]) => <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{l}</button>)}
        </div>
        <div className="anim-canvas">
          {gltf ? (
            <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 2.6, 5.2], fov: 38 }}>
              <Field />
              <Suspense fallback={null}><Performer gltf={gltf} pick={pick} slot={slot} mode={mode} /></Suspense>
              <OrbitControls target={[0, 0.5, 0]} enablePan={false} minDistance={2} maxDistance={10} />
            </Canvas>
          ) : <p className="hint">Carregando o modelo…</p>}
        </div>
        <small>{mode === 'slot' ? `${slot.label}: ${pick(slot.key)?.clip.name ?? 'sem animação (no jogo fica parado ou usa o automático)'}` : mode === 'sim' ? 'Simulação: parado → ocioso → anda → corre → golpe → coleta → parado' : 'Arraste para girar a câmera.'}</small>
      </section>
    </div>
  );
}

/** Chão do campo de treino com luz e sombra. */
function Field() {
  return (
    <>
      <color attach="background" args={['#bfe3ff']} />
      <fog attach="fog" args={['#bfe3ff', 9, 22]} />
      <hemisphereLight args={['#fff6e0', '#4f7d3a', 1.1]} />
      <directionalLight position={[3, 6, 4]} intensity={2} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-4} shadow-camera-right={4} shadow-camera-top={4} shadow-camera-bottom={-4} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><circleGeometry args={[6, 48]} /><meshStandardMaterial color="#86c35b" roughness={0.95} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}><ringGeometry args={[1.95, 2.05, 64]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.35} /></mesh>
    </>
  );
}

/** O Companion no campo: toca o papel escolhido (andando/correndo em círculo quando é locomoção) ou simula o jogo. */
function Performer({ gltf, pick, slot, mode }: { gltf: GLTF; pick: (k: string) => Clip | null; slot: AnimSlot; mode: Mode }) {
  const { root, scale, mixer } = useMemo(() => {
    const m = cloneSkinned(gltf.scene);
    sanitizeSkins(m);
    m.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    const box = restBox(m), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    m.position.set(-c.x, -box.min.y, -c.z);
    const orient = new THREE.Group(); orient.rotation.y = -facingYaw(m); orient.add(m);
    const root = new THREE.Group(); root.add(orient);
    return { root, scale: 1 / Math.max(0.05, size.y), mixer: new THREE.AnimationMixer(m) };
  }, [gltf]);
  useEffect(() => () => { mixer.stopAllAction(); }, [mixer]);
  const st = useRef({ cur: null as THREE.AnimationAction | null, curKey: '', t: 0, ang: 0, step: 0, stepT: 0 });
  const play = (key: string, loop: boolean, rate = 1) => {
    const s = st.current;
    // como no jogo: sem correr usa o andar (e vice-versa); sem parado, o primeiro quadro do andar
    const c = pick(key) ?? (key === 'run' ? pick('walk') : key === 'walk' ? pick('run') : key === 'idle' ? pick('walk') ?? pick('run') : null);
    const id = key + '|' + (c ? c.file + c.clip.name : 'none');
    if (s.curKey === id && s.cur?.isScheduled()) return s.cur;
    s.cur?.fadeOut(0.2);
    if (!c) { s.cur = null; s.curKey = id; return null; }
    const a = mixer.clipAction(c.clip);
    a.reset(); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = !loop;
    a.timeScale = key === 'idle' && !pick('idle') ? 0 : rate; a.fadeIn(0.2).play();
    s.cur = a; s.curKey = id;
    return a;
  };
  useEffect(() => { st.current.curKey = ''; st.current.t = 0; st.current.step = 0; st.current.stepT = 0; }, [mode, slot.key, pick]);
  const SIM: { key: string; dur: number; move?: 'walk' | 'run' }[] = [
    { key: 'idle', dur: 2 }, { key: 'fidget', dur: 2.5 }, { key: 'walk', dur: 3.5, move: 'walk' }, { key: 'run', dur: 3.5, move: 'run' },
    { key: 'attack', dur: 1.4 }, { key: 'attack:espada', dur: 1.4 }, { key: gatherSlot('madeira'), dur: 2.4 }, { key: 'happy', dur: 2.2 }, { key: 'idle', dur: 1.5 },
  ];
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05), s = st.current;
    s.t += dt;
    let key = slot.key, move: 'walk' | 'run' | null = null, loop = slot.loop;
    if (mode === 'idle') { key = 'idle'; loop = true; }
    else if (mode === 'walk' || mode === 'run') { key = mode; move = mode; loop = true; }
    else if (mode === 'sim') {
      s.stepT += dt;
      let cur = SIM[s.step % SIM.length];
      if (s.stepT > cur.dur) { s.step++; s.stepT = 0; cur = SIM[s.step % SIM.length]; s.curKey = ''; }
      key = cur.key; move = cur.move ?? null; loop = !!cur.move || key === 'idle';
    } else {
      if (slot.preview === 'walk' || slot.preview === 'run') move = slot.preview;
      // golpes e gestos: repete a cada ~2 s
      if (!slot.loop && s.t > Math.max(1.6, (pick(key)?.clip.duration ?? 1) + 0.6)) { s.t = 0; s.curKey = ''; }
    }
    const clip = pick(key);
    // velocidade do círculo casada com o passo da animação (sem patinar)
    const speed = move ? Math.max(0.5, (clip?.stride ?? 0) * scale || (move === 'run' ? 2.2 : 1)) : 0;
    play(key, loop);
    if (move) {
      const R = 2;
      s.ang += (speed / R) * dt;
      root.position.set(Math.cos(s.ang) * R, 0, Math.sin(s.ang) * R);
      root.rotation.y = -s.ang; // tangente ao círculo
    } else { root.position.set(0, 0, 0); root.rotation.y = Math.sin(s.t * 0.3) * 0.35; }
    mixer.update(dt);
  });
  return <group scale={scale}><primitive object={root} /></group>;
}

// ---------------------------------------------------------------------------------------------------------------
// Monstros

function CreatureAnims() {
  const cat = useCatalog<CreatureDef>('creatures', sanitizeCreature);
  const list = (cat.rows ?? []).filter((r) => r.data.model);
  const [slug, setSlug] = useState<string | null>(null);
  const row = list.find((r) => r.slug === slug) ?? list[0] ?? null;
  const [map, setMap] = useState<Record<string, string>>({});
  const [clips, setClips] = useState<{ file: string; name: string }[]>([]);
  const [sel, setSel] = useState<CreatureAct>('idle');
  const [move, setMove] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!row) return;
    setMap(row.data.animMap ?? {}); setNote(null);
    let alive = true;
    (async () => {
      const m = row.data.model!;
      const out: { file: string; name: string }[] = [];
      const g = await loadOnce(m.url); g.animations.forEach((c) => out.push({ file: 'corpo', name: c.name }));
      for (const a of m.anims) { if (a.url === m.url) continue; try { (await loadOnce(a.url)).animations.forEach((c) => out.push({ file: a.name, name: c.name })); } catch { /* sem essa */ } }
      if (alive) setClips(out);
    })().catch(() => alive && setClips([]));
    return () => { alive = false; };
  }, [row?.slug, row?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  if (cat.rows === null) return <p className="hint">Carregando o catálogo…</p>;
  if (!list.length) return <div className="anim-side"><M2mGuide open /><p className="hint">Nenhum monstro com modelo .GLB ainda. No Invocador, envie o modelo; criaturas sem modelo usam o slime (todo por código).</p></div>;
  const def: CreatureDef | null = row ? { ...row.data, animMap: Object.fromEntries(Object.entries(map).filter(([, v]) => v)) } : null;
  const saved = row?.data.animMap ?? {};
  const clean = (o: Record<string, string>) => JSON.stringify(Object.fromEntries(Object.entries(o).filter(([, v]) => v).sort()));
  const dirty = clean(map) !== clean(saved);
  async function save() {
    if (!row || !def) return;
    try { await cat.save(def, row.status); setNote('Salvo. Vale para todo mundo na próxima vez que o mundo carregar.'); } catch (e) { setNote((e as Error).message); }
  }
  return (
    <div className="anim-grid">
      <aside className="anim-side">
        <M2mGuide open={!list.some((r) => (r.data.model?.anims.length ?? 0) > 0)} />
        <label>Monstro
          <select value={row?.slug ?? ''} onChange={(e) => setSlug(e.target.value)}>
            {list.map((r) => <option key={r.slug} value={r.slug}>{r.name}{r.status === 'draft' ? ' (rascunho)' : ''}</option>)}
          </select>
        </label>
        <small>{clips.length} animações no modelo. "Movimento por código" usa o jeito "{row?.data.motion ?? 'auto'}" do Invocador (pulinhos, ginga, voo, serpentear).</small>
        <ul className="anim-map slots">
          {CREATURE_ANIM_SLOTS.map((s) => (
            <li key={s.key} className={sel === s.key ? 'on' : ''}>
              <button className="slot-name" onClick={() => setSel(s.key as CreatureAct)}><b>{s.label}</b><small>{s.hint}</small></button>
              <select value={map[s.key] ?? ''} onChange={(e) => { setMap({ ...map, [s.key]: e.target.value }); setSel(s.key as CreatureAct); }} aria-label={'Animação para ' + s.label}>
                <option value="">automático (pelo nome; sem clipe, por código)</option>
                <option value="procedural">movimento por código</option>
                {clips.map((c) => <option key={c.file + '|' + c.name} value={animRef(c.file, c.name)}>{c.file === 'corpo' ? '' : c.file.replace(/\.glb$/i, '') + ' · '}{c.name}</option>)}
              </select>
            </li>
          ))}
        </ul>
        <div className="row">
          <button className="primary" disabled={!dirty} onClick={() => void save()}>Salvar animações</button>
          {dirty && <button className="link" onClick={() => setMap(saved)}>desfazer</button>}
        </div>
        {note && <small>{note}</small>}
        <small className="hint">Para enviar mais animações deste monstro, use o Invocador (seção do modelo).</small>
      </aside>
      <section className="anim-stage">
        <div className="anim-modes" role="group" aria-label="Campo de treino">
          <label className="check"><input type="checkbox" checked={move} onChange={(e) => setMove(e.target.checked)} /> andar em círculo em "Andando" e "Correndo"</label>
        </div>
        <div className="anim-canvas">
          {def && (
            <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 2.6, 5.2], fov: 38 }}>
              <Field />
              <Suspense fallback={null}><CreatureRunner def={def} act={sel} move={move} /></Suspense>
              <OrbitControls target={[0, 0.5, 0]} enablePan={false} minDistance={2} maxDistance={12} />
            </Canvas>
          )}
        </div>
        <small>{CREATURE_ANIM_SLOTS.find((s) => s.key === sel)?.label}: {map[sel] === 'procedural' ? 'movimento por código' : parseAnimRef(map[sel]) && parseAnimRef(map[sel]) !== 'procedural' ? (parseAnimRef(map[sel]) as { clip: string }).clip : 'automático'}</small>
      </section>
    </div>
  );
}

/** Passo a passo para animar um monstro no editor do Mesh2Motion (aparece mesmo sem nenhum monstro com modelo). */
function M2mGuide({ open }: { open: boolean }) {
  return (
    <details className="model-box m2m-box" open={open}>
    <summary><strong>Animar um monstro com o Mesh2Motion</strong></summary>
    <ol className="m2m-steps">
      <li>Exporte o monstro do Tripo <b>só o modelo, sem rig</b>, e envie no Invocador.</li>
      <li>No Invocador, toque em <b>Fazer o rig aqui</b>: escolha o esqueleto (quadrúpede, aranha, dragão, pássaro, cobra, tubarão ou kaiju) e encaixe as juntas no corpo.</li>
      <li>Marque as animações (parado, andar, correr, ataque ou mordida, dano, morte, dormir) e <b>Download</b>: o modelo volta sozinho para o Invocador. Salve o monstro.</li>
      <li>Aqui, os papéis se preenchem pelos nomes; ajuste o que quiser e salve.</li>
    </ol>
    <small>Editor do Mesh2Motion (código aberto MIT, animações CC0), dentro do nosso site.</small>
  </details>
  );
}

function CreatureRunner({ def, act, move }: { def: CreatureDef; act: CreatureAct; move: boolean }) {
  const g = useRef<THREE.Group>(null);
  const ang = useRef(0);
  useFrame((_, dt) => {
    const grp = g.current; if (!grp) return;
    const moving = move && (act === 'walk' || act === 'run');
    if (moving) {
      const R = 2, sp = def.speed * (act === 'run' ? 1.6 : 1);
      ang.current += (sp / R) * Math.min(dt, 0.05);
      grp.position.set(Math.cos(ang.current) * R, 0, Math.sin(ang.current) * R); grp.rotation.y = -ang.current;
    } else { grp.position.set(0, 0, 0); grp.rotation.y = 0.4; }
  });
  // o tamanho do monstro no campo fica entre 0,8 e 1,6 m para caber na tela
  const k = Math.min(1.6, Math.max(0.8, def.size)) / def.size;
  return <group ref={g}><group scale={k}><CreatureBody def={def} act={act} /></group></group>;
}
