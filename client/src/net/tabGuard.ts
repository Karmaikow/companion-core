/**
 * Uma aba por conta. Duas abas do mesmo navegador com a mesma conta dividem a mesma sessão e o mesmo Companion: as
 * duas gravando ao mesmo tempo se atropelam, e era numa delas que o jogo ficava preso num erro de sessão. Quando a
 * conta entra no jogo numa aba, as outras abas com a mesma conta saem para a tela de entrada, com o aviso.
 *
 * Só entre abas do mesmo navegador (BroadcastChannel). A sessão em si não é encerrada — ela é a mesma da aba nova,
 * e encerrá-la derrubaria as duas. Outro aparelho ou outro navegador não são vistos daqui.
 */

export const OTHER_TAB_TEXT = 'Este Companion foi aberto em outra aba. Esta aba saiu do jogo.';

interface Msg { type: 'entrou'; who: string; tab: string }

/** O que esta aba faz com um aviso de outra: sair, se for a mesma conta e outra aba; senão nada. */
export function tabGuardDecision(mine: { who: string; tab: string } | null, m: unknown): 'sair' | null {
  if (!mine || !m || typeof m !== 'object') return null;
  const x = m as Partial<Msg>;
  return x.type === 'entrou' && typeof x.who === 'string' && typeof x.tab === 'string' && x.who === mine.who && x.tab !== mine.tab ? 'sair' : null;
}

const TAB = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random());

/**
 * Esta aba entrou no jogo com a conta `who`: avisa as outras e passa a ouvir. `onKicked` é chamado se outra aba
 * entrar depois com a mesma conta. Devolve a função para parar de ouvir (ao sair do jogo).
 */
export function claimTab(who: string, onKicked: () => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const bc = new BroadcastChannel('cc-uma-aba');
  const mine = { who, tab: TAB };
  bc.onmessage = (e) => { if (tabGuardDecision(mine, e.data) === 'sair') onKicked(); };
  bc.postMessage({ type: 'entrou', who, tab: TAB } satisfies Msg);
  return () => bc.close();
}
