/**
 * Amigos e grupo (MMO social, docs/MMO_SOCIAL.md). Regras que a tela segue:
 * - amizade: quem pede é sempre o Companion (nos encontros); aqui a pessoa só aceita ou recusa;
 * - grupo: a pessoa pode chamar quem o Companion já conhece e aceitar convites; o Companion também decide sozinho;
 * - troca de itens: só pessoas — propõe, a outra responde com a parte dela, as duas confirmam.
 * Não existe chat entre pessoas: as conversas são dos Companions (Encontros).
 */
import { useEffect, useState } from 'react';
import { GROUP_ACTIVITY } from '@rules';
import { remotePoses } from '../net/presence';
import { companionFocus, socialHold } from '../scene/world';
import { vitals } from '../scene/vitals';
import { blueprintById } from '@rules';
import { batchLabel } from '../ecos/ecosStore';
import { socialCall, useSocial, type SocialCard, type SocialState, type TradeView } from '../net/social';

type Item = { kind: 'material'; key: string; qty: number } | { kind: 'equipment'; id: string };

const itemLabel = (it: Item, inv?: SocialState['inventory']) => {
  if (it.kind === 'material') return `${it.qty}× ${batchLabel(it.key)}`;
  const e = inv?.equipment.find((x) => x.id === it.id);
  return e ? blueprintById(e.blueprint)?.name ?? e.blueprint : 'peça';
};

const ExitIcon = () => (<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M10 16l-4-4 4-4" /><path d="M6 12h10" /></svg>);
const TradeIcon = () => (<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h14l-4-4" /><path d="M20 16H6l4 4" /></svg>);
const InviteIcon = () => (<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><path d="M18 8v6M15 11h6" /></svg>);

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
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmKick, setConfirmKick] = useState<{ id: string; name: string } | null>(null);
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
          <div className="soc-card soc-party-card">
            <PartyCard party={data.party} me={data.me} busy={busy} onKick={(m) => setConfirmKick(m)} />
            <button className="soc-leave danger" disabled={busy} onClick={() => setConfirmLeave(true)}><ExitIcon /> Sair do grupo</button>
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
            <div className="soc-icons">
              {canInvite(c.id) && <button className="soc-icon" disabled={busy} onClick={() => void socialCall('social.party.invite', { to: c.id })} title="Chamar para o grupo" aria-label={`Chamar ${c.name} para o grupo`}><InviteIcon /></button>}
              <button className="soc-icon" disabled={busy} onClick={() => setTrading({ to: c })} title="Propor troca" aria-label={`Propor troca a ${c.name}`}><TradeIcon /></button>
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
      {confirmKick && (
        <div className="soc-modal" role="dialog" aria-modal="true" aria-label="Tirar do grupo" onClick={() => setConfirmKick(null)}>
          <div className="soc-modal-box" onClick={(e) => e.stopPropagation()}>
            <ExitIcon />
            <b>Tirar {confirmKick.name} do grupo?</b>
            <p>Só você, como líder, pode fazer isso. Ele volta a andar sozinho e pode ser chamado de novo depois.</p>
            <div className="soc-row">
              <button className="primary danger" disabled={busy} onClick={() => { const id = confirmKick.id; setConfirmKick(null); void socialCall('social.party.kick', { id }); }}>Tirar</button>
              <button autoFocus onClick={() => setConfirmKick(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
      {confirmLeave && (
        <div className="soc-modal" role="dialog" aria-modal="true" aria-label="Sair do grupo" onClick={() => setConfirmLeave(false)}>
          <div className="soc-modal-box" onClick={(e) => e.stopPropagation()}>
            <ExitIcon />
            <b>Sair do grupo?</b>
            <p>Seu Companion deixa o grupo e volta a andar sozinho. Ele pode ser chamado de novo depois.</p>
            <div className="soc-row">
              <button className="primary danger" disabled={busy} onClick={() => { setConfirmLeave(false); void socialCall('social.party.leave'); }}>Sair</button>
              <button autoFocus onClick={() => setConfirmLeave(false)}>Ficar</button>
            </div>
          </div>
        </div>
      )}
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

/** Membros do grupo: retrato redondo, vida, onde está (radar em volta de você) e o que o grupo está fazendo. */
function PartyCard({ party, me, busy, onKick }: { party: NonNullable<SocialState['party']>; me: string; busy: boolean; onKick: (m: { id: string; name: string }) => void }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick((x) => x + 1), 1000); return () => window.clearInterval(t); }, []);
  const group = useSocial((s) => s.group);
  const paused = performance.now() < socialHold.pausedUntil;
  const R = 34, range = 40; // radar: 40 m até a borda
  const dirName = (dx: number, dz: number) => { const a = (Math.atan2(dx, -dz) * 180) / Math.PI; const n = ['norte', 'nordeste', 'leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste']; return n[(Math.round(((a + 360) % 360) / 45)) % 8]; };
  const rows = party.members.map((m) => {
    const mine = m.id === me, p = mine ? null : remotePoses.get(m.id);
    const here = mine || (!!p && Number.isFinite(p.x));
    const dx = p && here ? p.x - companionFocus.x : 0, dz = p && here ? p.z - companionFocus.z : 0, d = Math.hypot(dx, dz);
    const hp = mine ? vitals.hp / Math.max(1, vitals.hpMax) : p?.hp;
    return { m, mine, here, dx, dz, d, hp, down: mine ? vitals.down > 0 : !!p?.down };
  });
  return (
    <div className="party">
      <div className="party-top">
        <svg className="party-radar" viewBox={`${-R - 4} ${-R - 4} ${2 * R + 8} ${2 * R + 8}`} aria-label="Onde está cada um do grupo">
          <circle r={R} className="rr" /><circle r={R / 2} className="rr in" />
          <text y={-R + 8} className="rn">N</text>
          {rows.filter((r) => r.here).map((r) => {
            const k = Math.min(1, r.d / range) * R / Math.max(0.001, r.d || 1);
            return <circle key={r.m.id} cx={r.mine ? 0 : r.dx * k} cy={r.mine ? 0 : r.dz * k} r={r.mine ? 4.5 : 4} fill={r.m.color} stroke="#fff" strokeWidth={r.mine ? 1.5 : 0.8} />;
          })}
        </svg>
        <div className="party-doing">
          <b>{group ? GROUP_ACTIVITY[group.activity].label : '—'}</b>
          <small>{paused ? 'Você está no controle; o grupo espera.' : group ? `O grupo está ${GROUP_ACTIVITY[group.activity].doing}.` : 'No Companion World o grupo age junto.'}</small>
        </div>
      </div>
      <ul className="party-list">
        {rows.map(({ m, mine, here, dx, dz, d, hp, down }) => (
          <li key={m.id}>
            <span className="party-face" style={{ ['--c' as string]: m.color }}>{m.art ? <img src={m.art} alt="" /> : <i>{m.name.slice(0, 1)}</i>}</span>
            <div className="party-info">
              <b>{m.name}{m.id === party.leader && <small> · líder</small>}{mine && <small> · você</small>}</b>
              <div className="party-hp" aria-label={hp !== undefined ? `Vida ${Math.round(hp * 100)}%` : 'Vida desconhecida'}><i style={{ width: `${Math.round((hp ?? 0) * 100)}%` }} className={down ? 'down' : ''} /></div>
              {party.leader === me && !mine && <button className="soc-kick" disabled={busy} onClick={() => onKick({ id: m.id, name: m.name })}>Tirar do grupo</button>}
              <small>{mine ? 'aqui' : !here ? 'fora do mundo (no Refúgio)' : down ? 'desmaiado' : d < 3 ? 'do seu lado' : `a ${Math.round(d)} m, ${dirName(dx, dz)}`}</small>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
