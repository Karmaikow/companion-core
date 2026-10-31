/**
 * Estúdio da Cidade — O Administrador → Cidade (/#/admin/cidade). Monta Áster à mão:
 * - biblioteca com os .GLB enviados (bucket world-assets, pasta city/aster) e o envio de novos;
 * - vista 3D livre (arrastar gira, botão direito move, roda aproxima) com grade; setas para mover, girar e escalar
 *   (W/E/R), encaixe de 0,5 m e 15°, desfazer (Ctrl+Z), duplicar (Ctrl+D) e apagar (Delete);
 * - marcadores do jogo (portões, chegada, lojas, forja, bar, guilda, escolas, NPCs);
 * - cada peça aparece na cidade normal, na destruída ou nas duas, com prévia de cada estado;
 * - aba "Vista de fora": o modelo grande da cidade nos Arredores, para encaixar a muralha no anel dourado.
 * O jogo lê o layout publicado da tabela city_layouts (shared/rules/aster.ts → sanitizeCityLayout).
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Clone, Grid, OrbitControls, TransformControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import {
  CITY_MARKERS, CITY_R, CITY_SHOW, DEFAULT_CITY_LAYOUT, GATES, GATE_IDS, OUT_WALL_R, sanitizeCityLayout, visibleIn,
  type BiomePalette, type CityLayout, type CityMarker, type CityMarkerKind, type CityPiece, type CityShow, type CityState, type GateId,
} from '@rules';
import { SCHOOL_IDS, SCHOOL_DEFINITIONS } from '../../../shared/rules/combat/schools';
import { supabase } from '../backend/online';
import { AssetBoundary, Sky } from '../scene/Biome';
import { CityGround, InnerWall, MarkerView, OutskirtsView } from '../scene/AsterScene';

const SLUG = 'aster', FOLDER = 'city/aster';
type Sel = { kind: 'piece' | 'marker'; id: string } | null;
type Mode = 'translate' | 'rotate' | 'scale';
interface LibItem { name: string; url: string }
const PALETTE: BiomePalette = { grassLight: '#b8b09c', grassDark: '#8f8a7e', dirt: '#6b5f50', dirtDark: '#4a4239', rockSide: '#7d7a72', rockTop: '#a5a196', rockBottom: '#5d5a53', sky: '#f6d4a2', fog: '#ebcfa6', skyNight: '#262a52', fogNight: '#363a66' };
const deg = (r: number) => Math.round((r * 180) / Math.PI);
const rad = (d: number) => (d * Math.PI) / 180;
const r2 = (v: number) => Math.round(v * 100) / 100;
const newId = (base: string) => base.normalize('NFD').replace(/[^\w-]+/g, '-').toLowerCase().slice(0, 30) + '-' + Date.now().toString(36) + Math.floor(Math.random() * 1e3).toString(36);
const nameOf = (url: string) => decodeURIComponent(url.split('/').pop() ?? 'modelo').replace(/^\d+-/, '').replace(/\.glb$/i, '');

// ---------------------------------------------------------------------------
// 3D
// ---------------------------------------------------------------------------

/** Guarda o ponto para onde a câmera olha (peças e marcadores novos nascem ali). */
function TargetTracker({ target }: { target: React.MutableRefObject<THREE.Vector3> }) {
  const controls = useThree((s) => s.controls) as unknown as { target?: THREE.Vector3 } | null;
  useFrame(() => { if (controls?.target) target.current.copy(controls.target); });
  return null;
}

function PieceModel({ url, onBox }: { url: string; onBox: (b: THREE.Box3) => void }) {
  const { scene } = useGLTF(url);
  useEffect(() => { onBox(new THREE.Box3().setFromObject(scene)); }, [scene]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Clone object={scene} castShadow receiveShadow />;
}

function EditablePiece({ p, selected, ghost, register, onSelect, onBox, box }: {
  p: CityPiece; selected: boolean; ghost: boolean; box?: THREE.Box3;
  register: (id: string, o: THREE.Object3D | null) => void; onSelect: (id: string) => void; onBox: (url: string, b: THREE.Box3) => void;
}) {
  const click = (e: ThreeEvent<MouseEvent>) => { if (e.delta > 4) return; e.stopPropagation(); onSelect(p.id); };
  const size = box ? box.getSize(new THREE.Vector3()) : null, center = box ? box.getCenter(new THREE.Vector3()) : null;
  return (
    <group ref={(o) => register(p.id, o)} position={[p.x, p.y, p.z]} rotation={[0, p.rot, 0]} scale={p.scale} onClick={click} visible={!ghost || selected}>
      <AssetBoundary><Suspense fallback={<mesh position={[0, 0.5, 0]}><boxGeometry /><meshBasicMaterial color="#8aa0d8" wireframe /></mesh>}><PieceModel url={p.url} onBox={(b) => onBox(p.url, b)} /></Suspense></AssetBoundary>
      {selected && size && center && (
        <mesh position={center}><boxGeometry args={[size.x, size.y, size.z]} /><meshBasicMaterial color={ghost ? '#ff8f7a' : '#ffd98a'} wireframe transparent opacity={0.8} /></mesh>
      )}
      {p.solid > 0 && (selected || ghost) && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} scale={1 / p.scale}><ringGeometry args={[p.solid - 0.08, p.solid, 48]} /><meshBasicMaterial color="#ff8f7a" transparent opacity={0.85} /></mesh>
      )}
    </group>
  );
}

function EditableMarker({ m, selected, dead, register, onSelect }: { m: CityMarker; selected: boolean; dead: boolean; register: (id: string, o: THREE.Object3D | null) => void; onSelect: (id: string) => void }) {
  const info = CITY_MARKERS[m.kind];
  const click = (e: ThreeEvent<MouseEvent>) => { if (e.delta > 4) return; e.stopPropagation(); onSelect(m.id); };
  return (
    <>
      {/* o desenho do jogo (portal, cristal, placa) fica no lugar salvo; o pino é o que se arrasta */}
      <MarkerView m={m} dead={dead} labels={false} />
      <group ref={(o) => register(m.id, o)} position={[m.x, 0, m.z]} rotation={[0, m.rot, 0]} onClick={click}>
        <mesh position={[0, 1.2, 0]}><cylinderGeometry args={[0.18, 0.18, 2.4, 8]} /><meshBasicMaterial color={selected ? '#ffd98a' : info.color} /></mesh>
        <mesh position={[0, 2.7, 0]}><octahedronGeometry args={[0.5, 0]} /><meshBasicMaterial color={selected ? '#ffd98a' : info.color} /></mesh>
        <mesh position={[0, 0.6, 0.9]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.25, 0.7, 8]} /><meshBasicMaterial color={info.color} /></mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}><ringGeometry args={[1.1, 1.35, 32]} /><meshBasicMaterial color={selected ? '#ffd98a' : info.color} transparent opacity={0.7} /></mesh>
      </group>
    </>
  );
}

/** Anel de referência no chão (até onde se anda; onde a muralha de fora deve tocar). */
function GuideRing({ r, color }: { r: number; color: string }) {
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}><ringGeometry args={[r - 0.25, r + 0.25, 128]} /><meshBasicMaterial color={color} transparent opacity={0.75} depthWrite={false} /></mesh>;
}

// ---------------------------------------------------------------------------
// Estúdio
// ---------------------------------------------------------------------------

export function CityStudio() {
  const [layout, setLayout] = useState<CityLayout | null>(null);
  const [saved, setSaved] = useState('');
  const [status, setStatus] = useState<'draft' | 'published' | 'novo'>('novo');
  const [view, setView] = useState<'cidade' | 'fora'>('cidade');
  const [state, setState] = useState<CityState>('normal');
  const [sel, setSel] = useState<Sel>(null);
  const [mode, setMode] = useState<Mode>('translate');
  const [snap, setSnap] = useState(true);
  const [lib, setLib] = useState<LibItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState('');
  const history = useRef<CityLayout[]>([]), future = useRef<CityLayout[]>([]);
  const objs = useRef(new Map<string, THREE.Object3D>());
  const [selObj, setSelObj] = useState<THREE.Object3D | null>(null);
  const boxes = useRef(new Map<string, THREE.Box3>());
  const [, bump] = useState(0);
  const target = useRef(new THREE.Vector3());

  // ---- carregar
  const loadLib = useCallback(async () => {
    const { data } = await supabase().storage.from('world-assets').list(FOLDER, { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } });
    setLib((data ?? []).filter((f) => /\.glb$/i.test(f.name)).map((f) => ({ name: nameOf(f.name), url: supabase().storage.from('world-assets').getPublicUrl(`${FOLDER}/${f.name}`).data.publicUrl })));
  }, []);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase().from('city_layouts').select('data,status').eq('slug', SLUG).maybeSingle();
        if (error) throw error;
        if (!alive) return;
        const l = data ? sanitizeCityLayout(data.data) : structuredClone(DEFAULT_CITY_LAYOUT);
        setLayout(l); setSaved(JSON.stringify(l)); setStatus(data ? (data.status as 'draft' | 'published') : 'novo');
      } catch (e) {
        if (!alive) return;
        const l = structuredClone(DEFAULT_CITY_LAYOUT);
        setLayout(l); setSaved(JSON.stringify(l));
        setMsg({ text: 'Não consegui ler a cidade salva (' + ((e as Error).message || 'sem acesso') + '). Começando da cidade vazia.' });
      }
      try { await loadLib(); } catch { /* sem biblioteca */ }
    })();
    return () => { alive = false; };
  }, [loadLib]);

  // ---- editar (com desfazer)
  const commit = useCallback((fn: (l: CityLayout) => CityLayout) => {
    setLayout((cur) => {
      if (!cur) return cur;
      history.current.push(cur); if (history.current.length > 80) history.current.shift();
      future.current = [];
      return fn(cur);
    });
  }, []);
  const undo = () => setLayout((cur) => { const prev = history.current.pop(); if (!prev || !cur) return cur; future.current.push(cur); return prev; });
  const redo = () => setLayout((cur) => { const next = future.current.pop(); if (!next || !cur) return cur; history.current.push(cur); return next; });
  const patchPiece = (id: string, p: Partial<CityPiece>) => commit((l) => ({ ...l, pieces: l.pieces.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  const patchMarker = (id: string, p: Partial<CityMarker>) => commit((l) => ({ ...l, markers: l.markers.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  const at = () => ({ x: r2(target.current.x), z: r2(target.current.z) });

  const addPiece = (item: LibItem) => {
    const p: CityPiece = { id: newId(item.name), name: item.name, url: item.url, ...at(), y: 0, rot: 0, scale: 1, show: 'ambos', solid: 0 };
    commit((l) => ({ ...l, pieces: [...l.pieces, p] })); setSel({ kind: 'piece', id: p.id }); setView('cidade');
  };
  const addMarker = (kind: CityMarkerKind) => {
    const m: CityMarker = { id: newId(kind), kind, name: CITY_MARKERS[kind].label, ...at(), rot: 0, show: 'ambos', ...(kind === 'portao' ? { gate: 'sul' as GateId } : {}), ...(kind === 'escola' ? { school: SCHOOL_IDS[0] } : {}) };
    commit((l) => ({ ...l, markers: [...l.markers, m] })); setSel({ kind: 'marker', id: m.id }); setView('cidade');
  };
  const remove = () => {
    if (!sel || !layout) return;
    if (sel.kind === 'marker') {
      const m = layout.markers.find((x) => x.id === sel.id);
      if (m?.kind === 'portao' && layout.markers.filter((x) => x.kind === 'portao' && x.gate === m.gate).length < 2) { setMsg({ text: `A cidade precisa de uma saída ${GATES[m.gate ?? 'sul'].label}: mova o portão em vez de apagar.` }); return; }
      commit((l) => ({ ...l, markers: l.markers.filter((x) => x.id !== sel.id) }));
    } else commit((l) => ({ ...l, pieces: l.pieces.filter((x) => x.id !== sel.id) }));
    setSel(null);
  };
  const duplicate = () => {
    if (!sel || !layout) return;
    if (sel.kind === 'piece') {
      const p = layout.pieces.find((x) => x.id === sel.id); if (!p) return;
      const c = { ...p, id: newId(p.name), x: r2(p.x + 2), z: r2(p.z + 2) };
      commit((l) => ({ ...l, pieces: [...l.pieces, c] })); setSel({ kind: 'piece', id: c.id });
    } else {
      const m = layout.markers.find((x) => x.id === sel.id); if (!m || m.kind === 'cristal') return;
      const c = { ...m, id: newId(m.kind), x: r2(m.x + 2), z: r2(m.z + 2) };
      commit((l) => ({ ...l, markers: [...l.markers, c] })); setSel({ kind: 'marker', id: c.id });
    }
  };

  // ---- seleção e setas
  const register = useCallback((id: string, o: THREE.Object3D | null) => { if (o) objs.current.set(id, o); else objs.current.delete(id); }, []);
  useEffect(() => {
    // o item pode ter sumido (desfazer, apagar): a seleção e as setas saem junto
    if (sel && layout && !(sel.kind === 'piece' ? layout.pieces : layout.markers).some((x) => x.id === sel.id)) { setSel(null); setSelObj(null); return; }
    const o = sel ? objs.current.get(sel.id) : undefined;
    setSelObj(o && o.parent ? o : null);
  }, [sel, layout, view]);
  const onDragEnd = () => {
    if (!sel || !selObj) return;
    const o = selObj;
    if (sel.kind === 'piece') {
      const s = Math.max(0.01, Math.max(o.scale.x, o.scale.y, o.scale.z));
      patchPiece(sel.id, { x: r2(o.position.x), y: r2(o.position.y), z: r2(o.position.z), rot: o.rotation.y, scale: r2(s) });
    } else patchMarker(sel.id, { x: r2(o.position.x), z: r2(o.position.z), rot: o.rotation.y });
  };

  // ---- teclado
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, select, textarea')) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); duplicate(); return; }
      if (k === 'delete' || k === 'backspace') { if (sel) { e.preventDefault(); remove(); } return; }
      if (k === 'escape') setSel(null);
      if (k === 'w') setMode('translate'); if (k === 'e') setMode('rotate'); if (k === 'r') setMode('scale');
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  // ---- arquivos
  async function upload(files: File[], asExterior = false) {
    const glbs = files.filter((f) => /\.glb$/i.test(f.name));
    if (!glbs.length) { setMsg({ text: 'Envie modelos em .GLB.' }); return; }
    setBusy(true); setMsg(null);
    const heavy: string[] = [], added: LibItem[] = [];
    try {
      for (const f of glbs) {
        const safe = f.name.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[^\w-]+/g, '_').slice(0, 40);
        const path = `${FOLDER}/${Date.now()}-${safe}.glb`;
        // o navegador não informa tipo para .glb; sem isso o bucket recusa
        const { error } = await supabase().storage.from('world-assets').upload(path, new Blob([f], { type: 'model/gltf-binary' }), { contentType: 'model/gltf-binary', upsert: false });
        if (error) throw new Error(`${f.name}: ${error.message}`);
        added.push({ name: safe, url: supabase().storage.from('world-assets').getPublicUrl(path).data.publicUrl });
        if (f.size > (asExterior ? 12 : 3) * 1024 * 1024) heavy.push(`${f.name} (${(f.size / 1048576).toFixed(1)} MB)`);
      }
      setLib((cur) => [...added, ...cur]);
      if (asExterior && added[0]) commit((l) => ({ ...l, exterior: { ...l.exterior, url: added[0].url } }));
      setMsg({ ok: !heavy.length, text: `${added.length} modelo(s) enviados.` + (asExterior ? ' Agora ajuste a escala até a muralha tocar o anel dourado.' : ' Clique num modelo da biblioteca para pôr na cidade.') + (heavy.length ? ` Pesados: ${heavy.join(', ')} — me mande que eu otimizo (texturas 1024 + compressão).` : '') });
    } catch (e) { setMsg({ text: 'Falha no envio: ' + (e as Error).message }); } finally { setBusy(false); }
  }

  async function save(publish?: boolean) {
    if (!layout) return;
    setBusy(true); setMsg(null);
    const clean = sanitizeCityLayout(layout);
    const next = publish ? 'published' : status === 'novo' ? 'draft' : status;
    const { error } = await supabase().from('city_layouts').upsert({ slug: SLUG, name: clean.name, data: clean, status: next, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) { setMsg({ text: 'Não salvou: ' + error.message }); return; }
    setLayout(clean); setSaved(JSON.stringify(clean)); setStatus(next);
    setMsg({ ok: true, text: next === 'published' ? 'Publicada: a cidade do jogo já usa este layout (quem entrar em Áster de novo vê).' : 'Rascunho salvo. Publique para valer no jogo.' });
  }
  async function unpublish() {
    setBusy(true);
    const { error } = await supabase().from('city_layouts').update({ status: 'draft', updated_at: new Date().toISOString() }).eq('slug', SLUG);
    setBusy(false);
    if (error) setMsg({ text: error.message }); else { setStatus('draft'); setMsg({ ok: true, text: 'Voltou para rascunho: o jogo usa a cidade provisória.' }); }
  }

  if (!layout) return <p className="empty">Abrindo o Estúdio da Cidade…</p>;
  const dirty = JSON.stringify(layout) !== saved;
  const piece = sel?.kind === 'piece' ? layout.pieces.find((p) => p.id === sel.id) : undefined;
  const marker = sel?.kind === 'marker' ? layout.markers.find((m) => m.id === sel.id) : undefined;
  const used = [...new Set(layout.pieces.map((p) => p.url))].filter((u) => !lib.some((x) => x.url === u)).map((u) => ({ name: nameOf(u), url: u }));
  const library = [...lib, ...used].filter((x) => !filter || x.name.toLowerCase().includes(filter.toLowerCase()));
  const dead = state === 'destruida';
  const autoSolid = () => {
    if (!piece) return;
    const b = boxes.current.get(piece.url); if (!b) { setMsg({ text: 'O modelo ainda está carregando.' }); return; }
    const s = b.getSize(new THREE.Vector3());
    patchPiece(piece.id, { solid: r2((Math.max(s.x, s.z) / 2) * piece.scale * 0.85) });
  };

  return (
    <div className="city-studio">
      <aside className="cs-left biome-form">
        <fieldset>
          <legend>Cidade</legend>
          <label>Nome<input value={layout.name} onChange={(e) => commit((l) => ({ ...l, name: e.target.value }))} /></label>
          <div className="cs-row">
            <span className={'pill ' + (status === 'published' ? 'approved' : 'review')}>{status === 'published' ? 'Publicada' : status === 'draft' ? 'Rascunho' : 'Nova'}</span>
            {dirty && <span className="pill queued">não salvo</span>}
          </div>
          <div className="cs-row">
            <button className="ghost" disabled={busy || !dirty} onClick={() => void save()}>Salvar rascunho</button>
            <button className="primary" disabled={busy} onClick={() => void save(true)}>{status === 'published' ? 'Salvar e publicar' : 'Publicar'}</button>
          </div>
          {status === 'published' && <button className="link" disabled={busy} onClick={() => void unpublish()}>tirar do jogo (voltar para rascunho)</button>}
        </fieldset>

        <fieldset>
          <legend>Biblioteca ({lib.length})</legend>
          <label className="upload">
            <input type="file" accept=".glb,model/gltf-binary" multiple disabled={busy} onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; if (fs.length) void upload(fs); }} />
            <span>+ Enviar .GLB (prédios, muralhas, torres…)</span>
          </label>
          <input placeholder="procurar…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Procurar na biblioteca" />
          <ul className="cs-lib">
            {library.map((m) => <li key={m.url}><button onClick={() => addPiece(m)} title="Pôr na cidade (no centro da vista)">+ {m.name}</button></li>)}
            {!library.length && <li className="hint">Nenhum modelo ainda. Envie os .GLB dos prédios: escala em metros, Y para cima, pivô na base.</li>}
          </ul>
        </fieldset>

        <fieldset>
          <legend>Marcadores</legend>
          <div className="cs-markers">
            {(Object.keys(CITY_MARKERS) as CityMarkerKind[]).filter((k) => k !== 'cristal').map((k) => (
              <button key={k} onClick={() => addMarker(k)} title={`Pôr ${CITY_MARKERS[k].label}`}><span aria-hidden>{CITY_MARKERS[k].icon}</span> {CITY_MARKERS[k].label}</button>
            ))}
          </div>
          <small className="hint">Os marcadores dizem ao jogo onde ficam as lojas, a forja, as escolas, os NPCs e as saídas. Os painéis de cada um entram na fase 4.</small>
        </fieldset>
      </aside>

      <section className="cs-center">
        <div className="cs-toolbar">
          <div className="cs-seg" role="group" aria-label="Vista">
            <button className={view === 'cidade' ? 'on' : ''} onClick={() => setView('cidade')}>Por dentro</button>
            <button className={view === 'fora' ? 'on' : ''} onClick={() => { setView('fora'); setSel(null); }}>Vista de fora (Arredores)</button>
          </div>
          <div className="cs-seg" role="group" aria-label="Estado da cidade">
            <button className={state === 'normal' ? 'on' : ''} onClick={() => setState('normal')}>Normal</button>
            <button className={state === 'destruida' ? 'on dead' : ''} onClick={() => setState('destruida')}>Destruída</button>
          </div>
          {view === 'cidade' && (
            <div className="cs-seg" role="group" aria-label="Ferramenta">
              <button className={mode === 'translate' ? 'on' : ''} onClick={() => setMode('translate')} title="Mover (W)">✥ Mover</button>
              <button className={mode === 'rotate' ? 'on' : ''} onClick={() => setMode('rotate')} title="Girar (E)">⟳ Girar</button>
              <button className={mode === 'scale' ? 'on' : ''} onClick={() => setMode('scale')} disabled={sel?.kind === 'marker'} title="Escalar (R) — a alça do meio escala por igual">⤢ Escalar</button>
            </div>
          )}
          <label className="cs-check"><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Encaixe (0,5 m · 15°)</label>
          <button className="ghost" onClick={undo} disabled={!history.current.length} title="Desfazer (Ctrl+Z)">↶</button>
          <button className="ghost" onClick={redo} disabled={!future.current.length} title="Refazer (Ctrl+Shift+Z)">↷</button>
        </div>
        <div className="cs-canvas">
          {/* cada vista com a sua câmera (a de fora vê os arredores inteiros) */}
          <Canvas key={view} shadows camera={view === 'cidade' ? { position: [0, 70, 95], fov: 40, near: 0.5, far: 3000 } : { position: [0, 190, 330], fov: 40, near: 1, far: 4000 }} onPointerMissed={(e) => { if (e.button === 0) setSel(null); }}
            gl={{ antialias: true }} onCreated={({ gl }) => { gl.toneMapping = THREE.NoToneMapping; }}>
            <Sky daylight={state === 'destruida' ? 0.55 : 1} palette={PALETTE} fogFar={view === 'cidade' ? 900 : 1800} />
            <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.05} minDistance={3} maxDistance={view === 'cidade' ? 400 : 900} />
            <TargetTracker target={target} />
            {view === 'cidade' ? (
              <>
                <CityGround layout={layout} walkable={false} />
                <InnerWall layout={layout} dead={dead} />
                <Grid position={[0, 0.03, 0]} args={[260, 260]} cellSize={1} sectionSize={10} cellColor="#6f6a5f" sectionColor="#3d3a35" fadeDistance={260} infiniteGrid={false} />
                <GuideRing r={CITY_R} color="#9fd8ff" />
                {layout.pieces.map((p) => (
                  <EditablePiece key={p.id} p={p} selected={sel?.id === p.id} ghost={!visibleIn(p.show, state)} register={register} box={boxes.current.get(p.url)}
                    onSelect={(id) => setSel({ kind: 'piece', id })} onBox={(url, b) => { if (!boxes.current.has(url)) { boxes.current.set(url, b); bump((x) => x + 1); } }} />
                ))}
                {layout.markers.filter((m) => visibleIn(m.show, state) || sel?.id === m.id).map((m) => (
                  <EditableMarker key={m.id} m={m} selected={sel?.id === m.id} dead={dead} register={register} onSelect={(id) => setSel({ kind: 'marker', id })} />
                ))}
                {selObj && sel && (
                  <TransformControls object={selObj} mode={sel.kind === 'marker' && mode === 'scale' ? 'translate' : mode} onMouseUp={onDragEnd}
                    translationSnap={snap ? 0.5 : null} rotationSnap={snap ? rad(15) : null} scaleSnap={snap ? 0.1 : null}
                    showX={mode !== 'rotate'} showZ={mode !== 'rotate'} showY={mode === 'rotate' || (mode === 'translate' && sel.kind === 'piece') || mode === 'scale'} />
                )}
              </>
            ) : (
              <>
                <OutskirtsView layout={layout} state={state} high walkable={false} labels={false} />
                <GuideRing r={OUT_WALL_R} color="#ffd98a" />
              </>
            )}
          </Canvas>
          <p className="cs-help">Arraste para girar · botão direito move · roda aproxima · clique numa peça para selecionar · W/E/R mover/girar/escalar · Ctrl+D duplica · Delete apaga · Ctrl+Z desfaz</p>
        </div>
      </section>

      <aside className="cs-right biome-form">
        {msg && <p className={'msg ' + (msg.ok ? 'ok' : 'err')} role="status">{msg.text}</p>}
        {view === 'fora' ? (
          <fieldset key="fora">
            <legend>Cidade vista de fora</legend>
            <small className="hint">Um .GLB grande com a muralha e a silhueta da cidade (sem os interiores). A muralha deve tocar o <b>anel dourado</b> (raio {OUT_WALL_R} m), com os 4 portões nos pontos cardeais. O Cristal Ápice flutua sozinho acima do ponto mais alto. Sem modelo, aparece a muralha provisória.</small>
            <label className="upload">
              <input type="file" accept=".glb,model/gltf-binary" disabled={busy} onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; if (fs.length) void upload(fs, true); }} />
              <span>{layout.exterior.url ? 'Trocar o modelo de fora' : '+ Enviar o modelo de fora'}</span>
            </label>
            {layout.exterior.url && (
              <>
                <small>{nameOf(layout.exterior.url)}</small>
                <label>Escala<input type="number" step={0.1} min={0.01} value={layout.exterior.scale} onChange={(e) => commit((l) => ({ ...l, exterior: { ...l.exterior, scale: Math.max(0.01, Number(e.target.value) || 1) } }))} /></label>
                <label>Giro (graus)<input type="number" step={5} value={deg(layout.exterior.rot)} onChange={(e) => commit((l) => ({ ...l, exterior: { ...l.exterior, rot: rad(Number(e.target.value) || 0) } }))} /></label>
                <label>Altura (m)<input type="number" step={0.5} value={layout.exterior.y} onChange={(e) => commit((l) => ({ ...l, exterior: { ...l.exterior, y: Number(e.target.value) || 0 } }))} /></label>
                <button className="link" onClick={() => commit((l) => ({ ...l, exterior: { url: null, scale: 1, rot: 0, y: 0 } }))}>tirar o modelo (volta a muralha provisória)</button>
              </>
            )}
          </fieldset>
        ) : piece ? (
          <fieldset key={'peca-' + piece.id}>
            <legend>Peça</legend>
            <label>Nome<input value={piece.name} onChange={(e) => patchPiece(piece.id, { name: e.target.value })} /></label>
            <div className="cs-grid3">
              <label>X<input type="number" step={0.5} value={piece.x} onChange={(e) => patchPiece(piece.id, { x: Number(e.target.value) || 0 })} /></label>
              <label>Y<input type="number" step={0.1} value={piece.y} onChange={(e) => patchPiece(piece.id, { y: Number(e.target.value) || 0 })} /></label>
              <label>Z<input type="number" step={0.5} value={piece.z} onChange={(e) => patchPiece(piece.id, { z: Number(e.target.value) || 0 })} /></label>
              <label>Giro°<input type="number" step={15} value={deg(piece.rot)} onChange={(e) => patchPiece(piece.id, { rot: rad(Number(e.target.value) || 0) })} /></label>
              <label>Escala<input type="number" step={0.1} min={0.01} value={piece.scale} onChange={(e) => patchPiece(piece.id, { scale: Math.max(0.01, Number(e.target.value) || 1) })} /></label>
              <label>Colisão (m)<input type="number" step={0.25} min={0} value={piece.solid} onChange={(e) => patchPiece(piece.id, { solid: Math.max(0, Number(e.target.value) || 0) })} /></label>
            </div>
            <div className="cs-row">
              <button className="ghost" onClick={autoSolid} title="Raio de colisão pela base do modelo">Colisão pela base</button>
              <button className="ghost" onClick={() => patchPiece(piece.id, { y: 0 })}>Encostar no chão</button>
            </div>
            <label>Aparece<select value={piece.show} onChange={(e) => patchPiece(piece.id, { show: e.target.value as CityShow })}>{(Object.keys(CITY_SHOW) as CityShow[]).map((k) => <option key={k} value={k}>{CITY_SHOW[k]}</option>)}</select></label>
            <small className="hint">Colisão 0 = dá para atravessar (decoração). Prédios e muralhas: use "Colisão pela base".</small>
            <div className="cs-row">
              <button className="ghost" onClick={duplicate}>Duplicar (Ctrl+D)</button>
              <button className="ghost danger" onClick={remove}>Apagar</button>
            </div>
          </fieldset>
        ) : marker ? (
          <fieldset key={'marcador-' + marker.id}>
            <legend>{CITY_MARKERS[marker.kind].icon} {CITY_MARKERS[marker.kind].label}</legend>
            <label>Nome<input value={marker.name} onChange={(e) => patchMarker(marker.id, { name: e.target.value })} /></label>
            <div className="cs-grid3">
              <label>X<input type="number" step={0.5} value={marker.x} onChange={(e) => patchMarker(marker.id, { x: Number(e.target.value) || 0 })} /></label>
              <label>Z<input type="number" step={0.5} value={marker.z} onChange={(e) => patchMarker(marker.id, { z: Number(e.target.value) || 0 })} /></label>
              <label>Giro°<input type="number" step={15} value={deg(marker.rot)} onChange={(e) => patchMarker(marker.id, { rot: rad(Number(e.target.value) || 0) })} /></label>
            </div>
            {marker.kind === 'portao' && (
              <label>Leva ao<select value={marker.gate ?? 'sul'} onChange={(e) => patchMarker(marker.id, { gate: e.target.value as GateId })}>{GATE_IDS.map((g) => <option key={g} value={g}>{GATES[g].label} (dos arredores)</option>)}</select></label>
            )}
            {marker.kind === 'escola' && (
              <label>Escola<select value={marker.school ?? SCHOOL_IDS[0]} onChange={(e) => patchMarker(marker.id, { school: e.target.value })}>{SCHOOL_IDS.map((s) => <option key={s} value={s}>{SCHOOL_DEFINITIONS[s].label}</option>)}</select></label>
            )}
            <label>Aparece<select value={marker.show} onChange={(e) => patchMarker(marker.id, { show: e.target.value as CityShow })}>{(Object.keys(CITY_SHOW) as CityShow[]).map((k) => <option key={k} value={k}>{CITY_SHOW[k]}</option>)}</select></label>
            {marker.kind === 'portao' && <small className="hint">Pisar no portão leva ao portão de mesmo nome nos Arredores; quem entra por ele aparece aqui, um pouco para dentro.</small>}
            <div className="cs-row">
              {marker.kind !== 'cristal' && <button className="ghost" onClick={duplicate}>Duplicar</button>}
              {marker.kind !== 'cristal' && <button className="ghost danger" onClick={remove}>Apagar</button>}
            </div>
          </fieldset>
        ) : (
          <fieldset key="chao">
            <legend>Chão</legend>
            <label className="swatch"><input type="color" value={layout.ground.color} onChange={(e) => commit((l) => ({ ...l, ground: { ...l.ground, color: e.target.value } }))} /> Calçamento</label>
            <label className="swatch"><input type="color" value={layout.ground.plaza} onChange={(e) => commit((l) => ({ ...l, ground: { ...l.ground, plaza: e.target.value } }))} /> Praça do Cristal</label>
            <small className="hint">O anel azul (raio {CITY_R} m) é até onde o Companion anda. Selecione uma peça ou marcador para editar.</small>
          </fieldset>
        )}

        <fieldset>
          <legend>Na cidade ({layout.pieces.length} peças · {layout.markers.length} marcadores)</legend>
          <ul className="cs-items">
            {layout.markers.map((m) => (
              <li key={m.id} className={(sel?.id === m.id ? 'on' : '') + (visibleIn(m.show, state) ? '' : ' off')}>
                <button onClick={() => { setSel({ kind: 'marker', id: m.id }); setView('cidade'); }}><span aria-hidden>{CITY_MARKERS[m.kind].icon}</span> {m.name}{m.show !== 'ambos' && <em>{CITY_SHOW[m.show]}</em>}</button>
              </li>
            ))}
            {layout.pieces.map((p) => (
              <li key={p.id} className={(sel?.id === p.id ? 'on' : '') + (visibleIn(p.show, state) ? '' : ' off')}>
                <button onClick={() => { setSel({ kind: 'piece', id: p.id }); setView('cidade'); }}><span aria-hidden>▣</span> {p.name}{p.show !== 'ambos' && <em>{CITY_SHOW[p.show]}</em>}</button>
              </li>
            ))}
          </ul>
        </fieldset>
      </aside>
    </div>
  );
}
