/**
 * Caixa de conversa (no painel e flutuando no mundo) com microfone. A fala do Companion aparece no balão sobre ele; a
 * da pessoa aparece aqui, junto da caixa. O histórico fica na aba Conversa. As dicas de quest ficam só na aba Quests,
 * discretas: quem puxa o assunto é o Companion.
 */
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store';
import { useSettings } from '../settings';
import { sendPlayerMessage, toggleConversation, useConversation, useMic } from './voice';
import { HudGlyph } from './HudGlyph';
import { useRemoteSpeech } from '../net/social';
import { usePresence } from '../net/presence';

/** A última fala da pessoa, junto da caixa de conversa (e não sobre o Companion), por alguns segundos. */
function PlayerEcho() {
  const said = useGame((s) => s.playerSpeech);
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    setText(said?.text ?? null);
    if (!said) return;
    const t = window.setTimeout(() => setText(null), Math.min(10000, Math.max(4000, said.text.length * 60)));
    return () => window.clearTimeout(t);
  }, [said]);
  if (!text) return null;
  return <div className="player-echo" key={said?.id} role="status"><b>Você</b>{text}</div>;
}

/**
 * No celular, os balões flutuantes sobre os Companions somem (cobriam o jogo); as falas aparecem aqui, junto da caixa:
 * a do seu Companion e a do outro Companion num encontro. No PC isto fica escondido (CSS) e valem os balões.
 */
function DockSpeech({ speech }: { speech: string | null }) {
  const name = useGame((s) => s.snap?.companion?.discoveries.name ?? 'Companion');
  const said = useGame((s) => s.playerSpeech);
  const speeches = useRemoteSpeech();
  const remote = Object.entries(speeches).sort((x, y) => y[1].id - x[1].id)[0] ?? null;
  const others = usePresence((s) => s.others);
  // a fala antiga do Companion some quando a pessoa fala (até ele responder), como no balão
  const [stale, setStale] = useState<string | null>(null);
  const ref = useRef(speech); ref.current = speech;
  useEffect(() => { if (said) setStale(ref.current); }, [said]);
  const own = speech && speech !== stale ? speech : null;
  if (!own && !remote) return null;
  const rName = remote ? others.find((o) => o.id === remote[0])?.name ?? 'Companion' : '';
  return (
    <div className="dock-speech" role="status" aria-live="polite">
      {remote && <p className="dock-line other" key={'r' + remote[1].id}><b>{rName}</b>{remote[1].text}</p>}
      {own && <p className="dock-line" key={own}><b>{name}</b>{own}</p>}
    </div>
  );
}

export function ChatComposer({ variant, speech = null }: { variant: 'panel' | 'world'; speech?: string | null }) {
  const busy = useGame((s) => s.busy);
  const name = useGame((s) => s.snap?.companion?.discoveries.name ?? 'seu Companion');
  const he = useGame((s) => s.snap?.companion?.discoveries.pronoun === 'ele');
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const autoSend = useSettings((s) => s.voiceAutoSend);
  const micMode = useSettings((s) => s.micMode);
  const mic = useMic((t) => { if (autoSend) sendPlayerMessage(t); else { setText(t); input.current?.focus(); } });
  const conv = useConversation();
  const micOn = conv.on || mic.listening;
  const micClick = () => (micMode === 'sempre' || conv.on ? toggleConversation() : mic.listening ? mic.stop() : mic.start());
  // no mundo, Enter foca a caixa (fora de outros campos)
  useEffect(() => {
    if (variant !== 'world') return;
    const typing = () => { const el = document.activeElement as HTMLElement | null; return !!el && (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el.tagName) || el.isContentEditable); };
    const down = (e: KeyboardEvent) => { if (e.key === 'Enter' && !typing() && !e.repeat) { e.preventDefault(); input.current?.focus(); } };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [variant]);
  const send = (m = text) => { const t = m.trim(); if (!t || busy) return; setText(''); sendPlayerMessage(t); if (variant === 'world') input.current?.blur(); };
  const value = mic.listening ? mic.heard : conv.on && conv.heard ? conv.heard : text;
  const ph = conv.on ? (conv.listening ? 'Conversa por voz ligada… pode falar' : `${name} está ${he ? 'falando' : 'falando'}…`) : mic.listening ? 'Ouvindo… pode falar' : variant === 'world' ? `Falar com ${name}… (Enter)` : `Escreva ou fale com ${name}…`;
  return (
    <div className={'composer composer-' + variant}>
      {variant === 'world' && <DockSpeech speech={speech} />}
      {variant === 'world' && <PlayerEcho />}
      <form className={variant === 'world' ? 'world-composer deco' : 'chat-input'} onSubmit={(e) => { e.preventDefault(); send(); }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') input.current?.blur(); }}>
        <input ref={input} value={value} onChange={(e) => setText(e.target.value)} placeholder={ph} maxLength={1000} aria-label={'Mensagem para ' + name} />
        {mic.supported && (
          <button type="button" className={'mic' + (micOn ? ' on' : '') + (conv.on && !conv.listening ? ' paused' : '')} onClick={micClick} aria-pressed={micOn} aria-label={micOn ? 'Desligar o microfone' : 'Falar pelo microfone'} title={micMode === 'sempre' ? 'Conversa por voz: fica ligado até você desligar' : 'Falar uma frase (ou segure V)'}>
            {variant === 'world' ? <HudGlyph kind="mic" /> : '🎙'}
          </button>
        )}
        <button type="submit" disabled={busy || !text.trim()} aria-label="Enviar">{variant === 'world' ? <HudGlyph kind="send" /> : 'Enviar'}</button>
      </form>
      {variant === 'world' && busy && <div className="world-thinking" role="status">{name} está pensando<span aria-hidden="true">…</span></div>}
    </div>
  );
}
