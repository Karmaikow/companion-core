/**
 * Coleta com um clique: tocar no recurso faz a Companion ir até ele e coletar do jeito mais leve que der agora
 * (as abordagens vêm em ordem, da mais cuidadosa para a de volume). Antes havia uma janela com todas as abordagens,
 * propriedades e usos; ela saiu (pedido de 2026-11-20) e, quando nenhuma abordagem serve, aparece só um aviso curto.
 */
import { NODE_KINDS, TOOLS, msUntilAvailable, superiorBlockFor, type Approach, type ResourceNode } from '@rules';
import { usePacto } from '../pacto/pactoStore';
import { useGame } from '../store';
import { amountOf, bagUsedOf, toolBelt, useEcos } from './ecosStore';
import { findNode } from './worldNodes';

const fmtTime = (ms: number) => { const m = Math.ceil(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : `${m} min`; };

/** Por que esta abordagem não dá agora (texto curto), ou null se dá. */
export function approachBlock(node: ResourceNode, ap: Approach, now = Date.now()): string | null {
  const view = useEcos.getState().view;
  const forms = usePacto.getState().view?.cls;
  const superior = superiorBlockFor(node.id, forms?.forms?.length ? forms.forms : forms?.effective ?? null);
  if (superior) return superior;
  const tools = view?.profile.tools ?? [];
  if (ap.tool && !tools.includes(ap.tool)) return `Precisa de ${TOOLS[ap.tool].label} (Loja de Equipamentos de Áster ou a Forja de uma Taurina).`;
  if (ap.tool && toolBelt.get(ap.tool) === false) return `${TOOLS[ap.tool].label} está guardada: equipe no Inventário → Ferramentas.`;
  if (amountOf(view, node) < ap.cost) {
    const wait = msUntilAvailable(node, ap, view?.nodes[node.id] ?? null, now);
    return wait > 0 ? `Esgotado por agora: volta em ~${fmtTime(wait)}.` : 'Esgotado por agora.';
  }
  const wait = msUntilAvailable(node, ap, view?.nodes[node.id] ?? null, now);
  if (wait > 0) return `Esgotado por agora: volta em ~${fmtTime(wait)}.`;
  const free = (view?.config.bag ?? 60) - bagUsedOf(view);
  if (free < ap.yields.reduce((a, y) => a + y.qty[1], 0)) return 'Mochila cheia (ou quase): libere espaço.';
  return null;
}

/** A primeira abordagem que dá agora, ou o motivo de nenhuma dar (o da mais leve). */
export function pickApproach(node: ResourceNode, now = Date.now()): { approach: Approach } | { blocked: string } {
  const aps = NODE_KINDS[node.kind].approaches;
  let first: string | null = null;
  for (const ap of aps) {
    const why = approachBlock(node, ap, now);
    if (!why) return { approach: ap };
    first ??= why;
  }
  return { blocked: first ?? 'Não dá para coletar agora.' };
}

/** Clique no recurso: coleta (ou avisa por que não dá). Clicar de novo no que já está sendo coletado não reinicia. */
export function quickGather(nodeId: string) {
  const n = findNode(nodeId);
  if (!n) return;
  const run = useEcos.getState().run;
  if (run?.node === nodeId && ['andando', 'coletando', 'confirmando'].includes(run.phase)) return;
  const pick = pickApproach(n);
  if ('blocked' in pick) { useGame.getState().toast(pick.blocked, 'warn'); return; }
  useEcos.getState().gather(n.id, pick.approach.id);
}
