/**
 * O Administrador → Companions: as habilidades que este Companion pode ter (a árvore da classe e da essência) e,
 * para cada uma (e para o ataque básico), a animação do modelo 3D que o jogo deve tocar. Prévia ao lado.
 * Grava em companion_skill_anims: { slug | "__basic": "clip:<nome do clipe>" | "kind:<tipo>" }.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ANIM_KINDS, DEFAULT_SKILLS, SHAPES, buildSkillTree, sanitizeSkill, type IdentityContractV1, type SkillDef } from '@rules';
import { supabase } from '../backend/online';
import { restBox, facingYaw } from '../scene/CompanionModel';

const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const KIND_LABEL = Object.fromEntries(ANIM_KINDS.map((k) => [k.kind, k.label]));

export function SkillAnimPicker({ companionId, contract, modelUrl, anims }: { companionId: string; contract: IdentityContractV1; modelUrl?: string; anims: { kind: string; name: string }[] }) {
  const [catalog, setCatalog] = useState<SkillDef[]>(DEFAULT_SKILLS);
  const [gltf, setGltf] = useState<GLTF | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    supabase().from('skills').select('slug,name,data').eq('status', 'published').then(({ data }) => {
      const list = (data ?? []).map((r) => sanitizeSkill({ ...(r.data as object), slug: r.slug, name: r.name })).filter((x): x is SkillDef => !!x);
      if (alive && list.length) setCatalog(list);
    }, () => {});
    supabase().from('companion_skill_anims').select('anims').eq('companion_id', companionId).maybeSingle().then(({ data }) => {
      if (!alive) return; const m = (data?.anims ?? {}) as Record<string, string>; setMap(m); setSaved(m);
    }, () => {});
    if (modelUrl) loader.loadAsync(modelUrl).then((g) => alive && setGltf(g), () => alive && setNote('Não consegui abrir o modelo para listar as animações.'));
    return () => { alive = false; };
  }, [open, companionId, modelUrl]);

  const skills = useMemo(() => {
    const tree = buildSkillTree(catalog, { essence: contract.element.key, species: contract.species.family });
    const out: SkillDef[] = [];
    for (const n of tree.nodes) if (n.kind === 'skill' && n.skill) { const s = catalog.find((x) => x.slug === n.skill) ?? tree.extra.find((x) => x.slug === n.skill); if (s && !out.includes(s)) out.push(s); }
    return out;
  }, [catalog, contract]);

  const clips = gltf?.animations.map((a) => a.name) ?? [];
  const options = [
    ...clips.map((n) => ({ v: 'clip:' + n, label: n.replace(/\.\d+$/, '') })),
    ...anims.filter((a) => a.kind !== 'special').map((a) => ({ v: 'kind:' + a.kind, label: `${KIND_LABEL[a.kind] ?? a.kind} (arquivo ${a.name})` })),
  ];
  const auto = (s: SkillDef | null) => (s ? `automático: ${KIND_LABEL[s.anim] ?? s.anim}${s.anim === 'attack' && s.shape !== 'melee' ? ' (ou lançando magia)' : ''}` : 'automático: golpe da arma');
  const rows: { key: string; title: string; sub: string; skill: SkillDef | null }[] = [
    { key: '__basic', title: 'Ataque básico', sub: 'sem arma (com arma, vale o golpe da arma)', skill: null },
    ...skills.map((s) => ({ key: s.slug, title: s.name, sub: `${SHAPES[s.shape]}${s.essence ? '' : ' · da classe'}`, skill: s })),
  ];
  const dirty = JSON.stringify(map) !== JSON.stringify(saved);

  async function save() {
    setNote(null);
    const uid = (await supabase().auth.getUser()).data.user?.id;
    const clean = Object.fromEntries(Object.entries(map).filter(([, v]) => v));
    const r = await supabase().from('companion_skill_anims').upsert({ companion_id: companionId, anims: clean, updated_at: new Date().toISOString(), updated_by: uid });
    if (r.error) { setNote('Não deu para salvar: ' + r.error.message); return; }
    setSaved(clean); setMap(clean); setNote('Salvo. Vale na próxima vez que o jogo abrir.');
  }

  return (
    <div className="model-box skill-anims">
      <button className="link" onClick={() => setOpen(!open)} aria-expanded={open}><strong>Habilidades e animações {open ? '▾' : '▸'}</strong></button>
      {open && (
        <>
          <small>As habilidades que este Companion pode abrir ({contract.species.family} · {contract.element.label}) e a animação de cada uma. Toque em "ver" para conferir na prévia.</small>
          {!modelUrl && <small className="why">Sem modelo 3D ainda: envie o .GLB para escolher pelas animações dele.</small>}
          {preview && gltf && (
            <div className="anim-preview">
              <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0.9, 2.6], fov: 35 }} onCreated={({ camera }) => camera.lookAt(0, 0.55, 0)}>
                <color attach="background" args={['#cfe9ff']} />
                <hemisphereLight args={['#ffffff', '#5aa84c', 1.5]} />
                <directionalLight position={[2, 4, 3]} intensity={1.5} />
                <mesh rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[1.6, 32]} /><meshLambertMaterial color="#8fcf60" /></mesh>
                <Suspense fallback={null}><ClipPlayer gltf={gltf} clip={preview} /></Suspense>
              </Canvas>
              <small>{preview.replace(/\.\d+$/, '')}</small>
            </div>
          )}
          <ul className="anim-map">
            {rows.map((r) => {
              const val = map[r.key] ?? '';
              const clipName = val.startsWith('clip:') ? val.slice(5) : null;
              return (
                <li key={r.key}>
                  <span><b>{r.title}</b><small>{r.sub}</small></span>
                  <select value={val} onChange={(e) => setMap({ ...map, [r.key]: e.target.value })} aria-label={'Animação de ' + r.title}>
                    <option value="">{auto(r.skill)}</option>
                    {options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                  </select>
                  <button className="link" disabled={!clipName || !gltf} onClick={() => setPreview(clipName)}>ver</button>
                </li>
              );
            })}
          </ul>
          {clips.length > 0 && (
            <details><summary>Todas as animações do modelo ({clips.length})</summary>
              <div className="chips">{clips.map((c) => <button key={c} type="button" className={'chip' + (preview === c ? ' on' : '')} onClick={() => setPreview(c)}>{c.replace(/\.\d+$/, '')}</button>)}</div>
            </details>
          )}
          <div className="row">
            <button className="primary" disabled={!dirty} onClick={() => void save()}>Salvar animações</button>
            {dirty && <button className="link" onClick={() => setMap(saved)}>desfazer</button>}
          </div>
          {note && <small>{note}</small>}
        </>
      )}
    </div>
  );
}

function ClipPlayer({ gltf, clip }: { gltf: GLTF; clip: string }) {
  const { model, scale } = useMemo(() => {
    const m = cloneSkinned(gltf.scene);
    const box = restBox(m), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    m.position.set(-c.x, -box.min.y, -c.z);
    const g = new THREE.Group(); g.rotation.y = -facingYaw(m); g.add(m);
    return { model: g, scale: 1 / Math.max(0.05, size.y) };
  }, [gltf]);
  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model]);
  const t = useRef(0);
  useEffect(() => {
    const c = gltf.animations.find((a) => a.name === clip);
    mixer.stopAllAction();
    if (c) mixer.clipAction(c).reset().play();
    t.current = 0;
  }, [clip, gltf, mixer]);
  useFrame((_, dt) => { mixer.update(Math.min(dt, 0.05)); model.rotation.y = Math.sin((t.current += dt) * 0.4) * 0.5; });
  return <group scale={scale}><primitive object={model} /></group>;
}
