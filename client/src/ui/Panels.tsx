import { useEffect, useRef, useState } from 'react';
import { QUESTS, QUEST_REWARDS, FORM_FAMILIES, ELEMENTS } from '@rules';
import { useGame } from '../store';

const QUEST_FIELD: Record<string, (d: Record<string, unknown>) => string | null> = {
  identity: (d) => (d.name as string) ?? null,
  color: (d) => (d.colorName as string) ?? null,
  traits: (d) => ((d.traits as string[]) ?? []).join(', ') || null,
  species: (d) => (d.species as string) ?? null,
  essence: (d) => (d.element ? ELEMENTS[d.element as keyof typeof ELEMENTS].label : null),
  bond: (d) => (d.playerAddress as string) ?? null,
  dream: (d) => (d.dream as string) ?? null,
};

function when(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ', ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function ChatPanel() {
  const snap = useGame((s) => s.snap);
  const busy = useGame((s) => s.busy);
  const run = useGame((s) => s.run);
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const lines = (snap?.timeline ?? []).filter((e) => e.kind === 'chat.player' || e.kind === 'chat.companion' || e.kind === 'quest.completed');
  const name = snap?.companion?.discoveries.name ?? 'Núcleo';
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [lines.length, busy]);
  const send = () => {
    const m = text.trim();
    if (!m || busy) return;
    setText('');
    void run((b) => b.chat(m));
  };
  return (
    <div className="chat">
      <div className="chat-list" ref={list}>
        {lines.length === 0 && <p className="empty">O núcleo pulsa, esperando a primeira palavra. Diga oi.</p>}
        {lines.map((e) =>
          e.kind === 'quest.completed' ? (
            <div key={e.id} className="line system">✦ {QUESTS.find((q) => q.key === e.payload.quest)?.title} — descoberta registrada</div>
          ) : (
            <div key={e.id} className={'line ' + (e.kind === 'chat.player' ? 'me' : 'them')}>
              {e.kind === 'chat.companion' && <span className="who">{name}</span>}
              {String(e.payload.text ?? '')}
            </div>
          ),
        )}
        {busy && <div className="line them typing" aria-label="pensando"><span /><span /><span /></div>}
      </div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva para o seu Companion…" maxLength={1000} aria-label="Mensagem" />
        <button type="submit" disabled={busy || !text.trim()}>Enviar</button>
      </form>
    </div>
  );
}

export function MemoriesPanel() {
  const mems = useGame((s) => s.snap?.memories ?? []);
  const label = { player: 'Sobre você', companion: 'Sobre mim', shared: 'Nós dois' } as const;
  if (!mems.length) return <p className="empty">Nenhuma memória ainda. Conte algo sobre você — do que gosta, o que viveu hoje.</p>;
  return (
    <ul className="memories">
      {mems.map((m) => (
        <li key={m.id}>
          <div className="mem-head">
            <span className={'chip ' + m.subject}>{label[m.subject]}</span>
            <span className="stars" aria-label={`importância ${m.importance} de 5`}>{'●'.repeat(m.importance)}<i>{'●'.repeat(5 - m.importance)}</i></span>
          </div>
          <p>{m.content}</p>
          <small title={`eventos ${m.source_event_ids.join(', ')}`}>{m.origin === 'dream' ? 'Percebida ao sonhar' : 'Da conversa'} · rastreável a {m.source_event_ids.length} {m.source_event_ids.length === 1 ? 'evento' : 'eventos'}</small>
        </li>
      ))}
    </ul>
  );
}

export function DiaryPanel() {
  const diary = useGame((s) => s.snap?.diary ?? []);
  const busy = useGame((s) => s.busy);
  const run = useGame((s) => s.run);
  return (
    <div className="diary">
      <button className="secondary" disabled={busy} onClick={() => void run((b) => b.dream())}>Descansar e escrever no diário</button>
      {diary.length === 0 && <p className="empty">O diário está em branco. Depois de algumas conversas, deixe seu Companion descansar para ele escrever a primeira página.</p>}
      {diary.map((d) => (
        <article key={d.id} className="page">
          <header>Dia {d.game_day} do Refúgio <small>{when(d.created_at)}</small></header>
          <p>{d.body}</p>
          <small>Escrito a partir de {d.source_event_ids.length} eventos registrados</small>
        </article>
      ))}
    </div>
  );
}

export function QuestsPanel() {
  const snap = useGame((s) => s.snap);
  const quests = snap?.quests ?? [];
  const d = (snap?.companion?.discoveries ?? {}) as Record<string, unknown>;
  return (
    <ol className="quests">
      {QUESTS.map((q) => {
        const st = quests.find((s) => s.key === q.key);
        const done = st?.status === 'done';
        const value = QUEST_FIELD[q.key](d);
        return (
          <li key={q.key} className={done ? 'done' : ''}>
            <span className="mark" aria-hidden>{done ? '✦' : '○'}</span>
            <div>
              <strong>{q.title}</strong>
              <p>{done && value ? value : q.discovery}</p>
              {!done && q.key === 'bond' && <small>Requer vínculo nível {snap?.config?.firstBondLevel ?? 2}</small>}
            </div>
          </li>
        );
      })}
      <p className="hint">As descobertas surgem da conversa. Não há respostas certas: o Companion decide junto com você.</p>
    </ol>
  );
}

export function InventoryPanel() {
  const inv = useGame((s) => s.snap?.inventory ?? []);
  const slots = Object.values(QUEST_REWARDS);
  return (
    <div className="inventory">
      {slots.map((r) => {
        const it = inv.find((i) => i.item_key === r.item);
        return (
          <div key={r.item} className={'slot' + (it ? ' has' : '')} title={it ? r.description : 'Ainda não descoberto'}>
            <span className="gem" style={it?.meta.color ? { background: String(it.meta.color) } : undefined} />
            <strong>{it ? r.label : '???'}</strong>
            <small>{it ? r.description : 'Conclua uma quest para encontrar'}</small>
          </div>
        );
      })}
    </div>
  );
}

export function BondPanel() {
  const snap = useGame((s) => s.snap);
  const busy = useGame((s) => s.busy);
  const run = useGame((s) => s.run);
  const c = snap?.companion;
  const a = snap?.awakening;
  if (!c || !a) return null;
  const d = c.discoveries;
  const pct = Math.round(c.bond.ratio * 100);
  const last = snap?.turn?.xp;
  return (
    <div className="bond">
      <div className="bond-level">
        <span>Vínculo</span>
        <strong>{c.bond.level}</strong>
      </div>
      <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: pct + '%' }} /></div>
      <small>{c.bond.xp - c.bond.from} / {c.bond.to - c.bond.from} até o nível {c.bond.level + 1}</small>
      {last && (
        <p className="xp-note">
          Última conversa: +{last.total} {last.parts.message === 0 && last.reason !== 'ok' ? `(mensagem sem XP: ${last.reason})` : ''}
        </p>
      )}
      <h3>Despertar</h3>
      <ul className="checklist">
        <li className={a.questsDone >= a.questsNeeded ? 'ok' : ''}>Quests fundamentais {a.questsDone}/{a.questsNeeded}</li>
        <li className={a.bondLevel >= a.bondNeeded ? 'ok' : ''}>Vínculo nível {a.bondLevel}/{a.bondNeeded}</li>
      </ul>
      {c.stage === 'awakened' && c.identityContract ? (
        <div className="contract">
          <p>{d.name} despertou como {FORM_FAMILIES[c.identityContract.species.family].label.toLowerCase()} de {c.identityContract.element.label.toLowerCase()}.</p>
          <small>Contrato de identidade v{c.identityContract.version} · arte final: {snap?.visualJob?.status === 'queued' ? 'na fila do Studio' : snap?.visualJob?.status ?? '—'}</small>
          <details>
            <summary>Ver JSON de identidade</summary>
            <pre>{JSON.stringify(c.identityContract, null, 2)}</pre>
          </details>
        </div>
      ) : (
        <button className="awaken" disabled={!a.ready || busy} onClick={() => void run((b) => b.awaken())}>
          {a.ready ? 'Despertar a primeira forma' : 'Ainda não é hora'}
        </button>
      )}
    </div>
  );
}
