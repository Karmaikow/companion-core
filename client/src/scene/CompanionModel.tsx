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
import { CLEAR_R, companionFocus, moveRequest, resolveCollisions, platformHeight, type WorldShape } from './world';
import { SpeechBubble } from './SpeechBubble';
import { Appendages, findAnchors, type AppendageSpec } from './Appendages';
import { EquipmentLayer, findGearBones } from './Equipment';
import { combatInput, chargeState, fxQueue, targets } from './Combat';
import { basicAttack, bowShot, ELEMENTS, type ItemDef, type SpeciesKey } from '@rules';

/** O que o Companion carrega: itens visíveis, a arma (escolhe o ataque) e o que muda o dano. */
export interface Gear { items: ItemDef[]; weapon: ItemDef | null; species: SpeciesKey | null; color: string; poder: number }

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

/** Caixa do modelo pela geometria em pose de descanso (sem consultar ossos — mais robusto com rigs gerados). */
export function restBox(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3(), tmp = new THREE.Box3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    box.union(tmp.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld));
  });
  return box;
}

/** Para onde o modelo olha: pelo osso/objeto da cabeça; sem cabeça, pelo comprimento do corpo. O jogo anda com a frente em +Z. */
export function facingYaw(root: THREE.Object3D): number {
  const box = restBox(root), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
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
  useEffect(() => {
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
  }, [files, onFail]);
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
  const st = useRef({ target: new THREE.Vector3(start[0], 0, start[1]), wait: 2, act: '' as string, yaw: 0, burst: burstKey, once: 0, player: false, running: false, req: moveRequest.id, blocked: 0, lift: 0, stuck: false });
  // WASD / setas: a pessoa conduz o Companion (relativo à câmera); Shift corre. Digitando no chat, as teclas são ignoradas.
  const keys = useRef(new Set<string>());
  useEffect(() => {
    const typing = () => { const el = document.activeElement; return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable); };
    const down = (e: KeyboardEvent) => { if (typing()) return; const k = e.key.toLowerCase(); if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) { keys.current.add(k); if (k.startsWith('arrow')) e.preventDefault(); } };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const clear = () => keys.current.clear();
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', clear);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear); };
  }, []);
  const fwd = useMemo(() => new THREE.Vector3(), []);
  const play = (kind: string, fade = 0.3) => {
    const s = st.current;
    if (s.act === kind) return;
    const next = actions.get(kind);
    if (next) next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    // apaga todas as outras (sem animação de parado, o corpo volta à pose de descanso e respira)
    actions.forEach((a, k) => { if (k !== kind && a.isRunning()) a.fadeOut(fade); });
    s.act = kind;
  };
  useEffect(() => () => { mixer.stopAllAction(); }, [mixer]);

  // ---- ataque: golpe/magia ao apertar; arco carrega enquanto segura e atira ao soltar
  const charge = useRef(0);
  const cb = useRef({ press: combatInput.pressId, release: combatInput.releaseId, charging: false, held: 0, cd: 0, lunge: 0 });
  const prof = useMemo(() => basicAttack(gear?.weapon ?? null, gear?.species), [gear?.weapon, gear?.species]);
  const fxColor = gear?.weapon?.essence ? ELEMENTS[gear.weapon.essence].glow : gear?.color ?? '#ffd56b';
  const damageOf = (mul = 1) => Math.max(1, Math.round(20 * prof.power * (1 + (gear?.poder ?? 0) / 100) * mul));
  const camYaw = (state: { camera: THREE.Camera }) => { state.camera.getWorldDirection(fwd); return Math.atan2(fwd.x, fwd.z); };
  useEffect(() => () => { chargeState.active = false; }, []);

  useFrame((state, dt) => {
    const s = st.current, r = root.current, p = pose.current;
    if (!r || !p) return;
    const t = state.clock.elapsedTime;
    const cs = cb.current;
    cs.cd -= dt;
    if (combatInput.pressId !== cs.press) {
      cs.press = combatInput.pressId;
      if (prof.ranged === 'charged') { cs.charging = true; cs.held = 0; }
      else if (cs.cd <= 0) {
        cs.cd = 1 / prof.cadence;
        const wt = gear?.weapon?.type ?? '';
        const kind = actions.has('attack:' + wt) ? 'attack:' + wt : actions.has(prof.anim) ? prof.anim : actions.has('attack') ? 'attack' : null;
        if (kind) { play(kind, 0.08); s.act = ''; s.once = Math.min(1.2, actions.get(kind)!.getClip().duration * 0.85); } else { s.once = 0.35; cs.lunge = 0.35; }
        s.target.copy(r.position);
        // vira para o alvo mais perto à frente (ajuda no celular)
        let bestD = prof.range + 1.5;
        targets.forEach((tg) => { const dx = tg.x - r.position.x, dz = tg.z - r.position.z, dd = Math.hypot(dx, dz); if (dd < bestD && dd > 0.3) { bestD = dd; s.yaw = Math.atan2(dx, dz); r.rotation.y = s.yaw; } });
        const pos = r.position.clone();
        fxQueue.push(prof.ranged === 'magic'
          ? { kind: 'magic', pos: pos.setY(0), yaw: s.yaw, range: prof.range, damage: damageOf(), color: fxColor }
          : { kind: 'slash', pos, yaw: s.yaw, range: prof.range, damage: damageOf(), color: fxColor, heavy: prof.power > 1.2 });
      }
    }
    if (cs.charging) {
      cs.held += dt;
      const shot = bowShot(cs.held, prof.range, prof.power);
      charge.current = shot.charge;
      // mira para onde a câmera olha (arraste a tela para mirar), com uma ajudinha: um alvo perto dessa direção e
      // dentro do alcance puxa a mira para ele
      let want = camYaw(state), best = 0.85;
      targets.forEach((tg) => {
        const dx = tg.x - r.position.x, dz = tg.z - r.position.z, dist = Math.hypot(dx, dz);
        if (dist > shot.range + 1.5 || dist < 0.5) return;
        let da = Math.atan2(dx, dz) - camYaw(state); while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
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
        fxQueue.push({ kind: 'arrow', pos: r.position.clone(), yaw: s.yaw, range: shot.range, speed: shot.speed, damage: damageOf(shot.power), color: shot.perfect ? '#ffe68a' : fxColor, perfect: shot.perfect });
        s.once = 0.35; s.act = '';
      }
    }
    if (cs.charging) return;
    if (cs.lunge > 0) { cs.lunge -= dt; const k = Math.max(0, cs.lunge) / 0.35; p.position.z = Math.sin(k * Math.PI) * 0.18; p.rotation.x = Math.sin(k * Math.PI) * 0.25; } else { p.position.z = 0; p.rotation.x = 0; }
    // conquista: comemora (se tiver a animação) e para um pouco
    if (s.burst !== burstKey) { s.burst = burstKey; if (actions.has('happy')) { play('happy', 0.15); s.once = actions.get('happy')!.getClip().duration; } s.wait = 2.5; s.target.copy(r.position); }
    if (s.once > 0) { s.once -= dt; mixer.update(dt); return; }

    // clique no chão: anda até lá
    if (s.req !== moveRequest.id) {
      s.req = moveRequest.id;
      s.target.set(moveRequest.point.x, 0, moveRequest.point.z);
      const rr = Math.hypot(s.target.x, s.target.z);
      if (rr > roam.limit) s.target.multiplyScalar(roam.limit / rr);
      s.wait = 10; s.running = false;
    }
    // controle pelo teclado
    const k = keys.current;
    const ix = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    const iz = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    if (ix || iz) {
      state.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
      const rx = -fwd.z, rz = fwd.x; // direita da câmera no chão
      const dx = fwd.x * iz + rx * ix, dz = fwd.z * iz + rz * ix, n = Math.hypot(dx, dz) || 1;
      s.target.set(r.position.x + (dx / n) * 0.8, 0, r.position.z + (dz / n) * 0.8);
      const rr = Math.hypot(s.target.x, s.target.z);
      if (rr > roam.limit) s.target.multiplyScalar(roam.limit / rr);
      s.player = true; s.running = k.has('shift'); s.wait = 12; // passeio sozinho só depois de um tempo parado
    } else if (s.player) { s.player = false; s.running = false; s.target.copy(r.position); }

    const to = new THREE.Vector3(s.target.x - r.position.x, 0, s.target.z - r.position.z);
    const d = to.length();
    if (d > 0.08) {
      to.normalize();
      const step = Math.min(d, (s.running ? runSpeed : walkSpeed) * dt);
      const before = { x: r.position.x, z: r.position.z }, next = { x: r.position.x + to.x * step, z: r.position.z + to.z * step };
      // colisão: desliza em volta de pedras, troncos e da fogueira; se ficar travado contra algo, desiste do destino
      if (resolveCollisions(next) && Math.hypot(next.x - before.x, next.z - before.z) < step * 0.25) { s.blocked += dt; if (s.blocked > 0.6 && !s.player) { s.target.set(next.x, 0, next.z); s.blocked = 0; s.stuck = true; } } else s.blocked = 0;
      r.position.x = next.x; r.position.z = next.z;
      const want = Math.atan2(to.x, to.z); let dy = want - s.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      s.yaw += dy * Math.min(1, dt * (s.player ? 9 : 5));
      play(s.running && actions.has('run') ? 'run' : actions.has('walk') ? 'walk' : 'idle');
    } else {
      s.wait -= dt;
      const night = gameTime(Date.now()).phase === 'madrugada';
      // falando (balão aberto): gesticula, se tiver a animação
      play(night && actions.has('sleep') ? 'sleep' : speech && actions.has('talk') ? 'talk' : 'idle');
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
    r.position.y = world.heightAt(r.position.x, r.position.z) + s.lift;
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
    {gear && gear.items.length > 0 && <EquipmentLayer items={gear.items} bones={gearBones} root={root} charge={charge} />}
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
