/**
 * Barra de atalhos com 9 espaços para as habilidades abertas na árvore. Teclas 1–9 ou toque no espaço.
 * Espaço vazio: toque para escolher a habilidade. Botão direito (ou segurar no celular): tirar da barra.
 * A recarga aparece como um relógio escurecendo o ícone, com os segundos que faltam.
 */
import { HudGlyph } from './HudGlyph';
import { useEffect, useRef, useState } from 'react';
import { ELEMENTS, RANK_COOLDOWN, SHAPES, type SkillDef } from '@rules';
import { useGame } from '../store';
import { requestSkill, skillInput } from '../scene/Combat';
import { BAR_SIZE, saveBar, useSkillData, useSkills } from './skillState';
import { canAct, spendSp, useVitals } from '../scene/vitals';

const ICON: Record<string, string> = { impacto: '💥', chamas: '🔥', gotas: '💧', folhas: '🍃', pedras: '🪨', gelo: '❄️', raios: '⚡', vento: '🌪️', luz: '✨', sombra: '🌑', faiscas: '🎆', veneno: '🧪' };

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
  const toast = useGame((s) => s.toast);
  const hold = useRef<number | null>(null), longPress = useRef(false);

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

  const cast = (i: number) => {
    const slug = useSkills.getState().bar[i];
    const u = info(slug);
    if (!u) { setPick(i); return; }
    const t = performance.now(), at = useSkills.getState().ready[u.skill.slug] ?? 0;
    if (at > t) return;
    if (!skillInput.body) { toast('As habilidades precisam do corpo 3D do Companion (a Fábrica cria o modelo).', 'warn'); return; }
    if (!canAct()) return;
    if (!spendSp(u.skill.energy)) { setShort(i); window.setTimeout(() => setShort((f) => (f === i ? null : f)), 500); return; }
    requestSkill({ skill: u.skill, level: u.level, color: colorOf(u.skill, color) });
    useSkills.getState().setReady(u.skill.slug, t + (cooldownOf(u.skill, u.level) + u.skill.windup) * 1000);
    setNow(t); setFlash(i); window.setTimeout(() => setFlash((f) => (f === i ? null : f)), 180);
  };
  const castRef = useRef(cast); castRef.current = cast;

  useEffect(() => {
    const typing = () => { const el = document.activeElement; return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable); };
    const down = (e: KeyboardEvent) => {
      if (typing() || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const n = /^Digit([1-9])$/.exec(e.code)?.[1] ?? (/^[1-9]$/.test(e.key) ? e.key : null);
      if (!n) return;
      e.preventDefault(); castRef.current(Number(n) - 1);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
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

  return (
    <div className="skill-bar" role="toolbar" aria-label="Habilidades (teclas 1 a 9)">
      {pick !== null && (
        <div className="sb-pick" role="dialog" aria-label={`Escolher habilidade para o espaço ${pick + 1}`}>
          <header><b>Espaço {pick + 1}</b><button className="link" onClick={() => setPick(null)} aria-label="Fechar">✕</button></header>
          {unlocked.length === 0 && <p>Nenhuma habilidade aberta ainda. Distribua pontos na árvore (aba Habilidades).</p>}
          {unlocked.map((u) => (
            <button key={u.skill.slug} className={bar.includes(u.skill.slug) ? 'in' : ''} onClick={() => put(pick, u.skill.slug)}>
              <span aria-hidden style={{ background: colorOf(u.skill, color) }}><HudGlyph kind={u.skill.vfx.style} /></span>
              <b>{u.skill.name}{u.level > 1 ? ` +${u.level - 1}` : ''}</b>
              <small>{SHAPES[u.skill.shape]} · recarga {cooldownOf(u.skill, u.level).toFixed(1).replace('.0', '')}s{bar.includes(u.skill.slug) ? ` · no espaço ${bar.indexOf(u.skill.slug) + 1}` : ''}</small>
            </button>
          ))}
          {pick !== null && bar[pick] && <button className="sb-clear" onClick={() => { clear(pick); setPick(null); }}>Tirar da barra</button>}
        </div>
      )}
      {Array.from({ length: BAR_SIZE }, (_, i) => {
        const u = info(bar[i]);
        const left = u ? Math.max(0, (ready[u.skill.slug] ?? 0) - now) : 0;
        const total = u ? (cooldownOf(u.skill, u.level) + u.skill.windup) * 1000 : 1;
        const frac = Math.min(1, left / total);
        return (
          <button key={i} className={'sb-slot' + (u ? '' : ' empty') + (left > 0 ? ' cd' : '') + (flash === i ? ' fire' : '') + (pick === i ? ' sel' : '') + (short === i ? ' short' : '') + (u && u.skill.energy > sp ? ' nosp' : '')}
            title={u ? `${u.skill.name} — ${u.skill.description} (SP ${u.skill.energy})` : free.length ? 'Escolher habilidade' : 'Espaço livre'}
            aria-label={u ? `${i + 1}: ${u.skill.name}${left > 0 ? `, recarregando ${Math.ceil(left / 1000)} s` : ''}` : `${i + 1}: vazio`}
            style={u ? { ['--sk' as string]: colorOf(u.skill, color) } : undefined}
            onClick={() => { if (longPress.current) { longPress.current = false; return; } cast(i); }}
            onContextMenu={(e) => { e.preventDefault(); if (u) clear(i); else setPick(i); }}
            onPointerDown={() => { longPress.current = false; hold.current = window.setTimeout(() => { hold.current = null; longPress.current = true; setPick(i); }, 550); }}
            onPointerUp={() => { if (hold.current) window.clearTimeout(hold.current); hold.current = null; }}
            onPointerLeave={() => { if (hold.current) window.clearTimeout(hold.current); hold.current = null; }}>
            <kbd>{i + 1}</kbd>
            {u ? <span className="sb-icon" aria-hidden><HudGlyph kind={u.skill.vfx.style} /></span> : <span className="sb-plus" aria-hidden>{free.length ? '+' : ''}</span>}
            {u && u.level > 1 && <em>+{u.level - 1}</em>}
            {left > 0 && <span className="sb-cd" style={{ ['--f' as string]: frac }}><b>{left > 1000 ? Math.ceil(left / 1000) : (left / 1000).toFixed(1)}</b></span>}
          </button>
        );
      })}
    </div>
  );
}

