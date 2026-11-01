/**
 * Criaturas andando no Companion World. Lutam com as habilidades da árvore delas (Invocador): sorteio pela frequência
 * entre as abertas no nível, com recarga, aviso no chão e preparação (dá para desviar); sem habilidade possível, golpe
 * simples. Quem aparece em cada chunk vem de `chunkSpawns`
 * (determinístico); o jeito de andar segue o temperamento: passivo passeia, medroso foge, territorial defende o seu
 * canto e agressivo vem desafiar o Companion (um "!" e a animação de ataque — a batalha entra numa próxima fatia).
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { chunkSpawns, CHUNK, ARCHETYPES, creatureStatsAt, creatureSkillsAt, pickCreatureSkill, mitigate, resolveHit, affinity, DEFAULT_SKILLS, ELEMENTS, type CompanionWorld, type CreatureDef, type Spawn, type SkillDef } from '@rules';
import { companionFocus, resolveCollisions } from './world';
import { CreatureBody, type CreatureAct } from './Creature';
import { AssetBoundary } from './Biome';
import { castCreatureSkill, numQueue, skillInput, targets } from './Combat';
import { useChests } from '../chests/chestStore';
import { useSkills } from '../ui/skillState';
import { gameVfx } from './vfx/engine';
import { burst } from './vfx/recipes';
import { hurtCompanion, vitals, companionResting } from './vitals';
import { brain, onKill, say, sayMoment } from './brain';
import { useGame } from '../store';
import { godFlags } from './god';
import { useGod } from '../ui/godMode';

/** Habilidade do catálogo (o publicado na Forja; sem ele, as de exemplo). */
const skillDef = (slug: string): SkillDef | null => useSkills.getState().catalog.find((k) => k.slug === slug) ?? DEFAULT_SKILLS.find((k) => k.slug === slug) ?? null;
/** De que distância a criatura consegue usar a habilidade. */
function reachOf(sk: SkillDef, bodyR: number): number {
  switch (sk.shape) {
    case 'melee': return sk.range + bodyR + 0.6;
    case 'aura': return sk.radius + 0.3;
    case 'circle': case 'leap': return Math.max(sk.range, sk.radius + 1);
    default: return sk.range;
  }
}

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
  const summoned = useGod((g) => g.spawns);
  return (
    <group>
      {[...spawns, ...summoned].map((s) => {
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
  const life = useRef({ hp: stats.vida, dead: 0, provoked: false, atk: 0.8, swing: -1, engaged: false, returning: false, faint: vitals.faintId, dots: [] as { key: string; left: number; dps: number; stacks: number; tick: number }[], casting: 0, cds: {} as Record<string, number> });
  // alcance da melhor habilidade de distância aberta no nível (as atiradoras ficam longe e usam ela)
  const ranged = useMemo(() => Math.max(0, ...creatureSkillsAt(def, spawn.level).map((x) => skillDef(x.slug)).filter((k): k is SkillDef => !!k && k.shape !== 'melee' && k.shape !== 'aura' && k.power > 0).map((k) => k.range)), [def, spawn.level]);
  const [hpPct, setHpPct] = useState(1);
  const [dead, setDead] = useState(false);
  const hurt = useRef(0);
  useEffect(() => {
    const id = 'creature:' + spawn.id;
    targets.set(id, {
      x: spawn.x, z: spawn.z, r: Math.max(0.35, def.size * 0.45),
      creature: { slug: def.slug, name: def.name, level: spawn.level, hostile: () => life.current.engaged || life.current.provoked, hp: () => Math.max(0, life.current.hp / stats.vida) },
      // envenenado acumula até 3 doses (renova o tempo); queimando só renova
      afflict: (key, seconds, dps) => {
        const L = life.current; if (L.dead > 0) return;
        const cur = L.dots.find((d) => d.key === key);
        if (cur) { cur.left = Math.max(cur.left, seconds); if (key === 'envenenado') cur.stacks = Math.min(3, cur.stacks + 1); cur.dps = Math.max(cur.dps, dps); }
        else L.dots.push({ key, left: seconds, dps, stacks: 1, tick: 1 });
        L.provoked = true;
      },
      hit: (damage0, info) => {
        const L = life.current;
        if (L.dead > 0) return 0;
        const damage = godFlags.on ? damage0 * godFlags.dmgMul : damage0;
        // Constelação Viva: física passa pela defesa; mágica pela resistência (sem campo próprio, a criatura usa a
        // defesa — pendência de balanceamento); afinidade da essência e precisão nas fraquezas
        const dealt = info
          ? resolveHit(damage, info, { essence: def.essence, physDefense: stats.defesa, magResist: (stats as { resistencia?: number }).resistencia ?? null }, affinity(info.essence, def.essence), Math.random())
          : mitigate(damage, stats.defesa);
        L.hp -= dealt; L.provoked = true; hurt.current = 0.45;
        setHpPct(Math.max(0, L.hp / stats.vida));
        if (L.hp <= 0) {
          const st2 = st.current, gy = cw.heightAt(st2.x, st2.z), at = new THREE.Vector3(st2.x, gy + def.size * 0.5, st2.z);
          const style = def.essence ? ESSENCE_STYLE[def.essence] : 'impacto';
          // explosão: estouro grande na cor dela + fumaça do estilo + um segundo estouro de névoa
          burst(gameVfx, style, at, def.color, 1.3 + def.size * 0.4, gy);
          gameVfx.after(0.12, () => burst(gameVfx, 'sombra', at.clone().setY(at.y + 0.2), def.color, 0.9, gy));
          L.dead = def.respawn; setDead(true);
          // bestiário (Análise de Partículas), caçada e fala
          onKill(def.slug, def.name);
          void useGame.getState().recordKill(def.slug, spawn.level, { x: st2.x, z: st2.z }).then((r) => {
            // o que caiu foi sorteado no servidor: num baú no chão (online) ou direto na bolsa (offline)
            if (r?.chest) { useChests.getState().add(r.chest); numQueue.push({ pos: at.clone().setY(at.y + 0.6), text: r.chest.crystals ? 'Baú com cristal!' : 'Baú!', kind: 'drop' }); }
            (r?.drops ?? []).forEach((d, i) => numQueue.push({ pos: at.clone().setY(at.y + 0.6 + i * 0.32), text: `+${d.qty} ${d.label}`, kind: 'drop' }));
            if (r?.xp) numQueue.push({ pos: at.clone().setY(at.y + 0.6 + (r.drops?.length ?? 0) * 0.32 + 0.2), text: `+${r.xp} vínculo`, kind: 'drop' });
            if (r?.analyzed) sayMoment('analyzed', { m: def.name }, def.slug);
            else if (r?.first) sayMoment('first-kill', { m: def.name }, def.slug);
            else say('kill', { m: def.name }, { chance: 0.6 });
          });
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
    // medrosa com tiro: provocada, atira de longe e só foge quando chegam perto demais
    if (L.provoked && def.temperament === 'medroso' && ranged > 0 && dC >= Math.min(ranged * 0.45, 3) && dC < def.aggroRange * 2) mode = 'chase';
    // o Companion desmaiou: todo mundo se dispersa e volta para casa (não fica esperando ele levantar). Logo depois de
    // levantar (invencível), ninguém vem brigar por conta própria; só quem for provocado de novo.
    if (L.faint !== vitals.faintId) { L.faint = vitals.faintId; L.engaged = false; L.provoked = false; L.returning = true; L.swing = -1; }
    if (companionResting() && (vitals.down > 0 || !L.provoked)) { if (mode === 'chase') mode = 'wander'; L.engaged = false; }
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
    for (const k in L.cds) L.cds[k] -= dt;
    if (mode === 'chase') {
      const melee = 1.4 + R;
      // quem luta de longe para no alcance da sua habilidade de distância
      const stop = def.style === 'distancia' && ranged > 0 ? Math.max(melee, Math.min(ranged * 0.75, def.aggroRange)) : melee;
      if (dC > stop && L.casting <= 0) { s.tx = fx; s.tz = fz; speed = def.speed * 1.6; } else { s.tx = s.x; s.tz = s.z; }
      want = dC > stop ? 'run' : 'attack';
      L.atk -= dt;
      if (L.casting > 0) {
        // preparando uma habilidade: parada, virada para o alvo
        L.casting -= dt; want = 'attack';
      } else if (L.atk <= 0 && skillInput.body && !companionResting()) {
        // a próxima habilidade pela frequência (entre as abertas no nível); se não der (recarga, longe), golpe simples
        const slug = pickCreatureSkill(def, Math.random(), spawn.level);
        const sk = slug ? skillDef(slug) : null;
        if (sk && (L.cds[sk.slug] ?? 0) <= 0 && dC <= reachOf(sk, R) && (sk.power > 0 || sk.heal > 0)) {
          s.yaw = Math.atan2(fx - s.x, fz - s.z);
          const color = def.essence ? ELEMENTS[def.essence].glow : def.color;
          const windup = castCreatureSkill({
            skill: sk, from: { x: s.x, z: s.z }, yaw: s.yaw, target: { x: fx, z: fz }, size: def.size, color, heightAt: cw.heightAt,
            // dano: o poder da criatura na escala da habilidade (o golpe básico, poder 30, vale 1×)
            damage: sk.power > 0 ? Math.max(1, Math.round(stats.poder * (sk.power / 30))) : 0,
            heal: sk.heal > 0 ? Math.round(stats.vida * Math.min(0.4, sk.heal / 300)) : 0,
            onHeal: (n) => { L.hp = Math.min(stats.vida, L.hp + n); setHpPct(Math.max(0, L.hp / stats.vida)); },
            alive: () => L.dead <= 0 && !companionResting(),
          });
          L.casting = windup + 0.25;
          L.cds[sk.slug] = Math.max(sk.cooldown, 1 / Math.max(0.1, stats.atkSpeed));
          L.atk = 1 / Math.max(0.1, stats.atkSpeed);
          want = 'attack';
        } else if (dC <= melee + 0.1) {
          // golpe no Companion no ritmo da velocidade de ataque (só com corpo 3D; a defesa segurada corta 75%)
          L.atk = 1 / Math.max(0.1, stats.atkSpeed); L.swing = 0.28; s.yaw = Math.atan2(fx - s.x, fz - s.z);
        }
      }
      if (L.swing > 0) {
        L.swing -= dt;
        if (L.swing <= 0) {
          L.swing = -1;
          if (Math.hypot(companionFocus.x - s.x, companionFocus.z - s.z) <= melee + 0.7) {
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
      resolveCollisions(p, R);
      // fugindo, vai no máximo 20 m de casa; perseguindo ou voltando, sem limite
      if (mode !== 'flee' || Math.hypot(p.x - spawn.x, p.z - spawn.z) < 20) { s.x = p.x; s.z = p.z; } else { s.tx = s.x; s.tz = s.z; }
      const wantYaw = Math.atan2(dx, dz); let dy = wantYaw - s.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      s.yaw += dy * Math.min(1, dt * 6);
      if (want === 'idle') want = 'walk';
    }
    // não ficar em cima do Companion
    if (dC < R + 0.5 && dC > 1e-3) { s.x = fx + ((s.x - fx) / dC) * (R + 0.5); s.z = fz + ((s.z - fz) / dC) * (R + 0.5); }
    // e sempre fora das pedras e árvores (nasceu, parou ou foi empurrada para dentro de uma) — por último, para valer
    { const q = { x: s.x, z: s.z }; if (resolveCollisions(q, R)) { s.x = q.x; s.z = q.z; } }
    grp.position.set(s.x, cw.heightAt(s.x, s.z), s.z);
    grp.rotation.y = s.yaw;
    const tg = targets.get('creature:' + spawn.id); if (tg) { tg.x = s.x; tg.z = s.z; }
    if (hurt.current > 0) { hurt.current -= dt; want = 'hurt'; }
    if (want !== s.act) { s.act = want; setAct(want); }
    const al = mode === 'chase';
    if (al !== s.alert) { s.alert = al; setAlert(al); }
    const nr = dC < 9;
    // primeira vez que ela vê esta espécie (na sessão): comenta; nunca derrotada = "nunca vi isso"
    if (dC < 7 && !brain.seen.has(def.slug)) {
      brain.seen.add(def.slug);
      const known = useGame.getState().snap?.bestiary?.some((e) => e.slug === def.slug);
      if (known) say('see-known', { m: def.name }, { chance: 0.5 }); else sayMoment('see-new', { m: def.name }, def.slug);
    }
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
