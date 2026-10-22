/**
 * Sons curtinhos de cada material, sintetizados na hora (sem arquivos): madeira (batida oca), pedra/minério/gema
 * (estalo seco + brilho), planta (farfalhar), água (respingo) e magia (sininho). Respeita o volume do sistema e só toca
 * depois de um gesto da pessoa (regra dos navegadores).
 */
import type { ResCategory } from '@rules';

let ctx: AudioContext | null = null;
const ac = () => { try { ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); return ctx; } catch { return null; } };

function noise(a: AudioContext, dur: number, freq: number, q: number, gain: number, t0: number) {
  const len = Math.max(1, Math.floor(a.sampleRate * dur)), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = a.createGain(); g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination); src.start(t0);
}
function tone(a: AudioContext, freq: number, dur: number, gain: number, t0: number, type: OscillatorType = 'sine', slide = 1) {
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0); o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
  g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}

export function playMaterialSound(cat: ResCategory, done = false) {
  const a = ac(); if (!a) return;
  if (a.state === 'suspended') void a.resume().catch(() => null);
  const t = a.currentTime + 0.01;
  try {
    if (cat === 'madeira') { tone(a, 180, 0.12, 0.25, t, 'triangle', 0.6); noise(a, 0.08, 900, 2, 0.15, t); if (done) tone(a, 140, 0.18, 0.2, t + 0.12, 'triangle', 0.7); }
    else if (cat === 'pedra' || cat === 'minerio') { noise(a, 0.06, 2600, 3, 0.3, t); tone(a, 520, 0.08, 0.08, t, 'square', 0.5); if (done) noise(a, 0.05, 3200, 3, 0.2, t + 0.1); }
    else if (cat === 'gema') { noise(a, 0.05, 3000, 4, 0.2, t); tone(a, 1760, 0.4, 0.12, t + 0.03); if (done) tone(a, 2350, 0.5, 0.1, t + 0.15); }
    else if (cat === 'planta') { noise(a, 0.25, 4200, 0.7, 0.12, t); if (done) noise(a, 0.18, 5200, 0.8, 0.1, t + 0.15); }
    else if (cat === 'magico') { tone(a, 880, 0.5, 0.1, t); tone(a, 1320, 0.6, 0.08, t + 0.08); if (done) tone(a, 1760, 0.6, 0.07, t + 0.18); }
    else { noise(a, 0.2, 1200, 1, 0.15, t); }
  } catch { /* sem som */ }
}
