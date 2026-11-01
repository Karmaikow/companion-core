/**
 * Barra de atalhos com 9 espaços para as habilidades abertas na árvore. Teclas 1–9 ou toque no espaço.
 * Espaço vazio: toque para escolher a habilidade. Botão direito (ou segurar no celular): tirar da barra.
 * A recarga aparece como um relógio escurecendo o ícone, com os segundos que faltam.
 */
import { SkillIcon } from './SkillIcon';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTouchLandscape } from './TouchControls';
import { ELEMENTS, RANK_COOLDOWN, SHAPES, SKILL_CHARGE_MAX, skillCharge, skillChargeMultiplier, type SkillDef } from '@rules';
import { castSkill } from '../build/combatStats';
import { useGame } from '../store';
import { requestSkill, skillChargeState, skillInput } from '../scene/Combat';
import { BAR_SIZE, saveBar, useSkillData, useSkills } from './skillState';
import { canAct, spendSp, useVitals } from '../scene/vitals';
import { godFlags } from '../scene/god';


function colorOf(s: SkillDef, companion: string): string {
  if (s.vfx.color === 'companion') return companion;
  if (s.vfx.color === 'essence') return s.essence ? ELEMENTS[s.essence].glow : companion;
  return s.vfx.color;
}

const cooldownOf = (s: SkillDef, level: number) => Math.max(0.3, s.cooldown * (1 - RANK_COOLDOWN * (level - 1)));

export function SkillBar({ color }: { color: string }) {
  const { companion, unlocked } = useSkillData();
  const bar = useSkills((s) => s.bar), removed = useSkills((s) => s.removed), ready = useSkills((s) => s.ready);
  const [pick, setPick] = useState<number | null>(null);
  const [now, setNow] = useState(() => performance.now());
  const [flash, setFlash] = useState<number | null>(null);
  const [short, setShort] = useState<number | null>(null);
  const sp = useVitals((v) => v.sp);
  const touch = useTouchLandscape();
  const toast = useGame((s) => s.toast);
  const hold = useRef<number | null>(null), longPress = useRef(false), touchAt = useRef(0);

  // relógio da recarga: só anima enquanto alguma habilidade está recarregando
  const waiting = Object.values(ready).some((t) => t > now);
  useEffect(() => {
    if (!waiting) return;
    let raf = 0;
    const tick = () => { setNow(performance.now()); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [waiting]);

  const info = (slug: string | null) => (slug ? unlocked.find((u) => u.skill.slug === slug) ?? null : null);

  /** `held`: segundos segurando Shift + número (concentração: dano extra até 2,5 s). */
  const cast = (i: number, held = 0) => {
    const slug = useSkills.getState().bar[i];
    const u = info(slug);
    if (!u) { setPick(i); return; }
    const t = performance.now(), at = useSkills.getState().ready[u.skill.slug] ?? 0;
    if (at > t) return;
    if (!skillInput.body) { toast('As habilidades precisam do corpo 3D do Companion (a Fábrica cria o modelo).', 'warn'); return; }
    if (!canAct()) return;
    // Constelação Viva: custo (afinidade, Canal Profundo) e preparação (Agilidade, Ressonância) congelados agora
    const frozen = castSkill(u.skill, u.mult);
    const mult = skillChargeMultiplier(held);
    if (mult > 1 && frozen.damage > 0) { frozen.damage = Math.round(frozen.damage * mult); toast(`${u.skill.name} concentrada: ×${mult.toFixed(2).replace('.', ',')} de dano`, 'gold'); }
    if (!spendSp(frozen.cost)) { setShort(i); window.setTimeout(() => setShort((f) => (f === i ? null : f)), 500); return; }
    requestSkill({ skill: u.skill, level: u.level, color: colorOf(u.skill, color), frozen });
    useSkills.getState().setReady(u.skill.slug, godFlags.on ? 0 : t + (cooldownOf(u.skill, u.level) + frozen.windup) * 1000);
    setNow(t); setFlash(i); window.setTimeout(() => setFlash((f) => (f === i ? null : f)), 180);
  };
  const castRef = useRef(cast); castRef.current = cast;
  // concentração (Shift + número)
  const charging = useRef<{ slot: number; t0: number } | null>(null);
  const [chargingView, setCharging] = useState<{ slot: number; k: number } | null>(null);
  const readyRef = useRef<(i: number) => { color: string } | null>(() => null);
  readyRef.current = (i: number) => {
    const u = info(useSkills.getState().bar[i]);
    if (!u || !skillInput.body || !canAct()) return null;
    if ((useSkills.getState().ready[u.skill.slug] ?? 0) > performance.now()) return null;
    if (castSkill(u.skill, 1).cost > useVitals.getState().sp) return null;
    return { color: colorOf(u.skill, color) };
  };
  const readyToCast = (i: number) => readyRef.current(i);

  useEffect(() => {
    const typing = () => { const el = document.activeElement; return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable); };
    const slotOf = (e: KeyboardEvent) => { const n = /^Digit([1-9])$/.exec(e.code)?.[1] ?? /^Numpad([1-9])$/.exec(e.code)?.[1] ?? (/^[1-9]$/.test(e.key) ? e.key : null); return n ? Number(n) - 1 : null; };
    let raf = 0;
    const stopCharge = () => { cancelAnimationFrame(raf); charging.current = null; skillChargeState.active = false; setCharging(null); };
    const down = (e: KeyboardEvent) => {
      if (typing() || e.ctrlKey || e.metaKey || e.altKey) return;
      const i = slotOf(e);
      if (i === null) return;
      e.preventDefault();
      if (e.repeat) return;
      // Shift + número: concentra enquanto o número estiver apertado; solta para lançar com dano extra
      if (e.shiftKey) {
        const ok = readyToCast(i);
        if (!ok) { castRef.current(i); return; }
        charging.current = { slot: i, t0: performance.now() };
        skillChargeState.active = true; skillChargeState.color = ok.color; skillChargeState.charge = 0; skillChargeState.perfect = false;
        setCharging({ slot: i, k: 0 });
        const tick = () => {
          const c = charging.current; if (!c) return;
          const sec = (performance.now() - c.t0) / 1000, k = skillCharge(sec);
          skillChargeState.charge = k; skillChargeState.perfect = sec >= SKILL_CHARGE_MAX;
          if (!canAct()) { stopCharge(); return; }
          setCharging({ slot: c.slot, k });
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return;
      }
      castRef.current(i);
    };
    const up = (e: KeyboardEvent) => {
      const i = slotOf(e), c = charging.current;
      if (i === null || !c || c.slot !== i) return;
      const sec = (performance.now() - c.t0) / 1000;
      stopCharge();
      castRef.current(i, sec);
    };
    const blur = () => { if (charging.current) stopCharge(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); stopCharge(); };
  }, []);

  if (!companion) return null;
  const put = (i: number, slug: string) => {
    const slots = bar.map((s) => (s === slug ? null : s)); slots[i] = slug;
    saveBar(companion.id, slots, removed.filter((r) => r !== slug)); setPick(null);
  };
  const clear = (i: number) => {
    const slug = bar[i]; if (!slug) return;
    const slots = [...bar]; slots[i] = null;
    saveBar(companion.id, slots, [...new Set([...removed, slug])]);
  };
  const free = unlocked.filter((u) => !bar.includes(u.skill.slug));
  // no celular deitado o painel abre no meio da tela (fora da barra, que fica no canto)
  const wrapPick = (el: React.ReactElement) => (touch ? createPortal(<div className="sb-pick-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setPick(null); }}>{el}</div>, document.body) : el);

  return (
    <div className="skill-bar" role="toolbar" aria-label="Habilidades (teclas 1 a 9)">
      {pick !== null && wrapPick(
        <div className={'sb-pick' + (touch ? ' float' : '')} role="dialog" aria-label={`Escolher habilidade para o espaço ${pick + 1}`}>
          <header><b>Espaço {pick + 1}</b><button className="link" onClick={() => setPick(null)} aria-label="Fechar">✕</button></header>
          {unlocked.length === 0 && <p>Nenhuma habilidade aberta ainda. Distribua pontos na árvore (aba Habilidades).</p>}
          {unlocked.map((u) => (
            <button key={u.skill.slug} className={bar.includes(u.skill.slug) ? 'in' : ''} onClick={() => put(pick, u.skill.slug)}>
              <span aria-hidden style={{ background: colorOf(u.skill, color) }}><SkillIcon skill={u.skill} size={40} color={color} /></span>
              <b>{u.skill.name}{u.level > 1 ? ` +${u.level - 1}` : ''}</b>
              <small>{SHAPES[u.skill.shape]} · recarga {cooldownOf(u.skill, u.level).toFixed(1).replace('.0', '')}s{bar.includes(u.skill.slug) ? ` · no espaço ${bar.indexOf(u.skill.slug) + 1}` : ''}</small>
            </button>
          ))}
          {pick !== null && bar[pick] && <button className="sb-clear" onClick={() => { clear(pick); setPick(null); }}>Tirar da barra</button>}
        </div>,
      )}
      {Array.from({ length: BAR_SIZE }, (_, i) => {
        const u = info(bar[i]);
        const left = u ? Math.max(0, (ready[u.skill.slug] ?? 0) - now) : 0;
        const total = u ? (cooldownOf(u.skill, u.level) + u.skill.windup) * 1000 : 1;
        const frac = Math.min(1, left / total);
        return (
          <button key={i} className={'sb-slot' + (u ? '' : ' empty') + (left > 0 ? ' cd' : '') + (flash === i ? ' fire' : '') + (pick === i ? ' sel' : '') + (short === i ? ' short' : '') + (chargingView?.slot === i ? ' charging' : '') + (u && u.skill.energy > sp ? ' nosp' : '')}
            title={u ? `${u.skill.name} — ${u.skill.description} (SP ${castSkill(u.skill, 1).cost})` : free.length ? 'Escolher habilidade' : 'Espaço livre'}
            aria-label={u ? `${i + 1}: ${u.skill.name}${left > 0 ? `, recarregando ${Math.ceil(left / 1000)} s` : ''}` : `${i + 1}: vazio`}
            style={u ? { ['--sk' as string]: colorOf(u.skill, color) } : undefined}
            onClick={() => { if (performance.now() - touchAt.current < 800) return; if (longPress.current) { longPress.current = false; return; } cast(i); }}
            onContextMenu={(e) => { e.preventDefault(); if (touch) return; if (u) clear(i); else setPick(i); }}
            onPointerDown={() => { longPress.current = false; hold.current = window.setTimeout(() => { hold.current = null; longPress.current = true; setPick(i); }, 550); }}
            onPointerUp={(e) => {
              // toque: lança ao soltar o dedo (o navegador não gera "clique" quando outro dedo está no joystick)
              if (e.pointerType !== 'mouse') { touchAt.current = performance.now(); if (hold.current && !longPress.current) cast(i); }
              if (hold.current) window.clearTimeout(hold.current); hold.current = null;
            }}
            onPointerLeave={() => { if (hold.current) window.clearTimeout(hold.current); hold.current = null; }}>
            <kbd>{i + 1}</kbd>
            {u ? <span className="sb-icon" aria-hidden><SkillIcon skill={u.skill} size={40} color={color} /></span> : <span className="sb-plus" aria-hidden>{free.length ? '+' : ''}</span>}
            {u && u.level > 1 && <em>+{u.level - 1}</em>}
            {chargingView?.slot === i && <span className="sb-charge" style={{ ['--k' as string]: chargingView.k }} aria-hidden><b>{chargingView.k >= 1 ? 'MÁX' : `×${(1 + chargingView.k).toFixed(1).replace('.', ',')}`}</b></span>}
            {left > 0 && <span className="sb-cd" style={{ ['--f' as string]: frac }}><b>{left > 1000 ? Math.ceil(left / 1000) : (left / 1000).toFixed(1)}</b></span>}
          </button>
        );
      })}
    </div>
  );
}
