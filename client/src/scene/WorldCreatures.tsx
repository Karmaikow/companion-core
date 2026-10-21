/**
 * Criaturas andando no Companion World (v0, sem luta ainda). Quem aparece em cada chunk vem de `chunkSpawns`
 * (determinístico); o jeito de andar segue o temperamento: passivo passeia, medroso foge, territorial defende o seu
 * canto e agressivo vem desafiar o Companion (um "!" e a animação de ataque — a batalha entra numa próxima fatia).
 */
import { Suspense, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { chunkSpawns, CHUNK, ARCHETYPES, type CompanionWorld, type CreatureDef, type Spawn } from '@rules';
import { companionFocus, resolveCollisions } from './world';
import { CreatureBody, type CreatureAct } from './Creature';
import { AssetBoundary } from './Biome';

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
  useFrame((_, dtRaw) => {
    const s = st.current, grp = g.current; if (!grp) return;
    const dt = Math.min(dtRaw, 0.1);
    const fx = companionFocus.x, fz = companionFocus.z;
    const dC = Math.hypot(fx - s.x, fz - s.z), dHomeC = Math.hypot(fx - spawn.x, fz - spawn.z);
    let mode: 'wander' | 'chase' | 'flee' | 'face' = 'wander';
    if (def.temperament === 'agressivo' && dC < def.aggroRange) mode = 'chase';
    if (def.temperament === 'territorial' && dHomeC < def.aggroRange * 0.8) mode = 'chase';
    if (def.temperament === 'medroso' && dC < def.aggroRange) mode = 'flee';
    if (def.temperament === 'passivo' && dC < 2.5) mode = 'face';
    let speed = def.speed, want: CreatureAct = 'idle';
    if (mode === 'chase') {
      const stop = 1.4 + R;
      if (dC > stop) { s.tx = fx; s.tz = fz; speed = def.speed * 1.6; } else { s.tx = s.x; s.tz = s.z; }
      want = dC > stop ? 'run' : 'attack';
    } else if (mode === 'flee') {
      const ax = s.x - fx, az = s.z - fz, d = Math.hypot(ax, az) || 1;
      s.tx = s.x + (ax / d) * 4; s.tz = s.z + (az / d) * 4; speed = def.speed * 1.8; want = 'run';
    } else if (mode === 'face') {
      s.tx = s.x; s.tz = s.z; want = 'idle';
      s.yaw = Math.atan2(fx - s.x, fz - s.z);
    } else {
      s.wait -= dt;
      if (s.wait <= 0 && Math.hypot(s.tx - s.x, s.tz - s.z) < 0.2) {
        const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 4;
        s.tx = spawn.x + Math.cos(a) * r; s.tz = spawn.z + Math.sin(a) * r; s.wait = 2 + Math.random() * 5;
      }
    }
    const dx = s.tx - s.x, dz = s.tz - s.z, d = Math.hypot(dx, dz);
    if (d > 0.15) {
      const step = Math.min(d, speed * dt), p = { x: s.x + (dx / d) * step, z: s.z + (dz / d) * step };
      resolveCollisions(p);
      // não sai do mundo nem da área de casa demais (fugindo, vai no máximo 14 m)
      if (Math.hypot(p.x - spawn.x, p.z - spawn.z) < 14) { s.x = p.x; s.z = p.z; } else { s.tx = s.x; s.tz = s.z; }
      const wantYaw = Math.atan2(dx, dz); let dy = wantYaw - s.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      s.yaw += dy * Math.min(1, dt * 6);
      if (want === 'idle') want = 'walk';
    }
    // não ficar em cima do Companion
    if (dC < R + 0.5 && dC > 1e-3) { s.x = fx + ((s.x - fx) / dC) * (R + 0.5); s.z = fz + ((s.z - fz) / dC) * (R + 0.5); }
    grp.position.set(s.x, cw.heightAt(s.x, s.z), s.z);
    grp.rotation.y = s.yaw;
    if (want !== s.act) { s.act = want; setAct(want); }
    const al = mode === 'chase';
    if (al !== s.alert) { s.alert = al; setAlert(al); }
    const nr = dC < 9;
    if (nr !== s.near) { s.near = nr; setNear(nr); }
  });
  return (
    <group ref={g} position={[spawn.x, cw.heightAt(spawn.x, spawn.z), spawn.z]}>
      <CreatureBody def={def} act={act} />
      {near && (
        <Html position={[0, def.size + 0.45, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
          <div className={'creature-tag' + (alert ? ' alert' : '')}>
            {alert && <b>!</b>}{def.name} <small>nv {spawn.level}{spawn.leader && def.archetype === 'ancestral' ? ' · chefe' : ''}</small>
            <i title={ARCHETYPES[def.archetype].hint} />
          </div>
        </Html>
      )}
    </group>
  );
}
