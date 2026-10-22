/**
 * Criaturas andando no Companion World (v0, sem luta ainda). Quem aparece em cada chunk vem de `chunkSpawns`
 * (determinístico); o jeito de andar segue o temperamento: passivo passeia, medroso foge, territorial defende o seu
 * canto e agressivo vem desafiar o Companion (um "!" e a animação de ataque — a batalha entra numa próxima fatia).
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { chunkSpawns, CHUNK, ARCHETYPES, creatureStatsAt, mitigate, rollDrops, type CompanionWorld, type CreatureDef, type Spawn } from '@rules';
import { companionFocus, resolveCollisions } from './world';
import { CreatureBody, type CreatureAct } from './Creature';
import { AssetBoundary } from './Biome';
import { numQueue, skillInput, targets } from './Combat';
import { gameVfx } from './vfx/engine';
import { burst } from './vfx/recipes';
import { hurtCompanion } from './vitals';

const ESSENCE_STYLE: Record<string, string> = { fogo: 'chamas', agua: 'gotas', terra: 'pedras', vento: 'vento', luz: 'luz', sombra: 'sombra', gelo: 'gelo', raio: 'raios', natureza: 'folhas', veneno: 'veneno' };

export function WorldCreatures({ cw, creatures, center, night, high }: { cw: CompanionWorld; creatures: CreatureDef[]; center: [number, number]; night: boolean; high: boolean }) {
  const bySlug = useMemo(() => new Map(creatures.map((c) => [c.slug, c])), [creatures]);
  const spawns = useMemo(() => {
    const R = high ? 3 : 2, out: Spawn[] = [];
    const biomeAt = (x: number, z: number) => cw.biomes[cw.regionAt(x, z).site.biome].slug;
    const blocked = (x: number, z: number) => { const h = cw.regionAt(x, z); return cw.dirtAt(x, z) > 0.35 || Math.hypot(x - h.site.x, z - h.site.z) < (h.site.home ? 14 : 5); };
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) out.push(...chunkSpawns(cw.seed + 17, center[0] + dx, center[1] + dz, CHUNK, creatures, biomeAt, blocked, night));
    return out;
  }, [cw, creatures, center, night, high]);
  return (
    <group>
      {spawns.map((s) => {
        const def = bySlug.get(s.slug);
        return def ? <AssetBoundary key={s.id + s.slug}><Suspense fallback={null}><WorldCreature cw={cw} def={def} spawn={s} /></Suspense></AssetBoundary> : null;
      })}
    </group>
  );
}

function WorldCreature({ cw, def, spawn }: { cw: CompanionWorld; def: CreatureDef; spawn: Spawn }) {
  const g = useRef<THREE.Group>(null);
  const [act, setAct] = useState<CreatureAct>('idle');
  const [alert, setAlert] = useState(false);
  const [near, setNear] = useState(false);
  const st = useRef({ x: spawn.x, z: spawn.z, tx: spawn.x, tz: spawn.z, yaw: Math.random() * 6.28, wait: Math.random() * 3, act: 'idle' as CreatureAct, alert: false, near: false, ph: Math.random() * 10 });
  const R = Math.max(0.25, def.size * 0.35);
  // vida no nível dela; os golpes do Companion descontam a defesa. Zerou: explode em névoa e volta depois de um tempo.
  const stats = useMemo(() => creatureStatsAt(def, spawn.level), [def, spawn.level]);
  const life = useRef({ hp: stats.vida, dead: 0, provoked: false, atk: 0.8, swing: -1, engaged: false, returning: false, dots: [] as { key: string; left: number; dps: number; stacks: number; tick: number }[] });
  const [hpPct, setHpPct] = useState(1);
  const [dead, setDead] = useState(false);
  const hurt = useRef(0);
  useEffect(() => {
    const id = 'creature:' + spawn.id;
    targets.set(id, {
      x: spawn.x, z: spawn.z, r: Math.max(0.35, def.size * 0.45),
      // envenenado acumula até 3 doses (renova o tempo); queimando só renova
      afflict: (key, seconds, dps) => {
        const L = life.current; if (L.dead > 0) return;
        const cur = L.dots.find((d) => d.key === key);
        if (cur) { cur.left = Math.max(cur.left, seconds); if (key === 'envenenado') cur.stacks = Math.min(3, cur.stacks + 1); cur.dps = Math.max(cur.dps, dps); }
        else L.dots.push({ key, left: seconds, dps, stacks: 1, tick: 1 });
        L.provoked = true;
      },
      hit: (damage) => {
        const L = life.current;
        if (L.dead > 0) return 0;
        const dealt = mitigate(damage, stats.defesa);
        L.hp -= dealt; L.provoked = true; hurt.current = 0.45;
        setHpPct(Math.max(0, L.hp / stats.vida));
        if (L.hp <= 0) {
          const st2 = st.current, gy = cw.heightAt(st2.x, st2.z), at = new THREE.Vector3(st2.x, gy + def.size * 0.5, st2.z);
          const style = def.essence ? ESSENCE_STYLE[def.essence] : 'impacto';
          // explosão: estouro grande na cor dela + fumaça do estilo + um segundo estouro de névoa
          burst(gameVfx, style, at, def.color, 1.3 + def.size * 0.4, gy);
          gameVfx.after(0.12, () => burst(gameVfx, 'sombra', at.clone().setY(at.y + 0.2), def.color, 0.9, gy));
          rollDrops(def, Math.random).forEach((d, i) => numQueue.push({ pos: at.clone().setY(at.y + 0.6 + i * 0.32), text: `+${d.qty} ${d.item}`, kind: 'drop' }));
          L.dead = def.respawn; setDead(true);
          const tg = targets.get(id); if (tg) tg.r = -99; // fora do alcance enquanto não volta
        }
        return dealt;
      },
    });
    return () => { targets.delete(id); };
  }, [spawn.id, spawn.x, spawn.z, def, stats, cw]);
  useFrame((_, dtRaw) => {
    const s = st.current, grp = g.current; if (!grp) return;
    const dt = Math.min(dtRaw, 0.1);
    const L = life.current;
    // dano por segundo (veneno, fogo): número na cor do estado e a nuvem saindo do corpo
    if (L.dead <= 0 && L.dots.length) {
      for (const d of L.dots) {
        d.left -= dt; d.tick -= dt;
        if (d.tick <= 0 && d.left > -0.01) {
          d.tick = 1;
          const tg = targets.get('creature:' + spawn.id);
          const dmg = d.dps * d.stacks, at = new THREE.Vector3(s.x, cw.heightAt(s.x, s.z) + def.size * 0.6, s.z);
          const dealt = tg ? tg.hit(dmg) : 0; // passa pela vida (desconta a defesa; pode derrotar)
          if (typeof dealt === 'number' && dealt > 0) numQueue.push({ pos: at.clone().setY(at.y + 0.5), text: String(dealt), kind: d.key === 'envenenado' ? 'poison' : 'burn' });
          burst(gameVfx, d.key === 'envenenado' ? 'veneno' : 'chamas', at, d.key === 'envenenado' ? '#b45cff' : '#ff7a3d', 0.3, cw.heightAt(s.x, s.z));
        }
      }
      L.dots = L.dots.filter((d) => d.left > 0);
    }
    if (L.dead > 0) {
      L.dots = [];
      L.dead -= dt;
      if (L.dead <= 0) {
        L.dead = 0; L.hp = stats.vida; L.provoked = false; s.x = spawn.x; s.z = spawn.z; s.tx = spawn.x; s.tz = spawn.z;
        setHpPct(1); setDead(false);
        const tg = targets.get('creature:' + spawn.id); if (tg) tg.r = Math.max(0.35, def.size * 0.45);
        burst(gameVfx, 'luz', new THREE.Vector3(s.x, cw.heightAt(s.x, s.z) + 0.4, s.z), def.color, 0.6, cw.heightAt(s.x, s.z));
      }
      return;
    }
    const fx = companionFocus.x, fz = companionFocus.z;
    const dC = Math.hypot(fx - s.x, fz - s.z), dHomeC = Math.hypot(fx - spawn.x, fz - spawn.z);
    let mode: 'wander' | 'chase' | 'flee' | 'face' = 'wander';
    if (def.temperament === 'agressivo' && dC < def.aggroRange) mode = 'chase';
    if (def.temperament === 'territorial' && dHomeC < def.aggroRange * 0.8) mode = 'chase';
    if (def.temperament === 'medroso' && dC < def.aggroRange) mode = 'flee';
    if (def.temperament === 'passivo' && dC < 2.5) mode = 'face';
    if (L.provoked && dC < def.aggroRange * 1.6 && def.temperament !== 'medroso') mode = 'chase'; // provocado: vem brigar
    // Perseguição sem coleira: quem começou a brigar segue o Companion para onde for (inclusive para fora do bioma) e só
    // desiste quando ele se afasta bem; aí volta para casa recuperando a vida. Antes ficava parado a 14 m de casa
    // apanhando no limite.
    if (mode === 'chase') { L.engaged = true; L.returning = false; }
    else if (L.engaged && def.temperament !== 'medroso') {
      if (dC > def.aggroRange * 2.5) { L.engaged = false; L.provoked = false; L.returning = true; }
      else mode = 'chase';
    }
    if (L.provoked && dC > def.aggroRange * 2.5) L.provoked = false;
    const dHome = Math.hypot(s.x - spawn.x, s.z - spawn.z);
    if (mode !== 'chase' && mode !== 'flee' && dHome > 8) L.returning = true;
    if (L.returning) {
      if (mode === 'chase') L.returning = false;
      else if (dHome < 1.2) L.returning = false;
      else {
        mode = 'wander'; s.tx = spawn.x; s.tz = spawn.z; s.wait = 1;
        L.hp = Math.min(stats.vida, L.hp + stats.vida * 0.25 * dt); // recupera voltando
        if (L.hp >= stats.vida) setHpPct(1);
      }
    }
    let speed = L.returning ? def.speed * 1.4 : def.speed, want: CreatureAct = 'idle';
    if (mode === 'chase') {
      const stop = 1.4 + R;
      if (dC > stop) { s.tx = fx; s.tz = fz; speed = def.speed * 1.6; } else { s.tx = s.x; s.tz = s.z; }
      want = dC > stop ? 'run' : 'attack';
      // golpe no Companion no ritmo da velocidade de ataque (só com corpo 3D; a defesa segurada corta 75%)
      L.atk -= dt;
      if (dC <= stop + 0.1 && L.atk <= 0 && skillInput.body) { L.atk = 1 / Math.max(0.1, stats.atkSpeed); L.swing = 0.28; s.yaw = Math.atan2(fx - s.x, fz - s.z); }
      if (L.swing > 0) {
        L.swing -= dt;
        if (L.swing <= 0) {
          L.swing = -1;
          if (Math.hypot(companionFocus.x - s.x, companionFocus.z - s.z) <= stop + 0.7) {
            const got = hurtCompanion(stats.poder);
            if (got > 0) {
              const cy = companionFocus.y;
              numQueue.push({ pos: new THREE.Vector3(companionFocus.x, cy + 1.3, companionFocus.z), text: '-' + got, kind: 'hurt' });
              burst(gameVfx, 'impacto', new THREE.Vector3(companionFocus.x, cy + 0.7, companionFocus.z), def.color, 0.4, cy);
            }
          }
        }
      }
    } else if (mode === 'flee') {
      const ax = s.x - fx, az = s.z - fz, d = Math.hypot(ax, az) || 1;
      s.tx = s.x + (ax / d) * 4; s.tz = s.z + (az / d) * 4; speed = def.speed * 1.8; want = 'run';
    } else if (mode === 'face') {
      s.tx = s.x; s.tz = s.z; want = 'idle';
      s.yaw = Math.atan2(fx - s.x, fz - s.z);
    } else {
      s.wait -= dt;
      if (!L.returning && s.wait <= 0 && Math.hypot(s.tx - s.x, s.tz - s.z) < 0.2) {
        const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 4;
        s.tx = spawn.x + Math.cos(a) * r; s.tz = spawn.z + Math.sin(a) * r; s.wait = 2 + Math.random() * 5;
      }
    }
    const dx = s.tx - s.x, dz = s.tz - s.z, d = Math.hypot(dx, dz);
    if (d > 0.15) {
      const step = Math.min(d, speed * dt), p = { x: s.x + (dx / d) * step, z: s.z + (dz / d) * step };
      resolveCollisions(p);
      // fugindo, vai no máximo 20 m de casa; perseguindo ou voltando, sem limite
      if (mode !== 'flee' || Math.hypot(p.x - spawn.x, p.z - spawn.z) < 20) { s.x = p.x; s.z = p.z; } else { s.tx = s.x; s.tz = s.z; }
      const wantYaw = Math.atan2(dx, dz); let dy = wantYaw - s.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      s.yaw += dy * Math.min(1, dt * 6);
      if (want === 'idle') want = 'walk';
    }
    // não ficar em cima do Companion
    if (dC < R + 0.5 && dC > 1e-3) { s.x = fx + ((s.x - fx) / dC) * (R + 0.5); s.z = fz + ((s.z - fz) / dC) * (R + 0.5); }
    grp.position.set(s.x, cw.heightAt(s.x, s.z), s.z);
    grp.rotation.y = s.yaw;
    const tg = targets.get('creature:' + spawn.id); if (tg) { tg.x = s.x; tg.z = s.z; }
    if (hurt.current > 0) { hurt.current -= dt; want = 'hurt'; }
    if (want !== s.act) { s.act = want; setAct(want); }
    const al = mode === 'chase';
    if (al !== s.alert) { s.alert = al; setAlert(al); }
    const nr = dC < 9;
    if (nr !== s.near) { s.near = nr; setNear(nr); }
  });
  return (
    <group ref={g} position={[spawn.x, cw.heightAt(spawn.x, spawn.z), spawn.z]} visible={!dead}>
      {!dead && <CreatureBody def={def} act={act} />}
      {near && !dead && (
        <Html position={[0, def.size + 0.45, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
          <div className={'creature-tag' + (alert ? ' alert' : '')}>
            {alert && <b>!</b>}{def.name} <small>nv {spawn.level}{spawn.leader && def.archetype === 'ancestral' ? ' · chefe' : ''}</small>
            <i title={ARCHETYPES[def.archetype].hint} />
            {hpPct < 1 && <span className="hpbar" aria-label={`vida ${Math.round(hpPct * 100)}%`}><i style={{ width: hpPct * 100 + '%' }} /></span>}
          </div>
        </Html>
      )}
    </group>
  );
}
