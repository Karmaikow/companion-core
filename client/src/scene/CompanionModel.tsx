/**
 * Companion em 3D: o modelo aprovado na Fábrica + animações vindas de outros .GLB do mesmo rig.
 * Ela passeia pela clareira: anda até um ponto, para, respira, às vezes dorme à noite ou comemora conquistas.
 * A velocidade de andar vem do próprio passo da animação (deslocamento da raiz ÷ duração), para as patas não patinarem.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { animKind, attackVariant, strideSpeed, gameTime, type AnimKind } from '@rules';
import type { CompanionModelFiles } from '../backend/types';
import { CLEAR_R, companionFocus, moveRequest, attackRequest, attackPick, teleport, resolveCollisions, platformHeight, type WorldShape } from './world';
import { work } from '../ecos/ecosStore';
import { SpeechBubble } from './SpeechBubble';
import { Appendages, findAnchors, type AppendageSpec } from './Appendages';
import { EquipmentLayer, findGearBones } from './Equipment';
import { aim, combatInput, chargeState, fxQueue, moveInput, requestSkill, skillInput, targets } from './Combat';
import { canAct, spendStamina, tickVitals, vitals } from './vitals';
import { useSkills, aiCast } from '../ui/skillState';
import { settings } from '../settings';
import { brain, idleChatter, say } from './brain';
import { weatherNow } from './Weather';
import { spendSp } from './vitals';
import type { Target } from './Combat';
import { gameVfx } from './vfx/engine';
import { Shield } from './vfx/recipes';
import { basicAttack, bowShot, ELEMENTS, RANK_POWER, type ItemDef, type SpeciesKey } from '@rules';
import { basicHit, castSkill, combat } from '../build/combatStats';

/** O que o Companion carrega: itens visíveis, a arma (escolhe o ataque) e o que muda o dano. */
export interface Gear { items: ItemDef[]; weapon: ItemDef | null; species: SpeciesKey | null; color: string; poder: number; /** id do Companion: pegada ajustada para este modelo */ modelKey?: string | null }

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const load = (url: string) => new Promise<GLTF>((ok, bad) => loader.load(url, ok, undefined, bad));

interface Loaded { gltf: GLTF; clips: { clip: THREE.AnimationClip; kind: AnimKind | string; stride: number }[] }

/** Tira o deslocamento horizontal da raiz (quem move é o jogo) e devolve quanto ela andava por ciclo. */
export function inPlace(clip: THREE.AnimationClip): number {
  let best: THREE.KeyframeTrack | null = null, dist = 0;
  for (const t of clip.tracks) {
    if (!t.name.endsWith('.position') || t.values.length < 6) continue;
    const v = t.values, n = v.length;
    const d = Math.hypot(v[n - 3] - v[0], v[n - 1] - v[2]);
    if (d > dist) { dist = d; best = t; }
  }
  if (best && dist > 0.001) {
    const v = best.values, x0 = v[0], z0 = v[2];
    for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
  }
  return dist;
}

/** Rig com índice de osso inexistente derrubaria a renderização: esse vínculo vira peso zero no osso 0. */
export function sanitizeSkins(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    const idx = m.geometry.getAttribute('skinIndex') as THREE.BufferAttribute, w = m.geometry.getAttribute('skinWeight') as THREE.BufferAttribute;
    const n = m.skeleton.bones.length;
    if (!idx || !w || !m.skeleton.bones.every(Boolean)) return;
    let fixed = false;
    for (let i = 0; i < idx.count; i++) for (let k = 0; k < 4; k++) {
      if (idx.getComponent(i, k) < n) continue;
      idx.setComponent(i, k, 0); w.setComponent(i, k, 0); fixed = true;
    }
    if (fixed) { idx.needsUpdate = true; w.needsUpdate = true; m.normalizeSkinWeights(); }
  });
}

/**
 * Caixa do modelo como ele aparece de verdade: com os ossos aplicados (a malha "crua" de alguns rigs do Tripo vem em
 * outra escala — a Mayuna humana media 2 m crua e 0,98 m com os ossos, e encolhia para metade). Se a conta precisa
 * falhar, cai para a geometria em pose de descanso.
 */
export function restBox(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  try {
    const precise = new THREE.Box3().setFromObject(root, true);
    const sz = precise.getSize(new THREE.Vector3());
    if (!precise.isEmpty() && Number.isFinite(sz.y) && sz.y > 1e-4) return precise;
  } catch { /* cai para a geometria */ }
  const box = new THREE.Box3(), tmp = new THREE.Box3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    box.union(tmp.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld));
  });
  return box;
}

/**
 * Para onde o modelo olha (o jogo anda com a frente em +Z). Humanoide em pé (mais alto que largo) segue a convenção
 * do glTF/Tripo/Mixamo: frente em +Z — de braços abertos ele é mais largo que fundo, e a regra de quadrúpede o
 * girava 90° (andava de lado). Corpo deitado: pela cabeça ou pelo comprimento.
 */
export function facingYaw(root: THREE.Object3D): number {
  const box = restBox(root), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  if (size.y > 1.1 * Math.max(size.x, size.z)) return 0;
  let head: THREE.Object3D | null = null;
  root.traverse((o) => { if (!head && o.name && /head|cabe[cç]a/i.test(o.name)) head = o; });
  if (head) {
    const p = (head as THREE.Object3D).getWorldPosition(new THREE.Vector3()).sub(c);
    if (Math.hypot(p.x, p.z) > 0.08 * Math.max(size.x, size.z)) return Math.atan2(p.x, p.z);
  }
  return size.x > size.z * 1.3 ? Math.PI / 2 : 0;
}

/** Pedido: o Companion andava devagar demais; o passo natural da animação vezes 2. */
const SPEED_BOOST = 2;

const ONCE = new Set(['happy', 'jump', 'attack', 'hurt', 'eat', 'cast', 'shoot', 'dodge', 'wave', 'pickup', 'getup']);

/** Onde o Companion pode andar. No Refúgio: a clareira em volta do altar. No mundo aberto: longe, com passeios perto de onde está. */
export interface Roam {
  limit: number;                                   // raio máximo a partir da origem
  wander: (x: number, z: number) => [number, number]; // próximo passeio sozinho
  /** explorar sozinho: um destino distante (a próxima pedra-guia); null = só passeia */
  goal?: { current: THREE.Vector3 | null };
  start?: [number, number];
}
const REFUGE_ROAM: Roam = {
  limit: CLEAR_R - 0.4,
  wander: () => { const a = Math.random() * Math.PI * 2, rr = 2.3 + Math.random() * (CLEAR_R - 4); return [Math.cos(a) * rr, Math.sin(a) * rr]; },
};

export function CompanionModel({ files, world, burstKey, speech, onFail, roam = REFUGE_ROAM, appendages, speed = 1, gear }: { /** armas e equipamentos */ gear?: Gear | null; /** velocidade da classe (1 = padrão) */ speed?: number; files: CompanionModelFiles; world: WorldShape; burstKey: number; speech: string | null; onFail: () => void; roam?: Roam; /** cauda e asas da classe, desenhadas por código */ appendages?: AppendageSpec | null }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // O objeto `files` é recriado a cada atualização do servidor (mesmos arquivos): recarregar por identidade trocava o
  // modelo no meio da corrida e ele deslizava sem animar. Só recarrega quando os endereços mudam.
  const filesKey = files.url.split('?')[0] + '|' + files.anims.map((a) => a.url.split('?')[0] + ':' + a.kind).join(',');
  const filesRef = useRef(files); filesRef.current = files;
  useEffect(() => {
    const files = filesRef.current;
    let alive = true;
    (async () => {
      const gltf = await load(files.url);
      const clips: Loaded['clips'] = [];
      const add = (list: THREE.AnimationClip[], kindHint: string | null, name: string) =>
        // "special" vindo do servidor (tipo que a função ainda não conhece): tenta pelo nome do arquivo/clipe
        list.forEach((clip) => clips.push({ clip, kind: (kindHint && kindHint !== 'special' ? kindHint : null) ?? animKind(name, clip.name) ?? 'special', stride: inPlace(clip) / Math.max(0.01, clip.duration) }));
      // várias animações num arquivo só: o tipo vem do nome de cada clipe; uma só: do nome do arquivo
      add(gltf.animations, gltf.animations.length > 1 ? null : animKind(files.url.split('?')[0]), 'corpo');
      for (const a of files.anims) {
        if (a.url === files.url) continue;
        try { const g = await load(a.url); add(g.animations, g.animations.length > 1 ? null : a.kind, a.name); } catch { /* animação que falhou só fica de fora */ }
      }
      if (alive) setLoaded({ gltf, clips });
    })().catch(() => alive && onFail());
    return () => { alive = false; };
  }, [filesKey, onFail]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!loaded) return null;
  return <Walker loaded={loaded} world={world} burstKey={burstKey} speech={speech} roam={roam} appendages={appendages ?? null} speed={speed} gear={gear ?? null} />;
}

function Walker({ loaded, world, burstKey, speech, roam, appendages, speed, gear }: { loaded: Loaded; world: WorldShape; burstKey: number; speech: string | null; roam: Roam; appendages: AppendageSpec | null; speed: number; gear: Gear | null }) {
  const root = useRef<THREE.Group>(null);
  const pose = useRef<THREE.Group>(null);
  const { model, scale, mixer, actions, walkSpeed: natWalk, runSpeed: natRun, anchors, gearBones } = useMemo(() => {
    // cópia com esqueleto próprio: o React pode repetir este cálculo, e o original não pode ser movido entre grupos
    const model = cloneSkinned(loaded.gltf.scene);
    sanitizeSkins(model);
    model.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    const box = restBox(model), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const scale = 1.0 / Math.max(0.05, size.y); // todo Companion fica com ~1 m na primeira forma
    model.position.set(-c.x, -box.min.y, -c.z);
    const orient = new THREE.Group(); orient.rotation.y = -facingYaw(model); orient.add(model);
    const mixer = new THREE.AnimationMixer(model);
    const actions = new Map<string, THREE.AnimationAction>();
    let stride = 0;
    // "Parado" que na verdade anda: o Tripo às vezes exporta o rig do corpo já com a animação de andar.
    // Se o clipe de parado desloca o corpo ou é igual ao de andar, ele não serve como parado (fica a respiração procedural).
    const sig = (c: THREE.AnimationClip) => c.duration.toFixed(3) + ':' + c.tracks.length + ':' + c.tracks.slice(0, 3).map((t) => Array.from(t.values.slice(0, 8)).map((v) => v.toFixed(3)).join(',')).join('|');
    const walkClip = loaded.clips.find((c2) => c2.kind === 'walk');
    const clips = loaded.clips.filter((c2) => {
      if (c2.kind !== 'idle') return true;
      const moves = c2.stride * scale > 0.12;
      const sameAsWalk = !!walkClip && sig(walkClip.clip) === sig(c2.clip);
      if (moves || sameAsWalk) { console.warn('[Companion] o clipe "parado" parece de andar; usando respiração no lugar'); return false; }
      return true;
    });
    for (const c2 of clips) {
      // golpe próprio de cada arma ("sword slash" → attack:espada); o primeiro golpe também vale como "attack"
      const variant = c2.kind === 'attack' ? attackVariant(c2.clip.name) : null;
      if (variant && !actions.has('attack:' + variant)) { const av = mixer.clipAction(c2.clip); av.setLoop(THREE.LoopOnce, 1); actions.set('attack:' + variant, av); }
      if (actions.has(c2.kind)) continue;
      const a = mixer.clipAction(c2.clip);
      if (ONCE.has(c2.kind)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false; }
      actions.set(c2.kind, a);
      if (c2.kind === 'walk') stride = c2.stride * scale;
    }
    // cada clipe também por nome ("clip:<nome>"), para as escolhas do Administrador; cópia do clipe = animação própria,
    // tocada uma vez (não mexe no laço de quem usa o mesmo clipe como "andar" ou "correr")
    for (const c2 of loaded.clips) {
      const key = 'clip:' + c2.clip.name;
      if (actions.has(key)) continue;
      const a = mixer.clipAction(c2.clip.clone()); a.setLoop(THREE.LoopOnce, 1); actions.set(key, a);
    }
    const walkSpeed = actions.has('walk') ? strideSpeed(stride, 1, 0.7) : 0.7;
    const run = loaded.clips.find((c2) => c2.kind === 'run');
    const runSpeed = run ? strideSpeed(run.stride * scale, 1, walkSpeed * 2) : walkSpeed * 1.8;
    return { model: orient, scale, mixer, actions, walkSpeed, runSpeed, anchors: findAnchors(model), gearBones: findGearBones(model) };
  }, [loaded]);

  // Velocidade: o dobro do passo natural da animação × a velocidade da classe. A animação acelera junto
  // (timeScale), então os pés continuam sem patinar.
  const mul = SPEED_BOOST * speed;
  const walkSpeed = natWalk * mul, runSpeed = natRun * mul;
  useEffect(() => {
    const w = actions.get('walk'), r = actions.get('run');
    if (w) w.timeScale = Math.min(3, Math.max(0.5, mul));
    if (r) r.timeScale = Math.min(3, Math.max(0.5, mul));
  }, [actions, mul]);

  const start = roam.start ?? [1.6, 1.4];
  const st = useRef({ target: new THREE.Vector3(start[0], 0, start[1]), wait: 2, act: '' as string, yaw: 0, burst: burstKey, once: 0, player: false, running: false, req: moveRequest.id, tp: teleport.id, blocked: 0, lift: 0, stuck: false, jumpT: -1, jumpId: moveInput.jumpId, sitId: moveInput.sitId, sitting: false, guarding: false, click: false });
  // WASD / setas: a pessoa conduz o Companion (relativo à câmera); corre por padrão, Shift anda devagar. Digitando no chat, as teclas são ignoradas.
  const keys = useRef(new Set<string>());
  useEffect(() => {
    const typing = () => { const el = document.activeElement; return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable); };
    const down = (e: KeyboardEvent) => {
      if (typing()) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) { keys.current.add(k); if (k.startsWith('arrow')) e.preventDefault(); }
      if (e.repeat) return;
      if (k === ' ') { e.preventDefault(); moveInput.jumpId++; }
      if (k === 'c') moveInput.sitId++;
      if (k === 'e') moveInput.block = true;
    };
    const up = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); keys.current.delete(k); if (k === 'e') moveInput.block = false; };
    const clear = () => { keys.current.clear(); moveInput.block = false; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', clear);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear); };
  }, []);
  const fwd = useMemo(() => new THREE.Vector3(), []);
  const play = (kind: string, fade = 0.3) => {
    const s = st.current;
    const next = actions.get(kind);
    // só pula se já estiver tocando de verdade (modelo trocado ou animação apagada por outra = toca de novo)
    if (s.act === kind && (!next || next.isRunning())) return;
    if (next) next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    // apaga todas as outras (sem animação de parado, o corpo volta à pose de descanso e respira).
    // Compara a animação, não o nome: "attack" e "attack:faca" podem ser o mesmo clipe — apagar pelo nome apagava
    // o próprio golpe (braços abertos) ou a corrida (deslizava parado).
    actions.forEach((a) => { if (a !== next && a.isRunning()) a.fadeOut(fade); });
    s.act = kind;
  };
  useEffect(() => { st.current.act = ''; return () => { mixer.stopAllAction(); }; }, [mixer]);
  // testes no navegador (só no dev): estado das animações
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __anim: unknown }).__anim = () => ({ act: st.current.act, once: st.current.once, running: st.current.running, list: [...actions.entries()].map(([k, a]) => [k, a.getClip().name, a.isRunning(), +a.getEffectiveWeight().toFixed(2), a.enabled, +a.timeScale.toFixed(2)]) });
  }, [actions]);

  // ---- ataque: golpe/magia ao apertar; arco carrega enquanto segura e atira ao soltar
  const charge = useRef(0);
  const cb = useRef({ press: combatInput.pressId, release: combatInput.releaseId, charging: false, held: 0, cd: 0, lunge: 0, want: 0, skill: skillInput.id, ai: { think: 0, skillT: 1, target: null as Target | null, engaged: null as Target | null, fleeFrom: null as Target | null, fleeing: false, hitSeen: 0, lowSaid: 0 }, move: null as null | { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; arc: number }, atkReq: attackRequest.id });
  useEffect(() => { skillInput.body = true; return () => { skillInput.body = false; }; }, []);
  const prof = useMemo(() => basicAttack(gear?.weapon ?? null, gear?.species), [gear?.weapon, gear?.species]);
  const ESSENCE_FX: Record<string, string> = { fogo: 'chamas', agua: 'gotas', terra: 'pedras', vento: 'vento', luz: 'luz', sombra: 'sombra', gelo: 'gelo', raio: 'raios', natureza: 'folhas', veneno: 'veneno' };
  const fxColor = gear?.weapon?.essence ? ELEMENTS[gear.weapon.essence].glow : gear?.color ?? '#ffd56b';
  // Constelação Viva: Força (armas físicas) ou Magia (cajado, varinha, orbe…) escalam o golpe; o equipamento já entra na potência
  const basic = () => basicHit(prof.ranged, gear?.weapon?.essence ?? null);
  const damageOf = (mul = 1) => Math.max(1, Math.round(20 * prof.power * basic().power * mul));
  const cadence = () => prof.cadence * combat.d.attackSpeed; // velocidade de ataque = frequência
  // mira do mouse (PC): o ponto do chão sob o cursor, na altura do Companion
  const aimRay = useMemo(() => ({ ray: new THREE.Raycaster(), plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit: new THREE.Vector3() }), []);
  const mouseGround = (state: { camera: THREE.Camera; pointer: THREE.Vector2 }, at: THREE.Vector3, use: 'attack' | 'skill' = 'attack') => {
    if (!aim.mouse) return null;
    if ((use === 'attack' ? settings().attackAim : settings().skillAim) === 'alvo') return null; // Ajustes: mira no monstro mais perto
    aimRay.ray.setFromCamera(state.pointer, state.camera); aimRay.plane.constant = -at.y;
    const h = aimRay.ray.ray.intersectPlane(aimRay.plane, aimRay.hit);
    return h && Math.hypot(h.x - at.x, h.z - at.z) > 0.15 ? h : null;
  };
  // animação escolhida no Administrador: "clip:<nome>" ou "kind:<tipo>" (vale só se o modelo tiver)
  const chosen = (key: string): string | null => {
    const v = useSkills.getState().animMap[key];
    if (!v) return null;
    const k = v.startsWith('clip:') ? v : v.startsWith('kind:') ? v.slice(5) : null;
    return k && actions.has(k) ? k : null;
  };
  const camYaw = (state: { camera: THREE.Camera }) => { state.camera.getWorldDirection(fwd); return Math.atan2(fwd.x, fwd.z); };
  const shield = useMemo(() => new Shield(gameVfx), []);
  useEffect(() => () => { chargeState.active = false; vitals.blocking = false; shield.stop(); }, [shield]);

  useFrame((state, dt) => {
    const s = st.current, r = root.current, p = pose.current;
    if (!r || !p) return;
    const t = state.clock.elapsedTime;
    const cs = cb.current;
    cs.cd -= dt;
    tickVitals(Math.min(dt, 0.1));
    // desmaiou (HP zerou): cai e fica até a vida voltar
    if (vitals.down > 0) {
      if (s.act !== 'faint' && s.act !== 'faint-rest') { play(actions.has('faint') ? 'faint' : 'idle', 0.15); s.act = 'faint'; }
      const fa = actions.get('faint'); if (fa && fa.time > fa.getClip().duration * 0.9) fa.paused = true;
      if (!fa) p.rotation.z = Math.min(Math.PI / 2.4, p.rotation.z + dt * 4);
      vitals.blocking = false; shield.stop(); s.sitting = false; s.target.copy(r.position); s.once = 0;
      chargeState.active = false; cs.charging = false;
      mixer.update(dt);
      return;
    }
    if (s.act === 'faint') { const fa = actions.get('faint'); if (fa) fa.paused = false; p.rotation.z = 0; s.act = ''; say('revive', {}, { force: true }); }
    // sentar (C): fica sentado até mexer
    if (moveInput.sitId !== s.sitId) { s.sitId = moveInput.sitId; s.sitting = !s.sitting; if (s.sitting) { s.target.copy(r.position); s.player = false; } }
    // defesa (segurar E): escudo na frente, anda devagar, corta 75% do dano; gasta stamina
    const guard = moveInput.block && vitals.st > 1 && !cs.charging;
    vitals.blocking = guard;
    if (guard) { s.sitting = false; shield.update(r.position, s.yaw, '#9fd8ff', dt); } else shield.stop();
    // pulo (Espaço)
    if (moveInput.jumpId !== s.jumpId) {
      s.jumpId = moveInput.jumpId;
      if (s.jumpT < 0 && !guard && s.once <= 0 && spendStamina(15)) { s.jumpT = 0; s.sitting = false; const ja = actions.get('jump'); if (ja) { play('jump', 0.08); ja.timeScale = Math.max(1, ja.getClip().duration / 0.62); s.act = 'jump'; } }
    }
    // ---- cérebro: agir sozinha (explorando, com uma ordem, ou se defendendo). O teclado do jogador manda mais.
    const conf = settings(), ai = cs.ai, order0 = brain.order;
    if (order0 && 'until' in order0 && performance.now() > order0.until) brain.order = null;
    const order = brain.order;
    const driving = [...keys.current].some((k2) => k2 !== 'shift') || s.click; // andando por clique: a ordem do jogador vale até chegar
    ai.think -= dt; ai.skillT -= dt;
    if (vitals.hitId !== ai.hitSeen) { ai.hitSeen = vitals.hitId; say('hurt', {}, { chance: 0.35 }); }
    const hpR = vitals.hp / Math.max(1, vitals.hpMax);
    // clique no monstro: ordem de ataque (vai até ele e golpeia até ele cair, ou até a pessoa mandar andar)
    if (attackRequest.id !== cs.atkReq) { cs.atkReq = attackRequest.id; s.click = false; s.player = false; s.sitting = false; ai.think = 0; ai.engaged = null; }
    let focusT = attackPick.focus ? targets.get(attackPick.focus) ?? null : null;
    if (focusT && (focusT.r < 0 || (focusT.creature && focusT.creature.hp() <= 0) || Math.hypot(focusT.x - r.position.x, focusT.z - r.position.z) > 30)) { attackPick.focus = null; focusT = null; }
    if (ai.think <= 0) {
      ai.think = 0.25; ai.target = null; ai.fleeFrom = null;
      if (focusT && !cs.charging && order?.kind !== 'flee') ai.target = focusT;
      else if (!driving && !cs.charging) {
        let threat: Target | null = null, td = Infinity, prey: Target | null = null, pd = Infinity;
        const huntR = order?.kind === 'hunt' ? 18 : 12;
        targets.forEach((tg) => {
          const c = tg.creature; if (!c || tg.r < 0 || c.hp() <= 0) return;
          const dd = Math.hypot(tg.x - r.position.x, tg.z - r.position.z);
          if (c.hostile() && dd < 10 && dd < td) { td = dd; threat = tg; }
          const fits = order?.kind === 'hunt' ? order.arrived && (!order.creature || order.creature === c.slug) : true;
          if (fits && dd < huntR && dd < pd) { pd = dd; prey = tg; }
        });
        const lowHp = conf.fleeAt > 0 && hpR < conf.fleeAt && !!threat && td < 9;
        if (order?.kind === 'flee' || lowHp) {
          ai.fleeFrom = threat;
          if (lowHp && performance.now() - ai.lowSaid > 15000) { ai.lowSaid = performance.now(); say('low-hp', {}, { force: true }); }
        } else {
          const exploring = !!roam.goal?.current;
          const hunting = order?.kind === 'attack' || order?.kind === 'hunt' || (exploring && conf.posture === 'cacadora');
          if (hunting && prey) ai.target = prey;
          else if (conf.posture !== 'pacifica' && threat && td < 7) ai.target = threat; // se defende de quem vem brigar
        }
      }
    }
    let aiYaw: number | null = null;
    if (!driving && (ai.fleeFrom || order?.kind === 'flee')) {
      // foge para longe da ameaça (sem ameaça: para longe de onde está, de volta para o começo)
      const from = ai.fleeFrom;
      let ux = from ? r.position.x - from.x : -r.position.x, uz = from ? r.position.z - from.z : -r.position.z;
      const n = Math.hypot(ux, uz) || 1; ux /= n; uz /= n;
      s.target.set(r.position.x + ux * 6, 0, r.position.z + uz * 6); s.running = true; s.wait = 1.5; s.sitting = false; s.player = false;
      if (!ai.fleeing) { ai.fleeing = true; if (order?.kind !== 'flee') say('flee', {}, { chance: 0.8 }); }
    } else ai.fleeing = false;
    if (!driving && ai.target && !ai.fleeFrom && order?.kind !== 'flee') {
      const tg = ai.target, dx = tg.x - r.position.x, dz = tg.z - r.position.z, dd = Math.hypot(dx, dz) || 1;
      const reach = (prof.ranged === 'none' ? prof.range * 0.85 : Math.min(prof.range * 0.8, 6)) + tg.r;
      if (ai.engaged !== tg) { ai.engaged = tg; say('engage', { m: tg.creature?.name }, { chance: 0.6 }); }
      s.sitting = false; s.player = false; s.wait = 1;
      if (dd > reach) { s.target.set(tg.x - (dx / dd) * reach * 0.8, 0, tg.z - (dz / dd) * reach * 0.8); s.running = true; }
      else {
        s.target.copy(r.position); aiYaw = Math.atan2(dx, dz);
        if (prof.ranged !== 'charged') cs.want = Math.max(cs.want, 0.15);
        else if (cs.cd <= 0 && canAct() && spendStamina(6)) {
          // arco: tiro rápido (sem carregar) no ritmo da arma
          const shot = bowShot(0.9, prof.range, prof.power);
          s.yaw = aiYaw; r.rotation.y = s.yaw; cs.cd = 1 / cadence() + 0.5;
          if (actions.has('shoot')) { play('shoot', 0.08); actions.get('shoot')!.timeScale = 1.6; s.act = ''; s.once = 0.45; }
          fxQueue.push({ kind: 'arrow', pos: r.position.clone(), yaw: s.yaw, range: shot.range, speed: shot.speed, damage: damageOf(shot.power), color: fxColor, perfect: false, info: basic().info });
        }
      }
      // habilidades da barra, quando dá (SP, recarga, alcance)
      if (ai.skillT <= 0 && s.once <= 0 && !focusT) { // na ordem de ataque da pessoa, só o golpe básico
        ai.skillT = 1.4 + Math.random() * 1.2;
        const used = aiCast(dd, { x: tg.x, z: tg.z }, gear?.color ?? '#ffd56b', hpR, vitals.sp, spendSp, (c) => requestSkill(c));
        if (used) say('skill', {}, { chance: 0.45 });
      }
    } else if (!ai.target) ai.engaged = null;

    // apertar guarda o pedido por um instante (não perde o clique feito no fim do golpe anterior);
    // segurar F/Espaço continua atacando no ritmo da arma
    if (combatInput.pressId !== cs.press) {
      cs.press = combatInput.pressId;
      if (prof.ranged === 'charged') { cs.charging = true; cs.held = 0; }
      else cs.want = 0.35;
    }
    if (prof.ranged !== 'charged' && combatInput.holding) cs.want = Math.max(cs.want, 0.1);
    const fire = cs.want > 0 && cs.cd <= 0 && !cs.charging && !cs.move && !guard && canAct() && spendStamina(6);
    cs.want -= Math.min(dt, 0.1);
    if (fire) {
      s.sitting = false;
      cs.want = 0;
      cs.cd = 1 / cadence();
      const wt = gear?.weapon?.type ?? '';
      const kind = (wt ? null : chosen('__basic')) ?? (actions.has('attack:' + wt) ? 'attack:' + wt : actions.has(prof.anim) ? prof.anim : actions.has('attack') ? 'attack' : null);
      if (kind) {
        // a animação acelera para caber no ritmo da arma, e o corpo fica preso só até o golpe sair
        const a = actions.get(kind)!, dur = a.getClip().duration, ts = Math.min(3, Math.max(1.3, dur * cadence() * 1.15));
        play(kind, 0.06); a.timeScale = ts; s.act = ''; s.once = Math.min(0.75, (dur / ts) * 0.8);
      } else { s.once = 0.3; cs.lunge = 0.3; }
      s.target.copy(r.position);
      const m = aiYaw !== null ? null : mouseGround(state, r.position);
      if (aiYaw !== null) { s.yaw = aiYaw; r.rotation.y = s.yaw; say('attack', {}, { chance: 0.15 }); }
      else if (m) { s.yaw = Math.atan2(m.x - r.position.x, m.z - r.position.z); r.rotation.y = s.yaw; }
      else {
        // celular: vira para o alvo mais perto
        let bestD = prof.range + 1.5;
        targets.forEach((tg) => { const dx = tg.x - r.position.x, dz = tg.z - r.position.z, dd = Math.hypot(dx, dz); if (dd < bestD && dd > 0.3) { bestD = dd; s.yaw = Math.atan2(dx, dz); r.rotation.y = s.yaw; } });
      }
      const pos = r.position.clone();
      fxQueue.push(prof.ranged === 'magic'
        ? { kind: 'magic', pos: pos.setY(0), yaw: s.yaw, range: prof.range, damage: damageOf(), color: fxColor, style: gear?.weapon?.essence ? ESSENCE_FX[gear.weapon.essence] : 'luz', info: basic().info }
        : { kind: 'slash', pos, yaw: s.yaw, range: prof.range, damage: damageOf(), color: fxColor, heavy: prof.power > 1.2, info: basic().info });
    }
    if (cs.charging) {
      cs.held += dt;
      const shot = bowShot(cs.held, prof.range, prof.power);
      charge.current = shot.charge;
      // mira para onde a câmera olha (arraste a tela para mirar), com uma ajudinha: um alvo perto dessa direção e
      // dentro do alcance puxa a mira para ele
      const mg = mouseGround(state, r.position);
      let want = mg ? Math.atan2(mg.x - r.position.x, mg.z - r.position.z) : camYaw(state), best = mg ? 0.2 : 0.85;
      const base = want;
      targets.forEach((tg) => {
        const dx = tg.x - r.position.x, dz = tg.z - r.position.z, dist = Math.hypot(dx, dz);
        if (dist > shot.range + 1.5 || dist < 0.5) return;
        let da = Math.atan2(dx, dz) - base; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        if (Math.abs(da) < best) { best = Math.abs(da); want = Math.atan2(dx, dz); }
      }); let dy = want - s.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI; s.yaw += dy * Math.min(1, dt * 10);
      Object.assign(chargeState, { active: true, charge: shot.charge, perfect: shot.perfect, yaw: s.yaw, range: shot.range, color: fxColor });
      chargeState.pos.copy(r.position);
      s.target.copy(r.position); s.player = false;
      const a = actions.get('shoot');
      if (a) { if (s.act !== 'shoot') { play('shoot', 0.1); } if (a.time > a.getClip().duration * 0.45) a.timeScale = 0; }
      else play('idle');
      r.rotation.y = s.yaw;
      mixer.update(dt);
    }
    if (combatInput.releaseId !== cs.release) {
      cs.release = combatInput.releaseId;
      if (cs.charging) {
        const shot = bowShot(cs.held, prof.range, prof.power);
        cs.charging = false; charge.current = 0; chargeState.active = false;
        const a = actions.get('shoot'); if (a) a.timeScale = 1;
        fxQueue.push({ kind: 'arrow', pos: r.position.clone(), yaw: s.yaw, range: shot.range, speed: shot.speed, damage: damageOf(shot.power), color: shot.perfect ? '#ffe68a' : fxColor, perfect: shot.perfect, info: basic().info });
        s.once = 0.35; s.act = '';
      }
    }
    if (cs.charging) return;
    // habilidade da barra (1–9): vira para o alvo, anima e dispara; investida e salto deslocam o corpo
    if (skillInput.id !== cs.skill) {
      cs.skill = skillInput.id;
      const q = skillInput.req;
      if (q) {
        const sk = q.skill;
        // dano, cura e preparação congelados no lançamento: trocar a build depois não muda o que já saiu
        const fz = q.frozen ?? castSkill(sk, 1 + RANK_POWER * (q.level - 1));
        let best: { x: number; z: number } | null = null, bd = Math.max(sk.range, sk.radius) + 1.5;
        targets.forEach((tg) => { const dd = Math.hypot(tg.x - r.position.x, tg.z - r.position.z); if (dd < bd && dd > 0.3) { bd = dd; best = tg; } });
        const b = best as { x: number; z: number } | null;
        const mg = q.aimAt ? new THREE.Vector3(q.aimAt.x, r.position.y, q.aimAt.z) : mouseGround(state, r.position, 'skill');
        if (mg && sk.shape !== 'aura') { s.yaw = Math.atan2(mg.x - r.position.x, mg.z - r.position.z); r.rotation.y = s.yaw; }
        else if (b && sk.shape !== 'aura') { s.yaw = Math.atan2(b.x - r.position.x, b.z - r.position.z); r.rotation.y = s.yaw; }
        const fv = new THREE.Vector3(Math.sin(s.yaw), 0, Math.cos(s.yaw));
        const aimed = (sk.shape === 'circle' || sk.shape === 'leap') && b && bd <= sk.range + 0.5;
        // no PC, área e salto caem onde o mouse aponta (até o alcance)
        const mouseTgt = mg ? (() => { const d = Math.min(sk.range, Math.hypot(mg.x - r.position.x, mg.z - r.position.z)); return r.position.clone().setY(0).addScaledVector(fv, d); })() : null;
        const tgt = mouseTgt ?? (aimed ? new THREE.Vector3(b!.x, 0, b!.z) : r.position.clone().setY(0).addScaledVector(fv, sk.shape === 'leap' ? sk.range : Math.min(sk.range, 3.5)));
        const travel = sk.shape === 'dash' ? 0.3 : sk.shape === 'leap' ? 0.45 : 0;
        const kind = chosen(sk.slug) ?? (sk.anim === 'attack' && sk.shape !== 'melee' && actions.has('cast') ? 'cast' : actions.has(sk.anim) ? sk.anim : actions.has('attack') ? 'attack' : null);
        if (kind) { const a = actions.get(kind)!, ts = 1.5; play(kind, 0.06); a.timeScale = ts; s.act = ''; s.once = Math.max(fz.windup + travel + 0.15, Math.min(0.9, (a.getClip().duration / ts) * 0.8)); } else { s.once = fz.windup + travel + 0.3; cs.lunge = 0.35; }
        s.target.copy(r.position); s.player = false; s.wait = Math.max(s.wait, 1.6);
        fxQueue.push({ kind: 'skill', pos: r.position.clone(), yaw: s.yaw, target: tgt, skill: { ...sk, windup: fz.windup }, damage: fz.damage, heal: fz.heal, color: q.color, info: fz.info });
        if (travel) cs.move = { from: r.position.clone(), to: sk.shape === 'dash' ? r.position.clone().addScaledVector(fv, sk.range) : tgt.clone(), t: -fz.windup, dur: travel, arc: sk.shape === 'leap' ? 1.3 : 0 };
      }
    }
    if (cs.move) {
      const m = cs.move; m.t += dt;
      if (m.t >= 0) {
        const k = Math.min(1, m.t / m.dur);
        const x = m.from.x + (m.to.x - m.from.x) * k, z = m.from.z + (m.to.z - m.from.z) * k, rad = Math.hypot(x, z), lim = roam.limit;
        r.position.x = rad > lim ? (x / rad) * lim : x; r.position.z = rad > lim ? (z / rad) * lim : z;
        r.position.y = world.heightAt(r.position.x, r.position.z) + Math.sin(k * Math.PI) * m.arc;
        companionFocus.set(r.position.x, r.position.y, r.position.z);
        s.target.copy(r.position);
        if (k >= 1) cs.move = null;
      }
    }
    if (cs.lunge > 0) { cs.lunge -= dt; const k = Math.max(0, cs.lunge) / 0.35; p.position.z = Math.sin(k * Math.PI) * 0.18; p.rotation.x = Math.sin(k * Math.PI) * 0.25; } else { p.position.z = 0; p.rotation.x = 0; }
    // conquista: comemora (se tiver a animação) e para um pouco
    if (s.burst !== burstKey) { s.burst = burstKey; if (actions.has('happy')) { play('happy', 0.15); s.once = actions.get('happy')!.getClip().duration; } s.wait = 2.5; s.target.copy(r.position); }
    if (s.once > 0) { s.once -= dt; mixer.update(dt); return; }

    if (s.tp !== teleport.id) { s.tp = teleport.id; r.position.x = teleport.point.x; r.position.z = teleport.point.z; s.target.copy(r.position); }
    // clique no chão: anda até lá
    if (s.req !== moveRequest.id) {
      s.req = moveRequest.id;
      s.target.set(moveRequest.point.x, 0, moveRequest.point.z);
      const rr = Math.hypot(s.target.x, s.target.z);
      if (rr > roam.limit) s.target.multiplyScalar(roam.limit / rr);
      s.wait = 10; s.running = !keys.current.has('shift'); s.sitting = false; s.click = true; s.blocked = 0;
    }
    // controle pelo teclado
    const k = keys.current;
    const ix = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    const iz = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    if (ix || iz) {
      s.click = false; attackPick.focus = null;
      state.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
      const rx = -fwd.z, rz = fwd.x; // direita da câmera no chão
      const dx = fwd.x * iz + rx * ix, dz = fwd.z * iz + rz * ix, n = Math.hypot(dx, dz) || 1;
      s.target.set(r.position.x + (dx / n) * 0.8, 0, r.position.z + (dz / n) * 0.8);
      const rr = Math.hypot(s.target.x, s.target.z);
      if (rr > roam.limit) s.target.multiplyScalar(roam.limit / rr);
      s.player = true; s.running = !k.has('shift'); s.wait = 12; s.sitting = false; // passeio sozinho só depois de um tempo parado
    } else if (s.player) { s.player = false; s.running = false; s.target.copy(r.position); }

    const to = new THREE.Vector3(s.target.x - r.position.x, 0, s.target.z - r.position.z);
    const d = to.length();
    if (d > 0.08) {
      to.normalize();
      const step = Math.min(d, (guard ? walkSpeed * combat.d.guard.move : s.running ? runSpeed : walkSpeed) * dt);
      const before = { x: r.position.x, z: r.position.z }, next = { x: r.position.x + to.x * step, z: r.position.z + to.z * step };
      // colisão: desliza em volta de pedras, troncos e da fogueira; se ficar travado contra algo, desiste do destino
      if (resolveCollisions(next) && Math.hypot(next.x - before.x, next.z - before.z) < step * 0.25) { s.blocked += dt; if (s.blocked > 0.6 && !s.player) { s.target.set(next.x, 0, next.z); s.blocked = 0; s.stuck = true; s.click = false; } } else s.blocked = 0;
      r.position.x = next.x; r.position.z = next.z;
      const want = Math.atan2(to.x, to.z); let dy = want - s.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      s.yaw += dy * Math.min(1, dt * (s.player ? 9 : 5));
      if (s.jumpT >= 0 && actions.has('jump')) { /* o pulo segue tocando */ } else play(guard && actions.has('block') ? 'block' : s.running && actions.has('run') ? 'run' : actions.has('walk') ? 'walk' : 'idle');
    } else {
      s.click = false;
      s.wait -= dt;
      const night = gameTime(Date.now()).phase === 'madrugada';
      // falando (balão aberto): gesticula, se tiver a animação
      if (s.jumpT >= 0 && actions.has('jump')) { /* pulando parado */ }
      else if (work.on && !s.player) {
        // coletando (Ecos da Terra): olha para o recurso e trabalha
        const want = Math.atan2(work.at.x - r.position.x, work.at.z - r.position.z); let dy = want - s.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
        s.yaw += dy * Math.min(1, dt * 6);
        const wk = actions.has('gather') ? 'gather' : actions.has('attack') ? 'attack' : 'idle';
        play(wk); const wa = actions.get(wk); if (wa && wk === 'attack') wa.timeScale = 0.75;
        s.wait = Math.max(s.wait, 1);
      }
      else play(guard && actions.has('block') ? 'block' : s.sitting && actions.has('sit') ? 'sit' : night && actions.has('sleep') ? 'sleep' : speech && actions.has('talk') ? 'talk' : 'idle');
      if (s.sitting || guard) s.wait = Math.max(s.wait, 1);
      if (!ai.target && !ai.fleeing) idleChatter({ raining: weatherNow.kind === 'chuva' || weatherNow.kind === 'tempestade', night });
      const goal = roam.goal?.current;
      if (goal && !s.player && s.wait > 0.4) s.wait = 0.4; // explorando: pausa curta entre os trechos
      if (s.wait <= 0 && !(night && actions.has('sleep'))) {
        if (goal) {
          // explorar sozinho: trechos de ~6 m na direção da pedra-guia, com um desvio (contorna o que travou)
          const gx = goal.x - r.position.x, gz = goal.z - r.position.z, gd = Math.hypot(gx, gz) || 1, step = Math.min(gd, 6);
          const side = s.stuck || Math.random() < 0.15 ? (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 4) : (Math.random() - 0.5) * 1.5;
          s.stuck = false;
          s.target.set(r.position.x + (gx / gd) * step - (gz / gd) * side, 0, r.position.z + (gz / gd) * step + (gx / gd) * side);
          s.wait = 0.4; s.running = true; // explorando, ela vai correndo
        } else {
          s.running = false;
          const [wx, wz] = roam.wander(r.position.x, r.position.z);
          s.target.set(wx, 0, wz);
          s.wait = 3 + Math.random() * 6;
        }
      }
    }
    // sobe em plataformas baixas (o altar) com suavidade
    s.lift += (platformHeight(r.position.x, r.position.z) - s.lift) * Math.min(1, dt * 10);
    let hop = 0;
    if (s.jumpT >= 0) {
      s.jumpT += dt; const k2 = s.jumpT / 0.62;
      if (k2 >= 1) { s.jumpT = -1; if (s.act === 'jump') s.act = ''; } else hop = 4 * 0.75 * k2 * (1 - k2);
      if (!actions.has('jump')) p.rotation.x = -Math.sin(Math.min(1, k2) * Math.PI) * 0.25;
    }
    r.position.y = world.heightAt(r.position.x, r.position.z) + s.lift + hop;
    r.rotation.y = s.yaw;
    companionFocus.set(r.position.x, r.position.y, r.position.z);
    // sem animação de andar: um quique leve por procedimento; parada, respira
    const moving = d > 0.08;
    p.position.y = moving && !actions.has('walk') ? Math.abs(Math.sin(t * 9)) * 0.06 : 0;
    const br = !moving && !actions.has('idle') ? Math.sin(t * 2.2) * 0.02 : 0;
    p.scale.set(scale * (1 - br * 0.5), scale * (1 + br), scale * (1 - br * 0.5));
    mixer.update(dt);
  });

  return (
    <>
    {appendages && (appendages.tail || appendages.wings) && <Appendages spec={appendages} anchors={anchors} root={root} heightAt={world.heightAt} />}
    {gear && gear.items.length > 0 && <EquipmentLayer items={gear.items} bones={gearBones} root={root} charge={charge} modelKey={gear.modelKey} />}
    <group ref={root} position={[start[0], 0, start[1]]}>
      <group ref={pose} scale={scale}>
        <primitive object={model} />
      </group>
      <SpeechBubble text={speech} position={[0, 1.45, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.45, 24]} />
        <meshBasicMaterial color="#000" transparent opacity={0.18} depthWrite={false} />
      </mesh>
    </group>
    </>
  );
}
