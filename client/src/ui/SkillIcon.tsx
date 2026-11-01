/**
 * Ícone vetorial de uma habilidade: quadrado arredondado com a cor da essência/efeito, moldura clara, partículas,
 * o símbolo (decidido por skillIconSpec, nas regras) aceso por dentro e um detalhe da forma de uso atrás dele.
 * Quem enviou uma imagem pela Forja (iconUrl) continua vendo a imagem; este desenho é o padrão.
 *
 * Serve no DOM (<SkillIcon size={44} />) e dentro de outro SVG (<SkillIcon x y size />, ex.: a árvore).
 */
import { useId, type ReactNode } from 'react';
import { skillIconSpec, type IconMod, type IconMotif, type SkillDef } from '@rules';

type IconSkill = Pick<SkillDef, 'slug' | 'name' | 'shape' | 'essence' | 'heal' | 'status' | 'vfx'> & { iconUrl?: string };

/* ---------- cores ---------- */
const hex = (c: string) => { const h = c.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };

/* ---------- símbolos (quadro 100×100, centro 50,50) ---------- */
// `f` = preenchimento aceso, `s` = contorno; desenhos próprios, um traço só por família
const G: Record<IconMotif, (f: string, s: string, a: string) => ReactNode> = {
  spear: (f, s) => <g transform="rotate(42 50 50)">
    <rect x="47.5" y="40" width="5" height="44" rx="2.5" fill="#6b4a2c" stroke="#2a1a0c" strokeWidth="1.2" />
    <path d="M50 12 L61 36 L55 41 L50 35 L45 41 L39 36 Z" fill={f} stroke={s} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M50 16 L50 34" stroke="#ffffff" strokeOpacity=".7" strokeWidth="1.4" />
  </g>,
  flame: (f, s, a) => <g>
    <path d="M50 14 C58 29 71 36 68 55 C66 69 58 79 50 81 C41 79 32 70 32 56 C31 45 38 39 42 31 C44 40 47 44 50 46 C53 37 47 27 50 14 Z" fill={f} stroke={s} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M50 50 C57 56 61 63 59 70 C57 76 53 79 50 79 C45 78 41 73 42 66 C43 60 48 57 50 50 Z" fill={mix(a, '#ffffff', 0.75)} />
  </g>,
  shard: (f, s) => <g>
    <path d="M50 12 L63 42 L57 86 L43 86 L37 42 Z" fill={f} stroke={s} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M50 12 L50 86 M37 42 L63 42" stroke="#ffffff" strokeOpacity=".55" strokeWidth="1.2" fill="none" />
    <path d="M30 50 L36 40 L38 62 L33 70 Z M70 50 L64 40 L62 62 L67 70 Z" fill={f} stroke={s} strokeWidth="1.2" strokeLinejoin="round" opacity=".85" />
  </g>,
  bolt: (f, s) => <path d="M57 12 L33 54 L48 54 L41 88 L69 43 L54 43 L63 12 Z" fill={f} stroke={s} strokeWidth="1.8" strokeLinejoin="round" />,
  swirl: (f) => <g fill="none" strokeLinecap="round">
    <path d="M52 50 a4 4 0 1 1 -6 -3 a10 10 0 0 1 14 -2 a16 16 0 0 1 2 22 a22 22 0 0 1 -30 0 a28 28 0 0 1 2 -38" stroke={f} strokeWidth="6" />
    <path d="M72 26 C80 34 82 44 80 52" stroke={f} strokeWidth="4" opacity=".7" />
  </g>,
  rock: (f, s) => <g>
    <path d="M28 72 L24 50 L37 31 L58 27 L75 41 L77 63 L63 78 L40 80 Z" fill={f} stroke={s} strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M37 31 L46 50 L40 80 M46 50 L75 41 M46 50 L63 78" stroke={s} strokeOpacity=".6" strokeWidth="1.4" fill="none" />
  </g>,
  leaf: (f, s) => <g>
    <path d="M24 78 C22 46 44 24 78 22 C78 56 58 78 24 78 Z" fill={f} stroke={s} strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M24 78 L66 36 M40 62 L40 46 M50 52 L52 38 M40 62 L54 62 M50 52 L64 50" stroke={s} strokeOpacity=".7" strokeWidth="1.6" fill="none" strokeLinecap="round" />
  </g>,
  drop: (f, s) => <g>
    <path d="M50 14 C61 33 70 44 70 59 C70 71 61 81 50 81 C39 81 30 71 30 59 C30 44 39 33 50 14 Z" fill={f} stroke={s} strokeWidth="1.8" />
    <path d="M40 60 C40 52 44 46 47 43" stroke="#ffffff" strokeOpacity=".75" strokeWidth="3.5" strokeLinecap="round" fill="none" />
  </g>,
  poison: (f, s) => <g>
    <path d="M32 40 C32 26 68 26 68 40 C68 48 64 50 64 58 C64 65 59 65 59 58 C59 54 55 54 55 63 C55 74 45 74 45 63 C45 56 41 56 41 61 C41 68 36 68 36 59 C36 50 32 48 32 40 Z" fill={f} stroke={s} strokeWidth="1.8" strokeLinejoin="round" />
    <circle cx="42" cy="38" r="4" fill="#ffffff" fillOpacity=".55" /><circle cx="70" cy="22" r="4" fill={f} /><circle cx="78" cy="32" r="2.6" fill={f} /><circle cx="26" cy="24" r="3" fill={f} />
  </g>,
  moon: (f, s) => <g>
    <path d="M62 16 A34 34 0 1 0 84 64 A27 27 0 1 1 62 16 Z" fill={f} stroke={s} strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M70 30 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z" fill="#ffffff" fillOpacity=".8" />
  </g>,
  sun: (f, s) => <g>
    {Array.from({ length: 8 }, (_, i) => <path key={i} d="M50 12 L55 28 L45 28 Z" fill={f} stroke={s} strokeWidth="1" transform={`rotate(${i * 45} 50 50)`} />)}
    <circle cx="50" cy="50" r="17" fill={f} stroke={s} strokeWidth="1.8" />
    <circle cx="50" cy="50" r="9" fill="#ffffff" fillOpacity=".7" />
  </g>,
  claw: (f) => <g fill="none" strokeLinecap="round">
    {[0, 1, 2].map((i) => <path key={i} d={`M${30 + i * 13} ${20 - i * 2} C${42 + i * 13} 40 ${46 + i * 12} 60 ${40 + i * 13} ${84 - i * 4}`} stroke={f} strokeWidth={7 - i} />)}
  </g>,
  fist: (f, s) => <g>
    <path d="M50 10 L57 34 L80 24 L66 44 L90 52 L65 58 L76 80 L54 66 L46 90 L40 66 L18 78 L32 58 L10 50 L34 44 L22 22 L44 34 Z" fill={f} stroke={s} strokeWidth="1.6" strokeLinejoin="round" />
    <circle cx="50" cy="50" r="10" fill="#ffffff" fillOpacity=".75" />
  </g>,
  shield: (f, s) => <g>
    <path d="M50 12 L77 23 C77 52 67 72 50 86 C33 72 23 52 23 23 Z" fill={f} stroke={s} strokeWidth="2" strokeLinejoin="round" />
    <path d="M50 22 L68 30 C68 50 61 64 50 74 Z" fill="#ffffff" fillOpacity=".28" />
    <path d="M38 46 L50 56 L62 46" stroke={s} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </g>,
  cross: (f, s) => <path d="M42 18 h16 v24 h24 v16 h-24 v24 h-16 v-24 h-24 v-16 h24 Z" fill={f} stroke={s} strokeWidth="1.8" strokeLinejoin="round" />,
  hourglass: (f, s, a) => <g>
    <path d="M30 16 h40 v6 c0 12 -12 18 -16 28 c4 10 16 16 16 28 v6 h-40 v-6 c0 -12 12 -18 16 -28 c-4 -10 -16 -16 -16 -28 Z" fill={f} stroke={s} strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M38 78 C42 68 58 68 62 78 Z M44 30 h12 l-6 10 Z" fill={mix(a, '#ffffff', 0.6)} />
  </g>,
  rune: (f) => <g fill="none" stroke={f} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="50" cy="50" r="31" strokeWidth="4" />
    <circle cx="50" cy="50" r="24" strokeWidth="1.5" strokeDasharray="3 5" />
    <path d="M50 30 L66 60 H34 Z M50 30 V70 M40 47 H60" strokeWidth="4" />
  </g>,
  meteor: (f, s, a) => <g>
    <path d="M30 56 L76 16 L84 26 L44 70 Z" fill={mix(a, '#ffffff', 0.3)} opacity=".55" />
    <path d="M36 50 L70 22 M44 60 L80 30" stroke="#ffffff" strokeOpacity=".5" strokeWidth="2" strokeLinecap="round" />
    <circle cx="36" cy="64" r="15" fill={f} stroke={s} strokeWidth="1.8" />
    <circle cx="32" cy="60" r="5" fill="#ffffff" fillOpacity=".7" />
  </g>,
  chain: (f) => <g fill="none" stroke={f} strokeWidth="6" transform="rotate(-38 50 50)">
    <rect x="18" y="40" width="30" height="20" rx="10" />
    <rect x="40" y="40" width="30" height="20" rx="10" opacity=".9" />
    <rect x="62" y="42" width="22" height="16" rx="8" opacity=".7" />
  </g>,
  cage: (f) => <g fill="none" stroke={f} strokeLinecap="round">
    <path d="M26 82 V44 C26 22 74 22 74 44 V82" strokeWidth="5" />
    <path d="M38 82 V32 M50 82 V26 M62 82 V32 M20 82 H80" strokeWidth="4" />
  </g>,
  blood: (f, s) => <g>
    <path d="M46 16 C57 34 65 45 65 59 C65 71 57 80 46 80 C35 80 27 71 27 59 C27 45 35 34 46 16 Z" fill={f} stroke={s} strokeWidth="1.8" />
    <path d="M70 52 C74 58 77 62 77 66 C77 70 74 73 70 73 C66 73 63 70 63 66 C63 62 66 58 70 52 Z" fill={f} stroke={s} strokeWidth="1.2" />
    <path d="M36 60 C36 52 39 46 42 43" stroke="#ffffff" strokeOpacity=".7" strokeWidth="3" strokeLinecap="round" fill="none" />
  </g>,
  gear: (f, s) => <g>
    {Array.from({ length: 8 }, (_, i) => <rect key={i} x="44" y="14" width="12" height="14" rx="2" fill={f} stroke={s} strokeWidth="1.2" transform={`rotate(${i * 45} 50 50)`} />)}
    <circle cx="50" cy="50" r="24" fill={f} stroke={s} strokeWidth="1.8" />
    <circle cx="50" cy="50" r="9" fill={s} />
  </g>,
  web: (f) => <g fill="none" stroke={f} strokeLinecap="round">
    {Array.from({ length: 8 }, (_, i) => <path key={i} d="M50 50 L50 14" strokeWidth="2.6" transform={`rotate(${i * 45} 50 50)`} />)}
    {[12, 22, 32].map((r) => <polygon key={r} points={Array.from({ length: 8 }, (_, i) => { const t = (i * Math.PI) / 4 - Math.PI / 2; return `${50 + r * Math.cos(t)},${50 + r * Math.sin(t)}`; }).join(' ')} strokeWidth="2.2" />)}
  </g>,
  hive: (f, s) => <g strokeLinejoin="round">
    {[[50, 36], [36, 60], [64, 60]].map(([x, y], i) => <polygon key={i} points={Array.from({ length: 6 }, (_, k) => { const t = (k * Math.PI) / 3; return `${x + 15 * Math.cos(t)},${y + 15 * Math.sin(t)}`; }).join(' ')} fill={f} stroke={s} strokeWidth="1.8" opacity={i ? 0.9 : 1} />)}
  </g>,
  feather: (f, s) => <g>
    <path d="M74 16 C48 22 28 48 30 82 L37 82 C40 58 54 40 74 16 Z" fill={f} stroke={s} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M33 84 C42 56 56 36 74 16" stroke={s} strokeWidth="2" fill="none" />
    <path d="M44 58 L34 52 M50 48 L40 40 M56 39 L48 30" stroke={s} strokeOpacity=".6" strokeWidth="1.6" strokeLinecap="round" />
  </g>,
  echo: (f, s) => <g strokeLinejoin="round">
    {[0, 1, 2].map((i) => <path key={i} d={`M${26 + i * 16} 24 L${48 + i * 16} 50 L${26 + i * 16} 76 L${36 + i * 16} 50 Z`} fill={f} stroke={s} strokeWidth="1.4" opacity={0.35 + i * 0.32} />)}
  </g>,
  prism: (f, s, a) => <g>
    <path d="M12 58 L42 48" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
    {['#ff7b7b', '#ffd36b', '#7bff9c', '#7bd6ff'].map((c, i) => <path key={c} d={`M60 50 L90 ${36 + i * 10}`} stroke={c} strokeWidth="3.4" strokeLinecap="round" opacity=".9" />)}
    <path d="M50 18 L76 74 H24 Z" fill={f} stroke={s} strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M50 28 L60 52 H42 Z" fill={mix(a, '#ffffff', 0.7)} opacity=".8" />
  </g>,
  portal: (f, s) => <g fill="none">
    <ellipse cx="50" cy="50" rx="32" ry="20" stroke={f} strokeWidth="5" transform="rotate(-20 50 50)" />
    <ellipse cx="50" cy="50" rx="21" ry="12" stroke={f} strokeWidth="3.5" opacity=".8" transform="rotate(-20 50 50)" />
    <ellipse cx="50" cy="50" rx="10" ry="6" fill={s} transform="rotate(-20 50 50)" />
  </g>,
  wave: (f, s) => <g>
    <path d="M14 66 C24 40 42 32 54 42 C62 48 58 58 50 56 C58 64 70 60 76 48 C80 58 84 66 86 72 L86 84 L14 84 Z" fill={f} stroke={s} strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M20 74 C34 66 46 70 60 74 C70 76 78 74 84 72" stroke="#ffffff" strokeOpacity=".6" strokeWidth="2.5" fill="none" strokeLinecap="round" />
  </g>,
  resonance: (f) => <g fill="none" stroke={f} strokeLinecap="round">
    <circle cx="28" cy="50" r="7" fill={f} />
    {[18, 30, 42].map((r, i) => <path key={r} d={`M${28 + r * Math.cos(-0.9)} ${50 + r * Math.sin(-0.9)} A${r} ${r} 0 0 1 ${28 + r * Math.cos(0.9)} ${50 + r * Math.sin(0.9)}`} strokeWidth={6 - i * 1.4} opacity={1 - i * 0.22} />)}
  </g>,
  whip: (f) => <g fill="none" strokeLinecap="round">
    <path d="M22 80 C40 72 34 48 52 42 C70 36 70 22 84 16" stroke={f} strokeWidth="5" />
    <path d="M16 86 L26 76" stroke="#6b4a2c" strokeWidth="8" />
    <path d="M82 14 l6 -4 M84 20 l7 -1" stroke={f} strokeWidth="3" />
  </g>,
  breath: (f, s) => <g>
    <path d="M18 50 L80 22 C90 40 90 60 80 78 Z" fill={f} stroke={s} strokeWidth="1.6" strokeLinejoin="round" opacity=".9" />
    <path d="M26 50 L78 36 M26 50 L80 50 M26 50 L78 64" stroke="#ffffff" strokeOpacity=".6" strokeWidth="2.2" strokeLinecap="round" />
  </g>,
  leap: (f) => <g fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 78 C24 30 62 18 78 50" stroke={f} strokeWidth="6" />
    <path d="M66 46 L80 54 L84 38" stroke={f} strokeWidth="6" />
    <path d="M14 82 H40" stroke={f} strokeWidth="4" opacity=".6" />
  </g>,
  blade: (f, s) => <g>
    <path d="M16 74 C36 32 66 20 86 22 C66 34 46 52 32 84 Z" fill={f} stroke={s} strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M28 70 C44 42 64 30 80 26" stroke="#ffffff" strokeOpacity=".65" strokeWidth="2" fill="none" strokeLinecap="round" />
  </g>,
  spark: (f, s) => <g>
    <path d="M50 10 L57 43 L90 50 L57 57 L50 90 L43 57 L10 50 L43 43 Z" fill={f} stroke={s} strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M74 20 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2 Z" fill="#ffffff" fillOpacity=".85" />
  </g>,
  bubble: (f, s) => <g>
    <circle cx="50" cy="52" r="26" fill={f} fillOpacity=".55" stroke={s} strokeWidth="2.2" />
    <path d="M36 40 A18 18 0 0 1 52 30" stroke="#ffffff" strokeOpacity=".85" strokeWidth="4" fill="none" strokeLinecap="round" />
    <circle cx="76" cy="26" r="6" fill={f} fillOpacity=".6" stroke={s} strokeWidth="1.4" /><circle cx="24" cy="78" r="4" fill={f} fillOpacity=".6" stroke={s} strokeWidth="1.2" />
  </g>,
};

/* ---------- forma de uso: o detalhe atrás do símbolo ---------- */
const MOD: Record<IconMod, (a: string) => ReactNode> = {
  trail: (a) => <g stroke={a} strokeLinecap="round" opacity=".55">{[0, 1, 2].map((i) => <path key={i} d={`M${14 + i * 6} ${66 + i * 8} L${34 + i * 6} ${50 + i * 8}`} strokeWidth={3 - i * 0.6} />)}</g>,
  beam: (a) => <path d="M6 90 L90 6" stroke={a} strokeWidth="16" strokeLinecap="round" opacity=".18" />,
  ground: (a) => <ellipse cx="50" cy="80" rx="32" ry="8" fill="none" stroke={a} strokeWidth="3" opacity=".6" />,
  halo: (a) => <circle cx="50" cy="50" r="40" fill="none" stroke={a} strokeWidth="2.4" strokeDasharray="5 6" opacity=".55" />,
  fan: (a) => <path d="M8 50 L92 18 L92 82 Z" fill={a} opacity=".14" />,
  speed: (a) => <g stroke={a} strokeLinecap="round" opacity=".5">{[30, 46, 62].map((y, i) => <path key={y} d={`M${6 + i * 4} ${y} H${26 + i * 4}`} strokeWidth="3" />)}</g>,
  arc: (a) => <path d="M14 30 C30 8 70 8 86 30" fill="none" stroke={a} strokeWidth="3" strokeDasharray="4 5" opacity=".55" />,
  slash: (a) => <path d="M18 82 C30 46 54 24 86 14" fill="none" stroke={a} strokeWidth="5" strokeLinecap="round" opacity=".3" />,
};

/** símbolos desenhados só em traço (sem preenchimento): ganham o gradiente no traço */
const STROKED = new Set<IconMotif>(['swirl', 'claw', 'rune', 'chain', 'cage', 'web', 'resonance', 'whip', 'leap', 'portal']);

export function SkillIcon({ skill, size = 44, x, y, color, title, className }: { skill: IconSkill; size?: number; x?: number; y?: number; color?: string; title?: string; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  if (skill.iconUrl) {
    return x !== undefined
      ? <image href={skill.iconUrl} x={x} y={y} width={size} height={size} preserveAspectRatio="xMidYMid meet" className={className} />
      : <img src={skill.iconUrl} alt={title ?? ''} width={size} height={size} className={className} style={{ objectFit: 'contain', display: 'block' }} />;
  }
  const spec = skillIconSpec(skill, color);
  const a = spec.accent;
  const light = mix(a, '#ffffff', 0.55), deep = mix(a, '#070a18', 0.72), edge = mix(a, '#070a18', 0.45);
  const fill = STROKED.has(spec.motif) ? `url(#${uid}l)` : `url(#${uid}g)`;
  // partículas na mesma posição sempre (semente pelo slug)
  let r = spec.seed;
  const rnd = () => { r = (Math.imul(r ^ (r >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return r / 4294967296; };
  const dots = Array.from({ length: 7 }, () => ({ cx: 10 + rnd() * 80, cy: 10 + rnd() * 80, r: 0.6 + rnd() * 1.4, o: 0.25 + rnd() * 0.5 }));
  const glyph = G[spec.motif](fill, edge, a);
  return (
    <svg className={'skill-icon' + (className ? ' ' + className : '')} viewBox="0 0 100 100" width={size} height={size} x={x} y={y}
      role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      <defs>
        <linearGradient id={uid + 'b'} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={mix(a, '#0b1020', 0.45)} /><stop offset="1" stopColor={deep} /></linearGradient>
        <radialGradient id={uid + 'h'} cx="50%" cy="48%" r="50%"><stop offset="0" stopColor={a} stopOpacity=".55" /><stop offset="1" stopColor={a} stopOpacity="0" /></radialGradient>
        <linearGradient id={uid + 'g'} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset=".45" stopColor={light} /><stop offset="1" stopColor={a} /></linearGradient>
        <linearGradient id={uid + 'l'} x1="0" y1="0" x2="1" y2="1" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor={light} /></linearGradient>
        <filter id={uid + 'f'} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.2" /></filter>
        <clipPath id={uid + 'c'}><rect x="3" y="3" width="94" height="94" rx="20" /></clipPath>
      </defs>
      <rect x="3" y="3" width="94" height="94" rx="20" fill={`url(#${uid}b)`} />
      <g clipPath={`url(#${uid}c)`}>
        <circle cx="50" cy="50" r="46" fill={`url(#${uid}h)`} />
        {dots.map((d, i) => <circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill="#ffffff" opacity={d.o} />)}
        {MOD[spec.mod](light)}
        <g filter={`url(#${uid}f)`} opacity=".85">{G[spec.motif](a, a, a)}</g>
        {glyph}
        {spec.heal && spec.motif !== 'cross' && <g fill="#8dff9c" stroke="#1d5a2a" strokeWidth=".8">
          <path d="M16 12 h5 v6 h6 v5 h-6 v6 h-5 v-6 h-6 v-5 h6 Z" /><path d="M76 70 h5 v6 h6 v5 h-6 v6 h-5 v-6 h-6 v-5 h6 Z" />
        </g>}
      </g>
      <rect x="4" y="4" width="92" height="92" rx="19" fill="none" stroke="#ffffff" strokeOpacity=".7" strokeWidth="2.2" />
      <rect x="7" y="7" width="86" height="86" rx="16" fill="none" stroke="#000000" strokeOpacity=".25" strokeWidth="1" />
    </svg>
  );
}
