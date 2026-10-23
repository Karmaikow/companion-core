/**
 * Voz pelo navegador (sem custo extra): ouvir a Companion (leitura em voz alta, pt-BR) e falar com ela pelo
 * microfone (reconhecimento de fala). Funciona melhor no Chrome e no Edge; o Firefox ainda não reconhece fala.
 * O envio passa por `sendPlayerMessage`: ordens ("ataque!", "fuja!") viram ação na hora e a conversa segue com a IA.
 */
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store';
import { settings } from '../settings';
import { handleCommand } from '../scene/brain';
import { skillInput } from '../scene/Combat';

// ---- ouvir (leitura em voz alta)

export function voicesPtBr(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return [];
  return speechSynthesis.getVoices().filter((v) => /^pt(-|_)?BR/i.test(v.lang) || /portugu/i.test(v.name));
}

const FEMALE = /francisca|luciana|maria|vitoria|vitória|leticia|letícia|thalita|camila|female|feminina|google português/i;
const MALE = /antonio|antônio|daniel|felipe|ricardo|male|masculin/i;

export function speak(text: string) {
  const s = settings();
  if (!s.voiceOut || typeof speechSynthesis === 'undefined' || !text) return;
  const clean = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/\s+/g, ' ').trim();
  if (!clean) return;
  const u = new SpeechSynthesisUtterance(clean);
  const he = useGame.getState().snap?.companion?.discoveries.pronoun === 'ele';
  const list = voicesPtBr();
  u.voice = list.find((v) => v.name === s.voiceName) ?? list.find((v) => (he ? MALE : FEMALE).test(v.name)) ?? list[0] ?? null;
  u.lang = 'pt-BR'; u.rate = 1.04; u.pitch = he ? 1.0 : 1.25;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// ---- enviar (texto ou voz)

/** Envia uma fala da pessoa: ordens viram ação na hora (com o corpo 3D) e a conversa vai para a IA. */
export function sendPlayerMessage(text: string) {
  const m = text.trim();
  if (!m) return;
  const g = useGame.getState();
  const cmd = skillInput.body ? handleCommand(m) : null;
  if (cmd && !settings().ordersToChat) { g.sayPlayer(m); return; }
  if (g.busy) { if (!cmd) g.toast('Espere ela terminar de responder…', 'soft'); return; }
  g.sayPlayer(m);
  void g.run((b) => b.chat(m));
}

// ---- falar (microfone)

type Rec = { start(): void; stop(): void; abort(): void; lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const RecCtor = (): (new () => Rec) | null => (typeof window !== 'undefined' ? ((window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition ?? null) : null);
export const micSupported = () => !!RecCtor();

/** Microfone: `start()` escuta; o texto aparece em `heard`; ao terminar chama `onFinal`. */
export function useMic(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const rec = useRef<Rec | null>(null);
  const finalText = useRef('');
  const cb = useRef(onFinal); cb.current = onFinal;
  useEffect(() => () => rec.current?.abort(), []);
  const start = () => {
    const C = RecCtor(); if (!C || listening) return;
    const r = new C(); rec.current = r;
    r.lang = 'pt-BR'; r.interimResults = true; r.continuous = false;
    finalText.current = ''; setHeard('');
    r.onresult = (e) => {
      let all = '', fin = '';
      for (let i = 0; i < e.results.length; i++) { const res = e.results[i]; all += res[0].transcript; if (res.isFinal) fin += res[0].transcript; }
      setHeard(all); if (fin) finalText.current = fin;
    };
    r.onerror = (e) => { if (e.error === 'not-allowed') useGame.getState().toast('O navegador bloqueou o microfone. Libere nas permissões do site.', 'warn'); };
    r.onend = () => { setListening(false); const t = (finalText.current || '').trim(); if (t) cb.current(t); };
    try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); r.start(); setListening(true); } catch { setListening(false); }
  };
  const stop = () => { try { rec.current?.stop(); } catch { /* já parou */ } };
  return { listening, heard, start, stop, supported: micSupported() };
}

