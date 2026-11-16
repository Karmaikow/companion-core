import { describe, expect, it } from 'vitest';
import { tabGuardDecision } from './tabGuard';

const mine = { who: 'companion-1', tab: 'aba-A' };

describe('uma aba por conta', () => {
  it('a mesma conta entrou em outra aba: esta sai', () => {
    expect(tabGuardDecision(mine, { type: 'entrou', who: 'companion-1', tab: 'aba-B' })).toBe('sair');
  });

  it('o próprio aviso desta aba não a tira do jogo', () => {
    expect(tabGuardDecision(mine, { type: 'entrou', who: 'companion-1', tab: 'aba-A' })).toBe(null);
  });

  it('outra conta em outra aba não interfere', () => {
    expect(tabGuardDecision(mine, { type: 'entrou', who: 'companion-2', tab: 'aba-B' })).toBe(null);
  });

  it('fora do jogo, ou com mensagem estranha, nada acontece', () => {
    expect(tabGuardDecision(null, { type: 'entrou', who: 'companion-1', tab: 'aba-B' })).toBe(null);
    for (const bad of [null, 'entrou', 7, {}, { type: 'saiu', who: 'companion-1', tab: 'aba-B' }, { type: 'entrou', who: 1, tab: 'aba-B' }, { type: 'entrou', who: 'companion-1' }])
      expect(tabGuardDecision(mine, bad)).toBe(null);
  });
});
