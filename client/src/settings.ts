/**
 * Ajustes do jogador (neste navegador): controles do mouse, mira, postura da Companion explorando sozinha,
 * quanto ela fala, voz (ouvir as respostas e falar pelo microfone) e números de dano.
 */
import { create } from 'zustand';

export interface Settings {
  /** clique esquerdo no chão: andar até lá, ou atacar (aí o clique direito anda) */
  click: 'andar' | 'atacar';
  /** mira do ataque básico no PC: onde o mouse aponta, ou o monstro mais perto */
  attackAim: 'mouse' | 'alvo';
  /** mira das habilidades (1–9): onde o mouse aponta, ou o monstro mais perto */
  skillAim: 'mouse' | 'alvo';
  /** explorando sozinha: só passeia, se defende de quem ataca, ou caça monstros do nível dela */
  posture: 'pacifica' | 'defensiva' | 'cacadora';
  /** foge quando o HP cai abaixo disto (0 = nunca) */
  fleeAt: number;
  /** quanto ela comenta sozinha (ao ver monstros, lutando, passeando) */
  chatter: 'muito' | 'normal' | 'pouco' | 'nunca';
  /** ler em voz alta as respostas e as falas dela */
  voiceOut: boolean;
  /** nome da voz do navegador (vazio = automática em português) */
  voiceName: string;
  /** microfone: enviar sozinho quando terminar de falar */
  voiceAutoSend: boolean;
  /** botão 🎙: fica ligado (modo conversa, escuta sem parar) ou ouve uma frase só */
  micMode: 'sempre' | 'uma';
  /** ordens no chat ("ataque!", "fuja!") também vão para a conversa com a IA (ela responde do jeito dela) */
  ordersToChat: boolean;
  damageNumbers: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  click: 'andar', attackAim: 'mouse', skillAim: 'mouse', posture: 'defensiva', fleeAt: 0.3, chatter: 'normal',
  voiceOut: true, voiceName: '', voiceAutoSend: true, micMode: 'sempre', ordersToChat: true, damageNumbers: true,
};

const KEY = 'companion-core:settings:v2';
const OLD = 'companion-core:settings:v1';
function load(): Settings {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && typeof v === 'object') return { ...DEFAULT_SETTINGS, ...v };
    // v1 → v2: mantém os ajustes, mas a voz dela passa a vir ligada
    const old = JSON.parse(localStorage.getItem(OLD) ?? 'null');
    if (old && typeof old === 'object') return { ...DEFAULT_SETTINGS, ...old, voiceOut: true };
  } catch { /* padrão */ }
  return DEFAULT_SETTINGS;
}

export const useSettings = create<Settings & { set: (p: Partial<Settings>) => void; reset: () => void }>((set, get) => ({
  ...load(),
  set: (p) => { set(p); try { const { set: _s, reset: _r, ...rest } = get(); localStorage.setItem(KEY, JSON.stringify(rest)); } catch { /* só nesta sessão */ } },
  reset: () => { set(DEFAULT_SETTINGS); try { localStorage.removeItem(KEY); } catch { /* ignore */ } },
}));

/** Leitura rápida fora do React (laço do jogo). */
export const settings = () => useSettings.getState();
