import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store';
import { useSettings } from '../settings';
import { sendPlayerMessage, useMic } from './voice';
import { HudGlyph } from './HudGlyph';

/** The conversation lives in the world; only the input stays on the HUD. */
export function FloatingConversation() {
  const name = useGame((s) => s.snap?.companion?.discoveries.name ?? 'seu Companion');
  const busy = useGame((s) => s.busy);
  const autoSend = useSettings((s) => s.voiceAutoSend);
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const mic = useMic((t) => { if (autoSend) sendPlayerMessage(t); else { setText(t); input.current?.focus(); } });
  const micRef = useRef(mic); micRef.current = mic;
  useEffect(() => {
    const typing = () => { const el = document.activeElement as HTMLElement | null; return el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable); };
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || typing()) return;
      if (e.key.toLowerCase() === 'v') micRef.current.start();
      if (e.key === 'Enter') { e.preventDefault(); input.current?.focus(); }
    };
    const up = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'v') micRef.current.stop(); };
    const blur = () => micRef.current.stop();
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);
  return <>
    <form className="world-composer" aria-label={'Conversar com ' + name} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') input.current?.blur(); }}
      onSubmit={(e) => { e.preventDefault(); if (!text.trim() || busy || mic.listening) return; sendPlayerMessage(text); setText(''); input.current?.blur(); }}>
      <input ref={input} aria-label="Mensagem para o Companion" placeholder={'Falar com ' + name + '…'} maxLength={1000} value={mic.listening ? mic.heard : text} readOnly={mic.listening} onChange={(e) => setText(e.target.value)} />
      {mic.supported && <button type="button" className={mic.listening ? 'listening-mic' : ''} aria-pressed={mic.listening} aria-label={mic.listening ? 'Parar microfone' : 'Falar pelo microfone'} title="Falar (segure V)" onClick={() => mic.listening ? mic.stop() : mic.start()}><HudGlyph kind="mic" /></button>}
      <button type="submit" disabled={busy || mic.listening || !text.trim()} aria-label="Enviar mensagem" title="Enviar mensagem"><HudGlyph kind="send" /></button>
    </form>
    {busy && <div className="world-thinking" role="status">{name} está pensando<span aria-hidden="true">…</span></div>}
    {mic.listening && <div className="listening" role="status">🎙 {mic.heard || 'Ouvindo… pode falar'}</div>}
  </>;
}
