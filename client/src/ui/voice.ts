/**
 * Voz pelo navegador (sem custo extra): ouvir a Companion (leitura em voz alta, pt-BR, voz de menina para
 * Companions "ela" e de menino para "ele") e falar com ela pelo microfone (reconhecimento de fala).
 * Funciona melhor no Chrome e no Edge; o Firefox ainda não reconhece fala.
 *
 * Microfone em dois jeitos:
 *  - modo conversa (🎙 fica ligado): escuta sem parar e envia cada frase; pausa enquanto ela fala, para não
 *    ouvir a própria voz, e volta a escutar sozinho;
 *  - uma frase (segurar V, ou o 🎙 com "ouve uma frase só" nos Ajustes).
 * O envio passa por `sendPlayerMessage`: ordens ("ataque!", "fuja!") viram ação na hora e a conversa segue com a IA.
 */
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { useGame } from '../store';
import { settings } from '../settings';
import { handleCommand } from '../scene/brain';
import { skillInput } from '../scene/Combat';

// ---- ouvir (leitura em voz alta)

export function voicesPtBr(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return [];
  return speechSynthesis.getVoices().filter((v) => /^pt(-|_)?BR/i.test(v.lang) || /portugu/i.test(v.name));
}

const FEMALE = /francisca|luciana|maria|vitoria|vitória|leticia|letícia|thalita|camila|yara|brenda|elza|giovanna|leila|manuela|female|feminin|google português/i;
const MALE = /antonio|antônio|daniel|felipe|ricardo|donato|fabio|fábio|humberto|julio|júlio|nicolau|valerio|valério|male|masculin/i;

export type VoiceGender = 'menina' | 'menino';
export const voiceGender = (v: SpeechSynthesisVoice): VoiceGender | null => (MALE.test(v.name) && !/female/i.test(v.name) ? 'menino' : FEMALE.test(v.name) ? 'menina' : null);

/** Escolhe a voz e o tom: menina (voz feminina, mais aguda) ou menino (voz masculina; sem ela, a feminina bem mais grave). */
export function voiceFor(he: boolean): { voice: SpeechSynthesisVoice | null; pitch: number; rate: number } {
  const list = voicesPtBr(), s = settings();
  const chosen = s.voiceName ? list.find((v) => v.name === s.voiceName) : undefined;
  if (chosen) return { voice: chosen, pitch: he ? (voiceGender(chosen) === 'menino' ? 1.1 : 0.75) : 1.3, rate: he ? 1.0 : 1.05 };
  const male = list.find((v) => voiceGender(v) === 'menino'), female = list.find((v) => voiceGender(v) === 'menina');
  if (he) return male ? { voice: male, pitch: 1.12, rate: 1.02 } : { voice: female ?? list[0] ?? null, pitch: 0.72, rate: 1.0 };
  return female ? { voice: female, pitch: 1.35, rate: 1.05 } : { voice: list[0] ?? null, pitch: 1.45, rate: 1.05 };
}

/** A Companion é "ele"? (voz de menino) */
const isHe = () => useGame.getState().snap?.companion?.discoveries.pronoun === 'ele';

export function speak(text: string, opts: { force?: boolean; he?: boolean } = {}) {
  const s = settings();
  if ((!s.voiceOut && !opts.force) || typeof speechSynthesis === 'undefined' || !text) return;
  const clean = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/[*_~#>]/g, '').replace(/\s+/g, ' ').trim();
  if (!clean) return;
  const u = new SpeechSynthesisUtterance(clean);
  const v = voiceFor(opts.he ?? isHe());
  u.voice = v.voice; u.lang = v.voice?.lang ?? 'pt-BR'; u.pitch = v.pitch; u.rate = v.rate;
  // modo conversa: o microfone pausa enquanto ela fala (senão ele ouve a voz dela) e volta depois
  const conv = useConversation.getState();
  if (conv.on) pauseListening();
  const id = ++speakSeq;
  const done = () => { if (id !== speakSeq) return; speaking = 0; resumeListening(); }; // só a fala mais recente religa o microfone
  u.onend = done; u.onerror = done;
  // alguns navegadores às vezes não avisam o fim da fala: religa o microfone depois do tempo estimado
  window.setTimeout(done, 2500 + clean.length * 110);
  speaking = 1;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
let speaking = 0, speakSeq = 0;

// as vozes do Chrome chegam depois do carregamento
if (typeof speechSynthesis !== 'undefined') try { speechSynthesis.getVoices(); speechSynthesis.addEventListener('voiceschanged', () => speechSynthesis.getVoices()); } catch { /* sem voz */ }

// ---- enviar (texto ou voz)

/** Envia uma fala da pessoa: ordens viram ação na hora (com o corpo 3D) e a conversa vai para a IA. */
export function sendPlayerMessage(text: string) {
  const m = text.trim();
  if (!m) return;
  const g = useGame.getState();
  const cmd = skillInput.body ? handleCommand(m) : null;
  if (cmd && !settings().ordersToChat) return;
  if (g.busy) { if (!cmd) g.toast('Espere ela terminar de responder…', 'soft'); return; }
  void g.run((b) => b.chat(m));
}

// ---- falar (microfone)

type Rec = { start(): void; stop(): void; abort(): void; lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const RecCtor = (): (new () => Rec) | null => (typeof window !== 'undefined' ? ((window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition ?? null) : null);
export const micSupported = () => !!RecCtor();

// -- modo conversa (microfone sempre ligado)

/** on = modo conversa ligado; listening = escutando agora (false enquanto ela fala); heard = o que está ouvindo */
export const useConversation = create<{ on: boolean; listening: boolean; heard: string }>(() => ({ on: false, listening: false, heard: '' }));
let convRec: Rec | null = null;
let restartTimer = 0;

function listen() {
  const st = useConversation.getState();
  if (!st.on || convRec || speaking) return;
  const C = RecCtor(); if (!C) return;
  const r = new C(); convRec = r;
  r.lang = 'pt-BR'; r.interimResults = true; r.continuous = true;
  r.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i], t = res[0].transcript.trim();
      if (res.isFinal) { if (t) sendPlayerMessage(t); } else interim += t + ' ';
    }
    useConversation.setState({ heard: interim.trim() });
  };
  r.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      useGame.getState().toast('O navegador bloqueou o microfone. Libere nas permissões do site.', 'warn');
      stopConversation();
    }
    // no-speech / aborted / network: o onend religa
  };
  r.onend = () => {
    if (convRec === r) convRec = null;
    useConversation.setState({ listening: false, heard: '' });
    // o navegador encerra sozinho depois de um tempo em silêncio: religa enquanto o modo conversa estiver ligado
    if (useConversation.getState().on && !speaking) { clearTimeout(restartTimer); restartTimer = window.setTimeout(listen, 300); }
  };
  try { r.start(); useConversation.setState({ listening: true }); } catch { convRec = null; }
}
function pauseListening() { clearTimeout(restartTimer); const r = convRec; convRec = null; try { r?.abort(); } catch { /* já parou */ } useConversation.setState({ listening: false, heard: '' }); }
function resumeListening() { if (useConversation.getState().on) { clearTimeout(restartTimer); restartTimer = window.setTimeout(listen, 350); } }

export function startConversation() {
  if (!micSupported()) { useGame.getState().toast('Este navegador não reconhece fala (use Chrome ou Edge).', 'warn'); return; }
  useConversation.setState({ on: true });
  listen();
}
export function stopConversation() {
  useConversation.setState({ on: false, listening: false, heard: '' });
  pauseListening();
}
export const toggleConversation = () => (useConversation.getState().on ? stopConversation() : startConversation());

// -- uma frase (segurar V, ou 🎙 no modo "uma frase")

/** Microfone de uma frase: `start()` escuta; o texto aparece em `heard`; ao terminar chama `onFinal`. */
export function useMic(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const rec = useRef<Rec | null>(null);
  const finalText = useRef('');
  const cb = useRef(onFinal); cb.current = onFinal;
  useEffect(() => () => rec.current?.abort(), []);
  const start = () => {
    const C = RecCtor(); if (!C || listening || useConversation.getState().on) return;
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
