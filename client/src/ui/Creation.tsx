import { useMemo, useState } from 'react';
import { TRAIT_GROUPS, TRAIT_BY_ID, MIN_TRAITS, MAX_TRAITS, traitLabel, validateSetup, type Pronoun } from '@rules';
import { useGame } from '../store';

const STEPS = ['Você', 'Companion', 'Personalidade'] as const;

/** Ritual de criação: define quem é você, o nome e o jeito de ser do Companion antes do primeiro encontro. */
export function Creation() {
  const run = useGame((s) => s.run);
  const busy = useGame((s) => s.busy);
  const backend = useGame((s) => s.backend);
  const [step, setStep] = useState(0);
  const [playerName, setPlayerName] = useState('');
  const [name, setName] = useState('');
  const [pronoun, setPronoun] = useState<Pronoun>('ela');
  const [traits, setTraits] = useState<string[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setup = { name: name.trim(), pronoun, playerName: playerName.trim(), traits };
  const check = useMemo(() => validateSetup(setup), [name, pronoun, playerName, traits]); // eslint-disable-line react-hooks/exhaustive-deps

  const okPlayer = /^[\p{L}][\p{L}\p{M}' .-]{1,29}$/u.test(playerName.trim());
  const okName = /^[\p{L}][\p{L}\p{M}' -]{1,23}$/u.test(name.trim()) && name.trim().toLowerCase() !== playerName.trim().toLowerCase();

  function toggle(id: string) {
    const t = TRAIT_BY_ID[id];
    setHint(t.description);
    setTraits((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      let next = t.group.exclusive ? cur.filter((x) => TRAIT_BY_ID[x].group.id !== t.group.id) : cur;
      if (next.length >= MAX_TRAITS) next = next.slice(1);
      return [...next, id];
    });
  }

  function submit() {
    if (!check.ok) { setError(check.error); return; }
    setError(null);
    void run((b) => b.create(setup));
  }

  const he = pronoun === 'ele';
  return (
    <div className="entry creation">
      <div className="entry-card ritual">
        <ol className="steps" aria-label="Etapas">
          {STEPS.map((s, i) => <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}>{s}</li>)}
        </ol>

        {step === 0 && (
          <form onSubmit={(e) => { e.preventDefault(); if (okPlayer) setStep(1); }}>
            <h2>Antes de tudo…</h2>
            <p className="lede">O núcleo de luz está despertando e quer saber quem está ao lado dele.</p>
            <label>Como você se chama?
              <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="Seu nome ou apelido" maxLength={30} autoFocus autoComplete="given-name" />
            </label>
            <button type="submit" className="primary" disabled={!okPlayer}>Continuar</button>
          </form>
        )}

        {step === 1 && (
          <form onSubmit={(e) => { e.preventDefault(); if (okName) setStep(2); }}>
            <h2>Um nome para a luz</h2>
            <label>Como seu Companion vai se chamar?
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Lumi, Aurora, Kai" maxLength={24} autoFocus />
            </label>
            <fieldset className="pronoun">
              <legend>Ao falar de si, usa</legend>
              {(['ela', 'ele'] as const).map((p) => (
                <button key={p} type="button" aria-pressed={pronoun === p} onClick={() => setPronoun(p)}>{p === 'ela' ? 'Ela · "estou curiosa"' : 'Ele · "estou curioso"'}</button>
              ))}
            </fieldset>
            {name.trim() && !okName && <p className="msg err">{name.trim().toLowerCase() === playerName.trim().toLowerCase() ? 'Escolha um nome diferente do seu.' : 'Use só letras (2 a 24).'}</p>}
            <div className="row">
              <button type="button" className="ghost" onClick={() => setStep(0)}>Voltar</button>
              <button type="submit" className="primary" disabled={!okName}>Continuar</button>
            </div>
          </form>
        )}

        {step === 2 && (
          <div className="traits-step">
            <h2>Como {name.trim() || 'seu Companion'} é por dentro?</h2>
            <p className="note">Escolha de {MIN_TRAITS} a {MAX_TRAITS} traços. Eles moldam o jeito de falar e, no futuro, as escolhas que {he ? 'ele' : 'ela'} faz {he ? 'sozinho' : 'sozinha'}.</p>
            <div className="trait-groups">
              {TRAIT_GROUPS.map((g) => (
                <fieldset key={g.id}>
                  <legend>{g.title}{g.exclusive && <small> · escolha uma</small>}</legend>
                  <div className="chips">
                    {g.options.map((o) => (
                      <button key={o.id} type="button" className="chip-btn" aria-pressed={traits.includes(o.id)} onClick={() => toggle(o.id)} onMouseEnter={() => setHint(o.description)} onFocus={() => setHint(o.description)}>
                        {he ? o.m : o.f}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
            <p className="trait-hint" aria-live="polite">{hint ?? 'Toque num traço para ver o que ele significa.'}</p>
            <div className="summary">
              <strong>{name.trim()}</strong> · {traits.length ? traits.map((id) => traitLabel(id, pronoun).toLowerCase()).join(', ') : 'nenhum traço ainda'}
              <span className={traits.length >= MIN_TRAITS ? 'count ok' : 'count'}>{traits.length}/{MAX_TRAITS}</span>
            </div>
            {error && <p className="msg err">{error}</p>}
            <div className="row">
              <button type="button" className="ghost" onClick={() => setStep(1)}>Voltar</button>
              <button type="button" className="primary" disabled={busy || traits.length < MIN_TRAITS} onClick={submit}>{busy ? 'Despertando…' : 'Dar vida ao núcleo'}</button>
            </div>
            {backend?.kind === 'local' && <small className="note">Modo offline: respostas simples, sem IA.</small>}
          </div>
        )}
      </div>
    </div>
  );
}
