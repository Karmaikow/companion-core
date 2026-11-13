import { describe, it, expect } from 'vitest';
import { parseCommand } from '../rules/index';

const places = ['Floresta Densa', 'Montanha Azul'], creatures = ['Bruma de Musgo'];
const P = (t: string) => parseCommand(t, { places, creatures });

describe('ordem "limpe a área"', () => {
  it('entende as formas comuns de pedir', () => {
    for (const t of ['Mayuna, limpe a área!', 'limpa a area', 'limpar a região', 'limpe tudo por aqui', 'limpa geral', 'limpem o mapa', 'faz a faxina', 'limpe as redondezas'])
      expect(P(t), t).toEqual({ kind: 'clear' });
  });

  it('não engole as outras ordens', () => {
    expect(P('mate 10 Brumas de Musgo')?.kind).toBe('hunt');
    expect(P('colete 5 pedras')?.kind).toBe('gather');
    expect(P('ataque!')?.kind).toBe('attack');
    expect(P('fuja, deu ruim!')?.kind).toBe('flee');
    expect(P('pare')?.kind).toBe('stop');
    expect(P('vá até a Montanha Azul')?.kind).toBe('goto');
  });

  it('parar e fugir continuam vindo antes ("pare de limpar a área" é parar)', () => {
    expect(P('pare de limpar a área')?.kind).toBe('stop');
    expect(P('foge, larga a área!')?.kind).toBe('flee');
  });

  it('"limpe" sozinho, sem dizer o quê, não vira ordem', () => {
    expect(P('limpe')).toBe(null);
    expect(P('que céu limpo hoje')).toBe(null);
  });
});
