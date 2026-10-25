/**
 * Editor da posição dos botões de ação (celular deitado): cada botão vira um círculo que se arrasta com o dedo.
 * Fica fora do alcance do toque dos outros (aviso vermelho se dois ficam um em cima do outro).
 */
import { useRef, useState } from 'react';
import { HUD_IDS, HUD_LABEL, HUD_SIZE, SIZE_MAX, SIZE_MIN, hudPos, useHud, type HudId } from './hudLayout';

const GLYPH: Partial<Record<HudId, string>> = { jump: '⤒', block: '🛡', sit: '⌄', attack: '⚔' };

export function HudEditor() {
  const pos = useHud((s) => s.pos), size = useHud((s) => s.size);
  const { setPos, setSize, reset, edit, persist } = useHud.getState();
  const [drag, setDrag] = useState<HudId | null>(null);
  const grab = useRef({ dr: 0, db: 0 });

  const centers = HUD_IDS.map((id) => ({ id, ...hudPos(id, pos) }));
  const bad = new Set<HudId>();
  for (const a of centers) for (const b of centers) {
    if (a.id >= b.id) continue;
    const d = Math.hypot(a.r - b.r, a.b - b.b), min = ((HUD_SIZE[a.id] + HUD_SIZE[b.id]) / 2) * size + 3;
    if (d < min) { bad.add(a.id); bad.add(b.id); }
  }

  const down = (id: HudId) => (e: React.PointerEvent) => {
    e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = hudPos(id);
    grab.current = { dr: p.r - (innerWidth - e.clientX), db: p.b - (innerHeight - e.clientY) };
    setDrag(id);
  };
  const move = (id: HudId) => (e: React.PointerEvent) => {
    if (drag !== id) return;
    const half = (HUD_SIZE[id] * size) / 2 + 6;
    const r = Math.round(Math.min(innerWidth - half, Math.max(half, innerWidth - e.clientX + grab.current.dr)));
    const b = Math.round(Math.min(innerHeight - half, Math.max(half, innerHeight - e.clientY + grab.current.db)));
    setPos(id, { r, b });
  };
  const up = () => { if (drag) persist(); setDrag(null); };

  return (
    <div className="hud-edit" role="dialog" aria-label="Posição dos botões">
      <div className="hud-edit-bar">
        <b>Posição dos botões</b>
        <label>Tamanho
          <input type="range" min={SIZE_MIN} max={SIZE_MAX} step={0.05} value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Tamanho dos botões" />
        </label>
        <button type="button" onClick={() => reset()}>Restaurar padrão</button>
        <button type="button" className="primary" onClick={() => edit(false)}>Pronto</button>
      </div>
      {HUD_IDS.map((id) => {
        const p = hudPos(id, pos), s = HUD_SIZE[id];
        return (
          <div key={id} className={'hud-ghost' + (id === 'attack' ? ' attack' : '') + (drag === id ? ' drag' : '') + (bad.has(id) ? ' bad' : '')}
            style={{ right: p.r, bottom: p.b, width: s, height: s }}
            onPointerDown={down(id)} onPointerMove={move(id)} onPointerUp={up} onPointerCancel={up}
            aria-label={`Arrastar o botão ${HUD_LABEL[id]}`}>
            <span>{GLYPH[id] ?? HUD_LABEL[id]}</span>
          </div>
        );
      })}
      <div className="hud-edit-hint">Arraste cada botão para onde fica melhor para o seu dedo · vermelho = botões encostando</div>
    </div>
  );
}
