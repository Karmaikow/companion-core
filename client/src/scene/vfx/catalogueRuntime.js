import * as THREE from 'three';
import { getAbility } from '../../vendor/threejs-vfx/abilities/registry.js';
import { ParticleEngine } from '../../vendor/threejs-vfx/particles/ParticleEngine.js';
import { LightPool } from '../../vendor/threejs-vfx/effects/LightPool.js';
import { DecalSystem } from '../../vendor/threejs-vfx/effects/GroundDecals.js';
import { FissureSystem } from '../../vendor/threejs-vfx/effects/GroundFissures.js';
import { BurstSystem } from '../../vendor/threejs-vfx/effects/BurstSphere.js';
import { frame } from '../../vendor/threejs-vfx/core/FrameUniforms.js';
import { patchOnBeforeCompile } from '../../vendor/threejs-vfx/utils/shaderPatch.js';
import { globals } from '../../vendor/threejs-vfx/config/globals.js';

const MAX_ACTIVE = 4;
/**
 * Depois de tantos tipos carregados (a galeria da Forja, com 100+), o que ficou parado é liberado. No jogo são ~20
 * (as habilidades da Companion e dos monstros): era 12, e passar disso jogava fora os efeitos já compilados — o
 * próximo lançamento compilava tudo de novo (travadas de 1–2,6 s).
 */
const TRIM_TYPES = 40;
/** Espera um pouco sem segurar a tela (o próximo quadro, ou um tempo curto se a aba estiver em segundo plano). */
const breathe = () => new Promise((r) => (typeof document !== 'undefined' && !document.hidden && typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 16)));
const WARM_AT = new THREE.Vector3(5000, 0, 5000), WARM_DIR = new THREE.Vector3(0, 0, 1), WARM_DT = 1 / 30, WARM_SECONDS = 8;

/**
 * Sem luzes: os efeitos já tratam o "acabaram as luzes" (acquire → null). No jogo é o padrão — 6 luzes pontuais
 * a mais pesam em todo material do mundo, a cada quadro, e colocá-las na cena recompila o mundo inteiro.
 */
const NO_LIGHTS = { acquire: () => null, set() {}, release() {}, update() {}, reset() {}, dispose() {} };

function makeContext(root, camera, systems) {
  return { scene: root, camera, ...systems,
    environment: { registerShadowCaster: (m) => m, registerShadowCasterWithPatch: patchOnBeforeCompile },
    shake: { add() {}, rumble() {} }, flash: { trigger() {} } };
}

/**
 * One bounded renderer per viewport. Upstream code never changes combat.
 *
 * Effects are pooled per id and only turned off (`destroy()`) between casts — disposing them would free their
 * shaders, and the next cast would compile everything again (a freeze of seconds). `warm(ids)` builds and compiles
 * the effects ahead of time, off-screen and in parallel (`compileAsync`), so the first cast does not freeze either.
 */
export class CatalogueRuntime {
  constructor(scene, camera, gl, { lights = true, volumeQuality = 1 } = {}) {
    // menos passos nos volumes (fogo, fumaça, fachos): é o que mais pesa na GPU por quadro
    globals.volumeQuality = volumeQuality;
    this.root = new THREE.Group(); scene.add(this.root); this.scene = scene; this.camera = camera; this.gl = gl;
    this.previousMask = camera.layers.mask; camera.layers.enable(1);
    this.alive = true; this.pending = []; this.active = []; this.time = 0; this.idle = 0;
    /** id → instâncias livres; id → classe; id → import em andamento */
    this.pools = new Map(); this.classes = new Map(); this.loading = new Map(); this.warming = new Map(); this.ready = new Set();
    this.depth = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); this.depth.needsUpdate = true;
    this.particles = new ParticleEngine(this.root); this.lights = lights ? new LightPool(this.root) : NO_LIGHTS;
    this.decals = new DecalSystem(this.root); this.fissures = new FissureSystem(this.root); this.bursts = new BurstSystem(this.root);
    this.context = makeContext(this.root, camera, { particles: this.particles, lights: this.lights, decals: this.decals, fissures: this.fissures, bursts: this.bursts });
    /** cópias de aquecimento: vivem numa cena que nunca é desenhada e seguram os programas compilados */
    this.warmRoot = null; this.warmContext = null; this.warmed = [];
  }

  warmSystems() {
    if (this.warmContext) return this.warmContext;
    this.warmRoot = new THREE.Group();
    const r = this.warmRoot;
    this.warmContext = makeContext(r, this.camera, { particles: new ParticleEngine(r), lights: NO_LIGHTS, decals: new DecalSystem(r), fissures: new FissureSystem(r), bursts: new BurstSystem(r) });
    return this.warmContext;
  }

  load(id) {
    if (this.classes.has(id)) return Promise.resolve(this.classes.get(id));
    if (this.loading.has(id)) return this.loading.get(id);
    const descriptor = getAbility(id);
    if (!descriptor) return Promise.resolve(null);
    const p = descriptor.load().then((Type) => { this.classes.set(id, Type); return Type; }).finally(() => this.loading.delete(id));
    this.loading.set(id, p);
    return p;
  }

  instance(id, Type) {
    const free = this.pools.get(id);
    if (free?.length) return free.pop();
    const effect = new Type(this.context);
    this.root.add(effect.group);
    effect.group.visible = false;
    return effect;
  }

  release(effect) {
    effect.destroy();
    if (!this.pools.has(effect.element)) this.pools.set(effect.element, []);
    this.pools.get(effect.element).push(effect);
  }

  /** Constrói e compila os efeitos destes ids sem mostrar nada (fora da câmera, em paralelo quando o navegador deixa). */
  async warm(ids) {
    for (const id of ids) await this.prepare(id);
  }

  /** Prepara um id (uma vez só; quem chega durante o preparo espera o mesmo). */
  prepare(id) {
    if (!this.alive || this.ready.has(id)) return Promise.resolve();
    if (this.warming.has(id)) return this.warming.get(id);
    const p = this.warmOne(id).finally(() => this.warming.delete(id));
    this.warming.set(id, p);
    return p;
  }

  async warmOne(id) {
    {
      try {
        const Type = await this.load(id);
        if (!Type || !this.alive) return;
        // Uma cópia numa cena separada, que nunca é desenhada: vive o efeito inteiro de uma vez (as peças do
        // impacto e do fim também nascem) e é compilada em paralelo. Desenhar uma cena com shader ainda compilando
        // obriga o navegador a esperar — era isso que travava a tela por segundos.
        const ctx = this.warmSystems();
        const copy = new Type(ctx);
        this.warmRoot.add(copy.group);
        copy.spawn(WARM_AT, WARM_DIR, 4);
        for (let t = 0; t < WARM_SECONDS && !copy.isFinished; t += WARM_DT) copy.update(WARM_DT);
        const before = new Set(this.gl.info.programs);
        // O jogo desenha a cena numa imagem intermediária (os efeitos de tela), e não direto na tela: para o three
        // isso é outra versão de cada shader (a saída é linear, não sRGB). Compilar sem isso preparava a versão
        // errada, e o primeiro uso de verdade compilava tudo de novo (medido: 12 shaders, 3 s de tela parada).
        const target = this.warmTarget ??= new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
        const previous = this.gl.getRenderTarget();
        let compiling = null;
        this.gl.setRenderTarget(target);
        try { compiling = this.gl.compileAsync(this.warmRoot, this.camera, this.scene); } catch { /* compila no primeiro uso */ }
        finally { this.gl.setRenderTarget(previous); }
        try { await compiling; } catch { /* compila no primeiro uso */ }
        // Sem compilação paralela (KHR_parallel_shader_compile — falta, por exemplo, numa AMD integrada com Direct3D),
        // o compileAsync só cria os programas e o navegador compila de verdade no primeiro desenho, no meio da luta:
        // medido, 1–2,6 s de tela parada. Aqui cada programa novo é usado agora (getUniforms obriga a terminar a
        // compilação), um por quadro: em vez de um congelamento, pequenos picos antes do efeito precisar existir.
        for (const program of this.gl.info.programs) {
          if (before.has(program) || !this.alive) continue;
          try { program.getUniforms(); } catch { /* erro de shader aparece no primeiro uso, como antes */ }
          await breathe();
        }
        copy.destroy();
        ctx.particles.reset(); ctx.decals.clear(); ctx.fissures.clear(); ctx.bursts.clear(); ctx.lights.reset();
        if (!this.alive) { copy.dispose(); return; }
        // a cópia fica viva: enquanto houver um material usando o programa, ele não é jogado fora
        this.warmed.push(copy);
        // e já deixa uma instância de verdade pronta (os programas agora vêm do cache, sem compilar)
        if (!this.pools.get(id)?.length) this.release(this.instance(id, Type));
        this.ready.add(id);
      } catch (e) {
        console.error('Falha ao preparar o efeito VFX', id, e);
        this.ready.add(id); // não tenta de novo a cada lançamento
      }
    }
  }

  async cast(request) {
    if (!this.alive) return;
    // Nunca lança um efeito "frio": compilar no meio do desenho congelava a tela por segundos (monstros e outros
    // Companions usam efeitos que a barra não aqueceu). Prepara em paralelo e só então mostra — chega um pouco
    // depois na primeira vez, sem travar.
    if (!this.ready.has(request.id)) await this.prepare(request.id);
    if (!this.alive) return;
    const Type = await this.load(request.id);
    if (!Type || !this.alive) return;
    this.pending.push({ Type, request });
    if (this.pending.length > MAX_ACTIVE) this.pending.shift();
  }

  update(dt, width, height) {
    this.time += dt;
    frame.uTime.value = this.time; frame.uDelta.value = dt; frame.uResolution.value.set(width, height);
    frame.uCameraNear.value = this.camera.near; frame.uCameraFar.value = this.camera.far; frame.uSceneDepth.value = this.depth;
    if (dt === 0) return;
    while (this.pending.length) {
      const { Type, request } = this.pending.shift();
      if (this.active.length >= MAX_ACTIVE) this.retire(0);
      const effect = this.instance(request.id, Type);
      effect.spawn(request.origin, new THREE.Vector3(Math.sin(request.yaw), 0, Math.cos(request.yaw)), Math.max(0.5, request.distance));
      this.active.push(effect);
    }
    for (let i = this.active.length - 1; i >= 0; i--) { this.active[i].update(dt); if (this.active[i].isFinished) this.retire(i); }
    this.idle = this.active.length ? 0 : this.idle + dt;
    if (this.idle > 4 && this.classes.size > TRIM_TYPES) this.trim();
    this.particles.flush(); this.decals.update(dt); this.fissures.update(dt); this.bursts.update(dt); this.lights.update(dt);
  }

  retire(i) { const [a] = this.active.splice(i, 1); this.release(a); }

  /** Galeria da Forja: muitos tipos diferentes parados ocupam memória — libera tudo o que não está em uso. */
  trim() {
    for (const list of this.pools.values()) for (const e of list) { e.dispose(); this.root.remove(e.group); }
    this.pools.clear(); this.classes.clear(); this.ready.clear();
    this.particles.dispose();
    this.disposeWarm();
  }

  disposeWarm() {
    for (const e of this.warmed) e.dispose();
    this.warmed.length = 0;
    if (this.warmContext) { const c = this.warmContext; c.particles.dispose(); c.lights.dispose(); c.decals.dispose(); c.fissures.dispose(); c.bursts.dispose(); }
    this.warmContext = null; this.warmRoot = null;
  }

  dispose() {
    this.alive = false; this.pending.length = 0;
    while (this.active.length) this.retire(0);
    for (const list of this.pools.values()) for (const e of list) e.dispose();
    this.pools.clear();
    this.disposeWarm();
    this.particles.dispose(); this.lights.dispose(); this.decals.dispose(); this.fissures.dispose(); this.bursts.dispose(); this.depth.dispose();
    this.warmTarget?.dispose();
    this.root.removeFromParent(); this.camera.layers.mask = this.previousMask;
  }
}
