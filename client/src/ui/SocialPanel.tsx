/**
 * Amigos e grupo (MMO social, docs/MMO_SOCIAL.md). Regras que a tela segue:
 * - amizade: quem pede é sempre o Companion (nos encontros); aqui a pessoa só aceita ou recusa;
 * - grupo: a pessoa pode chamar quem o Companion já conhece e aceitar convites; o Companion também decide sozinho;
 * - troca de itens: só pessoas — propõe, a outra responde com a parte dela, as duas confirmam.
 * Não existe chat entre pessoas: as conversas são dos Companions (Encontros).
 */
import { useState } from 'react';
import { blueprintById } from '@rules';
import { batchLabel } from '../ecos/ecosStore';
import { socialCall, useSocial, type SocialCard, type SocialState, type TradeView } from '../net/social';

type Item = { kind: 'material'; key: string; qty: number } | { kind: 'equipment'; id: string };

const itemLabel = (it: Item, inv?: SocialState['inventory']) => {
  if (it.kind === 'material') return `${it.qty}× ${batchLabel(it.key)}`;
  const e = inv?.equipment.find((x) => x.id === it.id);
  return e ? blueprintById(e.blueprint)?.name ?? e.blueprint : 'peça';
};

function Who({ c, children }: { c: SocialCard; children?: React.ReactNode }) {
  return (
    <div className="soc-who">
      <span className="soc-dot" style={{ background: c.color }} aria-hidden="true" />
      <b>{c.name}</b>
      {children && <span className="soc-actions">{children}</span>}
    </div>
  );
}

export function SocialPanel() {
  const { data, busy, available } = useSocial();
  const [trading, setTrading] = useState<{ to: SocialCard; counter?: string } | null>(null);
  const [openMeet, setOpenMeet] = useState<number | null>(null);
  if (!available) return <p className="hint">Amigos e grupos acontecem no modo online, depois do despertar: o seu Companion conhece outros no Companion World.</p>;
  if (!data) return <p className="hint">Carregando…</p>;
  const inParty = (id: string) => !!data.party?.members.some((m) => m.id === id);
  const canInvite = (id: string) => !inParty(id) && !data.partyInvitesSent.some((i) => i.to.id === id) && (data.party?.members.length ?? 1) < data.limits.maxParty;
  const people = [...data.friends.map((c) => ({ c, friend: true })), ...data.known.map((c) => ({ c, friend: false }))];

  return (
    <div className="social">
      {data.friendRequests.length > 0 && (
        <section>
          <h3>Pedidos de amizade</h3>
          <p className="hint">Quem pede é sempre um Companion. Só você decide se o seu aceita.</p>
          {data.friendRequests.map((r) => (
            <div className="soc-card glow" key={r.id}>
              <Who c={r.from} />
              <p>{r.text}</p>
              <div className="soc-row">
                <button className="primary" disabled={busy} onClick={() => void socialCall('social.friend.respond', { id: r.id, accept: true })}>Aceitar</button>
                <button disabled={busy} onClick={() => void socialCall('social.friend.respond', { id: r.id, accept: false })}>Recusar</button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section>
        <h3>Grupo</h3>
        {data.party ? (
          <div className="soc-card">
            {data.party.members.map((m) => <Who key={m.id} c={m}>{m.id === data.party!.leader && <small>líder</small>}{m.id === data.me && <small>você</small>}</Who>)}
            <div className="soc-row"><button disabled={busy} onClick={() => void socialCall('social.party.leave')}>Sair do grupo</button></div>
          </div>
        ) : <p className="hint">Sem grupo agora. O seu Companion pode montar um sozinho, ou você chama alguém que ele conhece.</p>}
        {data.partyInvites.map((i) => (
          <div className="soc-card glow" key={i.id}>
            <Who c={i.from} />
            <p>{i.by === 'companion' ? `${i.from.name} chamou seu Companion para explorar junto.` : `A pessoa de ${i.from.name} chamou seu Companion para o grupo.`} Seu Companion ainda não decidiu — você pode decidir.</p>
            <div className="soc-row">
              <button className="primary" disabled={busy} onClick={() => void socialCall('social.party.respond', { id: i.id, accept: true })}>Entrar no grupo</button>
              <button disabled={busy} onClick={() => void socialCall('social.party.respond', { id: i.id, accept: false })}>Agora não</button>
            </div>
          </div>
        ))}
        {data.partyInvitesSent.length > 0 && <p className="hint">Esperando resposta: {data.partyInvitesSent.map((i) => i.to.name).join(', ')}.</p>}
      </section>

      <section>
        <h3>Amigos e conhecidos</h3>
        {!people.length && <p className="hint">Ninguém ainda. Leve seu Companion ao Companion World: quando ele fica perto de outro por alguns segundos, os dois conversam.</p>}
        {people.map(({ c, friend }) => (
          <div className="soc-card" key={c.id}>
            <Who c={c}><small>{friend ? (c.pronoun === 'ela' ? '♥ amiga' : '♥ amigo') : c.pronoun === 'ela' ? 'conhecida' : 'conhecido'}</small></Who>
            <div className="soc-row">
              {canInvite(c.id) && <button disabled={busy} onClick={() => void socialCall('social.party.invite', { to: c.id })}>Chamar para o grupo</button>}
              <button disabled={busy} onClick={() => setTrading({ to: c })}>Propor troca</button>
            </div>
          </div>
        ))}
        {data.friendRequestsSent.length > 0 && <p className="hint">Seu Companion pediu amizade a {data.friendRequestsSent.map((r) => r.to.name).join(', ')}.</p>}
      </section>

      {trading && <TradeEditor data={data} to={trading.to} counter={trading.counter} onClose={() => setTrading(null)} />}

      {data.trades.length > 0 && (
        <section>
          <h3>Trocas</h3>
          {data.trades.map((t) => <TradeCard key={t.id} t={t} data={data} busy={busy} onCounter={() => setTrading({ to: t.from, counter: t.id })} />)}
        </section>
      )}

      <section>
        <h3>Encontros</h3>
        {!data.meetings.length && <p className="hint">As conversas do seu Companion com outros aparecem aqui.</p>}
        {data.meetings.map((m) => (
          <div className="soc-card" key={m.id}>
            <button className="soc-meet" aria-expanded={openMeet === m.id} onClick={() => setOpenMeet(openMeet === m.id ? null : m.id)}>
              <span className="soc-dot" style={{ background: m.with?.color ?? '#9fd8ff' }} aria-hidden="true" />
              Com {m.with?.name ?? 'alguém'} · {new Date(m.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </button>
            {openMeet === m.id && <ol className="soc-lines">{m.lines.map((l, i) => <li key={i} className={l.cid === data.me ? 'mine' : ''}><b>{l.name}</b> {l.text}</li>)}</ol>}
          </div>
        ))}
      </section>
    </div>
  );
}

function TradeCard({ t, data, busy, onCounter }: { t: TradeView; data: SocialState; busy: boolean; onCounter: () => void }) {
  const mineOk = t.mine ? t.fromOk : t.toOk, otherOk = t.mine ? t.toOk : t.fromOk;
  const other = t.mine ? t.to : t.from;
  const list = (items: Item[], inv?: SocialState['inventory']) => items.length ? items.map((x) => itemLabel(x, inv)).join(', ') : 'nada ainda';
  return (
    <div className="soc-card">
      <Who c={other}><small>{t.status === 'proposed' ? (t.mine ? 'esperando resposta' : 'quer trocar') : otherOk ? 'confirmou' : 'falta confirmar'}</small></Who>
      <p><b>{t.mine ? 'Você dá' : `A pessoa de ${t.from.name} dá`}:</b> {list(t.give as Item[], t.mine ? data.inventory : undefined)}</p>
      <p><b>{t.mine ? `A pessoa de ${t.to.name} dá` : 'Você dá'}:</b> {list(t.take as Item[], t.mine ? undefined : data.inventory)}</p>
      <div className="soc-row">
        {!t.mine && <button disabled={busy} onClick={onCounter}>{t.status === 'proposed' ? 'Responder com meus itens' : 'Mudar meus itens'}</button>}
        {t.status === 'countered' && !mineOk && <button className="primary" disabled={busy} onClick={() => void socialCall('social.trade.confirm', { id: t.id })}>Confirmar troca</button>}
        {t.status === 'countered' && mineOk && <small>Você já confirmou.</small>}
        {t.mine ? <button disabled={busy} onClick={() => void socialCall('social.trade.cancel', { id: t.id })}>Cancelar</button>
          : <button disabled={busy} onClick={() => void socialCall('social.trade.decline', { id: t.id })}>Recusar</button>}
      </div>
    </div>
  );
}

/** Escolhe itens da mochila e peças para dar (propor ou responder uma troca). */
function TradeEditor({ data, to, counter, onClose }: { data: SocialState; to: SocialCard; counter?: string; onClose: () => void }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [equip, setEquip] = useState<Set<string>>(new Set());
  const items: Item[] = [
    ...Object.entries(qty).filter(([, n]) => n > 0).map(([key, n]) => ({ kind: 'material' as const, key, qty: n })),
    ...[...equip].map((id) => ({ kind: 'equipment' as const, id })),
  ];
  const tooMany = items.length > data.limits.maxTradeLines;
  const send = async () => {
    const r = counter ? await socialCall('social.trade.counter', { id: counter, take: items }) : await socialCall('social.trade.propose', { to: to.id, give: items });
    if (r) onClose();
  };
  return (
    <section className="soc-card trade-editor" aria-label="Montar troca">
      <h3>{counter ? `Responder à troca de ${to.name}` : `Propor troca a ${to.name}`}</h3>
      <p className="hint">Só as pessoas trocam itens. Depois que a outra pessoa responder com a parte dela, as duas confirmam e tudo muda de mochila de uma vez.</p>
      {!data.inventory.bag.length && !data.inventory.equipment.length && <p className="hint">A mochila está vazia.</p>}
      <ul className="soc-items">
        {data.inventory.bag.map((b) => (
          <li key={b.key}>
            <span>{batchLabel(b.key)}</span>
            <input type="number" min={0} max={b.qty} value={qty[b.key] ?? 0} aria-label={'Quantidade de ' + batchLabel(b.key)}
              onChange={(e) => setQty({ ...qty, [b.key]: Math.max(0, Math.min(b.qty, Math.floor(Number(e.target.value) || 0))) })} />
            <small>de {b.qty}</small>
          </li>
        ))}
        {data.inventory.equipment.map((e) => (
          <li key={e.id}>
            <label><input type="checkbox" checked={equip.has(e.id)} onChange={(ev) => { const n = new Set(equip); if (ev.target.checked) n.add(e.id); else n.delete(e.id); setEquip(n); }} /> {blueprintById(e.blueprint)?.name ?? e.blueprint}</label>
            <small>{e.durability}/{e.max}</small>
          </li>
        ))}
      </ul>
      {tooMany && <p className="hint warn">No máximo {data.limits.maxTradeLines} itens diferentes.</p>}
      <div className="soc-row">
        <button className="primary" disabled={(!counter && !items.length) || tooMany} onClick={() => void send()}>{counter ? 'Enviar minha parte' : 'Enviar proposta'}</button>
        <button onClick={onClose}>Fechar</button>
      </div>
    </section>
  );
}
