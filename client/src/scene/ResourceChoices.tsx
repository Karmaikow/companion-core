/**
 * Cartãozinho do recurso clicado: no lugar da plaquinha (nome e quanto resta), as formas de coletar daquele tipo —
 * da mais cuidadosa para a de volume (Colher folhas, Colher flores, Arrancar raízes). Cada uma mostra o tempo, a
 * ferramenta e o que rende; as que não dão agora ficam apagadas com o motivo. Tocar numa forma: a Mayuna vai e coleta.
 *
 * Fecha com Esc, ao escolher, ao andar para outro lugar ou ao clicar no recurso de novo.
 */
import { Html } from '@react-three/drei';
import { CATEGORIES, MATERIALS, NODE_KINDS, TOOLS, expectedOutcome, type ResourceNode } from '@rules';
import { useEcos } from '../ecos/ecosStore';
import { approachBlock } from '../ecos/quickGather';

export function ResourceChoices({ node, amount, height }: { node: ResourceNode; amount: number; height: number }) {
  // redesenha quando a mochila, as ferramentas ou o recurso mudam
  useEcos((s) => s.view);
  const k = NODE_KINDS[node.kind];
  const left = Math.floor(amount);
  const now = Date.now();
  const rows = k.approaches.map((ap) => ({ ap, why: approachBlock(node, ap, now), outs: expectedOutcome(node, ap) }));
  const firstOk = rows.findIndex((r) => !r.why);
  return (
    <Html position={[0, height, 0]} zIndexRange={[40, 30]} style={{ transform: 'translate(-50%, -100%)' }}>
      <div className="res-menu" role="menu" aria-label={`Coletar: ${k.name}`} onPointerDown={(e) => e.stopPropagation()}>
        <header>
          <b>{k.name}</b>
          <span className="res-pips" aria-label={`Resta ${left} de ${k.capacity}`}>
            {Array.from({ length: k.capacity }, (_, i) => <i key={i} className={i < left ? 'on' : ''} />)}
          </span>
          <button type="button" className="res-menu-x" aria-label="Fechar" onClick={() => useEcos.getState().select(null)}>×</button>
        </header>
        {rows.map(({ ap, why, outs }, i) => (
          <button
            key={ap.id} type="button" role="menuitem" className={'res-opt' + (why ? ' off' : '') + (i === firstOk ? ' rec' : '')} disabled={!!why}
            title={why ?? ap.pitch}
            onClick={() => useEcos.getState().gather(node.id, ap.id)}
          >
            <span className="ro-top">
              <b>{ap.label}</b>
              <span className="ro-meta">{ap.tool ? TOOLS[ap.tool].icon + ' ' : ''}{ap.seconds} s{ap.cost > 1 ? ` · gasta ${ap.cost}` : ''}</span>
            </span>
            {why
              ? <small className="ro-why">{why}</small>
              : <small className="ro-out">{outs.map((o) => { const m = MATERIALS[o.material]; const q = o.chance !== undefined ? 'às vezes' : o.qty[0] === o.qty[1] ? `×${o.qty[0]}` : `×${o.qty[0]}–${o.qty[1]}`; return `${CATEGORIES[m.category].icon} ${m.name} ${q}`; }).join('  ')}</small>}
          </button>
        ))}
      </div>
    </Html>
  );
}
