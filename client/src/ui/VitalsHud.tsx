/** Barras de HP, SP, Stamina e Vínculo sob o nome do Companion, e os botões de pulo/defesa/sentar no celular. */
import { useEffect } from 'react';
import { useSkillData } from './skillState';
import { setMaxima, useVitals } from '../scene/vitals';
import { moveInput } from '../scene/Combat';

export function VitalsBars({ bondRatio, bondLevel }: { bondRatio: number; bondLevel: number }) {
  const v = useVitals();
  const { species, fx, bond } = useSkillData();
  useEffect(() => { setMaxima(species, fx?.bonus ?? {}, bond); }, [species, fx, bond]);
  const row = (cls: string, label: string, cur: number, max: number, title: string, pct = false) => (
    <div className={'vbar ' + cls} title={title}>
      <span>{label}</span>
      <div className="bar"><i style={{ width: Math.max(0, Math.min(100, (cur / Math.max(1, max)) * 100)) + '%' }} /></div>
      <small>{pct ? `${cur}%` : `${cur}/${max}`}</small>
    </div>
  );
  return (
    <div className={'vitals' + (v.down ? ' down' : '')} key={v.hitId ? 'h' + (v.hitId % 2) : 'h'}>
      {row('hp', 'HP', v.hp, v.hpMax, 'Vida: cai com os golpes das criaturas; zerou, desmaia um pouco')}
      {row('sp', 'SP', v.sp, v.spMax, 'Energia das habilidades da barra (1–9)')}
      {row('st', 'ST', v.st, v.stMax, 'Stamina: pulo, golpe e defesa')}
      {row('bond', 'VÍN', Math.round(bondRatio * 100), 100, `Vínculo ${bondLevel}: % até o próximo nível`, true)}
    </div>
  );
}

/** Pulo, defesa e sentar para toque (no PC: Espaço, E e C). */
export function TouchMoves() {
  return (
    <div className="touch-moves">
      <button aria-label="Pular" onPointerDown={(e) => { e.preventDefault(); moveInput.jumpId++; }}>⤒<small>pular</small></button>
      <button aria-label="Defender (segure)" onPointerDown={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); moveInput.block = true; }}
        onPointerUp={() => { moveInput.block = false; }} onPointerCancel={() => { moveInput.block = false; }} onContextMenu={(e) => e.preventDefault()}>🛡<small>defender</small></button>
      <button aria-label="Sentar" onPointerDown={(e) => { e.preventDefault(); moveInput.sitId++; }}>⌄<small>sentar</small></button>
    </div>
  );
}
