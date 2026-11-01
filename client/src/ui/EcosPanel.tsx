/**
 * Painel "Coleta" (Jornada; Ecos da Terra): objetivo e recursos por perto, a mochila, receitas e o que pedir à
 * Companion (intenção, objetivo, risco, espaço reservado, ferramentas e preferência de ambiente). Os recursos nascem
 * por todo o Companion World, pela tabela de cada bioma.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  MATERIALS, CATEGORIES, RECIPES, TOOLS, PROP_LABEL, BAND_LABEL, slotFit, autoPick, batchQuality,
  type ResCategory, type GatheringIntent, type IntentMode, type Zone, type ToolKey,
} from '@rules';
import { useEcos, bagBatches, bagUsedOf, batchLabel, suggestionsNow } from '../ecos/ecosStore';
import { NearbyList, ObjectiveSummary } from './EcosHud';
import { useGame } from '../store';

type Sub = 'perto' | 'mochila' | 'receitas' | 'mayuna';
const SUBS: [Sub, string][] = [['perto', 'Por perto'], ['mochila', 'Mochila'], ['receitas', 'Receitas'], ['mayuna', 'Pedir']];
const rid = () => crypto.randomUUID();

export function EcosPanel() {
  const view = useEcos((s) => s.view), error = useEcos((s) => s.error);
  const stage = useGame((s) => s.snap?.companion?.stage);
  const [sub, setSub] = useState<Sub>('perto');
  useEffect(() => { if (stage === 'awakened') void useEcos.getState().refresh(); }, [stage]);
  if (stage !== 'awakened') return <p className="empty">As expedições começam depois do despertar, quando ela ganha um corpo.</p>;
  return (
    <div className="ecos-tab">
      <div className="mem-tabs" role="tablist">
        {SUBS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={sub === k} className={'chip' + (sub === k ? ' on' : '')} onClick={() => setSub(k)}>{l}</button>)}
      </div>
      {view?.simulated && <p className="hint">Modo offline: tudo aqui é simulado neste aparelho e não vale na economia online.</p>}
      {error && <p className="ecos-error" role="alert">{error}</p>}
      {!view ? <p className="hint">Carregando a expedição…</p> : (
        <>
          {sub === 'perto' && (
            <div className="ecos-vale">
              <ObjectiveSummary />
              <b>Recursos por perto</b>
              <NearbyList />
            </div>
          )}
          {sub === 'mochila' && <Bag />}
          {sub === 'receitas' && <Recipes />}
          {sub === 'mayuna' && <Ask />}
        </>
      )}
    </div>
  );
}

export function Bag() {
  const view = useEcos((s) => s.view)!;
  const list = bagBatches(view), used = bagUsedOf(view);
  const byCat = useMemo(() => {
    const m = new Map<ResCategory, typeof list>();
    for (const b of list) { const c = MATERIALS[b.material].category; m.set(c, [...(m.get(c) ?? []), b]); }
    return [...m.entries()];
  }, [list]);
  return (
    <div className="ecos-bag">
      <p><b>Mochila {used}/{view.config.bag}</b>{used >= view.config.bag ? ' — cheia: a próxima coleta é recusada (nada se perde)' : ''}</p>
      <div className="bar"><i style={{ width: `${Math.min(100, (used / view.config.bag) * 100)}%` }} /></div>
      <p className="hint">Ferramentas: {view.profile.tools.map((t) => `${TOOLS[t as ToolKey]?.icon ?? ''} ${TOOLS[t as ToolKey]?.label ?? t}`).join(' · ')}</p>
      {!list.length && <p className="empty">Vazia. Lotes parecidos se juntam pela faixa das propriedades (baixa, média, alta).</p>}
      {byCat.map(([cat, items]) => (
        <section key={cat}>
          <h4>{CATEGORIES[cat].icon} {CATEGORIES[cat].label}</h4>
          <ul>
            {items.map((b) => (
              <li key={b.key} className="bag-row">
                <span>{b.qty}× {batchLabel(b.key)} <em>· {batchQuality(b)}</em></span>
                <button type="button" className="link" onClick={() => void useEcos.getState().call('ecos.drop', { request: rid(), key: b.key, qty: 1 }).catch(() => null)}>largar 1</button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function Recipes() {
  const view = useEcos((s) => s.view)!;
  const bag = bagBatches(view);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="ecos-recipes">
      {msg && <p className="ecos-ok" role="status">{msg}</p>}
      {RECIPES.map((r) => {
        const picks = autoPick(r, bag);
        const owned = r.output.kind === 'tool' && view.profile.tools.includes(r.output.key as ToolKey);
        return (
          <article key={r.id} className="ecos-recipe">
            <h4>{r.name}{owned ? ' ✓' : ''}</h4>
            <p className="hint">{r.description}</p>
            <ul>
              {r.slots.map((s, i) => {
                const fit = bag.filter((b) => slotFit(s, b) !== 'nao-serve');
                const ideal = fit.filter((b) => slotFit(s, b) === 'ideal').reduce((a, b) => a + b.qty, 0), any = fit.reduce((a, b) => a + b.qty, 0);
                return (
                  <li key={i}>
                    <b>{s.qty}× {s.label}</b>{s.prop ? ` (${PROP_LABEL[s.prop].toLowerCase()} ${s.min ? 'mín. ' + BAND_LABEL[s.min] : ''}${s.ideal ? ', ideal ' + BAND_LABEL[s.ideal] : ''})` : ''}
                    <span className={'fit ' + (any >= s.qty ? 'ok' : 'no')}> {any >= s.qty ? '✓' : '✗'} você tem {any}{s.ideal ? ` (${ideal} ideais)` : ''}</span>
                    <button type="button" className="link" onClick={() => useEcos.getState().setObjective({ label: s.label, qty: s.qty, match: { category: s.category, materials: s.materials, prop: s.prop, min: s.min }, source: 'receita' })}>buscar</button>
                  </li>
                );
              })}
            </ul>
            <button type="button" className="primary" disabled={!picks || owned} onClick={async () => {
              try { const res = await useEcos.getState().call('ecos.craft', { request: rid(), recipe: r.id, picks }); if (res?.crafted) { setMsg(`${res.crafted.label} pronto! Qualidade ${res.crafted.quality}.`); useGame.getState().toast(`${res.crafted.label} (${res.crafted.quality})`, 'gold'); void useGame.getState().run((b) => b.state()); } } catch (e) { setMsg(e instanceof Error ? e.message : 'Não deu.'); }
            }}>{owned ? 'Você já tem' : picks ? 'Fabricar' : 'Faltam materiais'}</button>
          </article>
        );
      })}
    </div>
  );
}

const PRESETS: { label: string; intent: GatheringIntent }[] = [
  { label: 'Madeira flexível para o arco (3)', intent: { mode: 'selecionar', target: { category: 'madeira', prop: 'flexibilidade', min: 'media', qty: 3, label: 'Madeira flexível para o arco' }, risk: 0, reserve: 5, tools: [], prefer: 'bosque', gentle: true } },
  { label: 'Pedra resistente (10)', intent: { mode: 'abastecer', target: { category: 'pedra', prop: 'resistencia', min: 'media', qty: 10, label: 'Pedra resistente' }, risk: 1, reserve: 5, tools: [], prefer: 'afloramento', gentle: false } },
  { label: 'Cobre puro para o cinzel (2)', intent: { mode: 'selecionar', target: { category: 'minerio', material: 'minerio-cobre', prop: 'pureza', min: 'media', qty: 2, label: 'Cobre puro' }, risk: 1, reserve: 5, tools: [], prefer: 'afloramento', gentle: false } },
  { label: 'Ervas estáveis (6)', intent: { mode: 'abastecer', target: { category: 'planta', prop: 'estabilidade', min: 'media', qty: 6, label: 'Ervas estáveis' }, risk: 0, reserve: 5, tools: [], prefer: 'riacho', gentle: true } },
  { label: 'Explorar e conhecer materiais', intent: { mode: 'explorar', target: null, risk: 1, reserve: 5, tools: [], prefer: null, gentle: true } },
];

function Ask() {
  const view = useEcos((s) => s.view)!, auto = useEcos((s) => s.auto);
  const [i, setI] = useState<GatheringIntent>(PRESETS[0].intent);
  const [p, setP] = useState(0);
  const sugg = suggestionsNow(view, i).slice(0, 3);
  const set = (patch: Partial<GatheringIntent>) => setI({ ...i, ...patch });
  return (
    <div className="ecos-ask">
      <p className="hint">Diga o objetivo e os limites; ela escolhe onde e como coletar, explica o motivo e você pode parar ou assumir quando quiser. Ela só usa o que já viu.</p>
      <fieldset className="set-row"><legend>Objetivo</legend>
        <div className="chips">{PRESETS.map((x, k) => <button key={k} type="button" className={'chip' + (p === k ? ' on' : '')} aria-pressed={p === k} onClick={() => { setP(k); setI(x.intent); }}>{x.label}</button>)}</div>
      </fieldset>
      <fieldset className="set-row"><legend>Jeito</legend>
        <div className="chips">{(['abastecer', 'selecionar', 'explorar'] as IntentMode[]).map((m) => <button key={m} type="button" className={'chip' + (i.mode === m ? ' on' : '')} aria-pressed={i.mode === m} onClick={() => set({ mode: m })}>{m === 'abastecer' ? 'Abastecer (quantidade)' : m === 'selecionar' ? 'Selecionar (propriedades)' : 'Explorar (descobertas)'}</button>)}</div>
      </fieldset>
      <fieldset className="set-row"><legend>Risco aceitável</legend>
        <div className="chips">{([[0, 'Nenhum'], [1, 'Leve'], [2, 'Qualquer']] as [0 | 1 | 2, string][]).map(([v, l]) => <button key={v} type="button" className={'chip' + (i.risk === v ? ' on' : '')} aria-pressed={i.risk === v} onClick={() => set({ risk: v })}>{l}</button>)}</div>
      </fieldset>
      <fieldset className="set-row"><legend>Espaço livre reservado na mochila</legend>
        <input type="range" min={0} max={30} value={i.reserve} onChange={(e) => set({ reserve: Number(e.target.value) })} aria-label="Espaço reservado" /> <b>{i.reserve}</b>
      </fieldset>
      <fieldset className="set-row"><legend>Ferramentas que ela pode usar</legend>
        <div className="chips">{view.profile.tools.map((t) => { const on = !i.tools.length || i.tools.includes(t); return <button key={t} type="button" className={'chip' + (on ? ' on' : '')} aria-pressed={on} onClick={() => { const all = i.tools.length ? i.tools : view.profile.tools; set({ tools: on ? all.filter((x) => x !== t) : [...all, t] }); }}>{TOOLS[t].icon} {TOOLS[t].label}</button>; })}</div>
      </fieldset>
      <fieldset className="set-row"><legend>Ambiente preferido</legend>
        <div className="chips">{([[null, 'Tanto faz'], ['bosque', 'Árvores'], ['riacho', 'Ervas e seixos'], ['afloramento', 'Pedras e minérios']] as [Zone | null, string][]).map(([z, l]) => <button key={l} type="button" className={'chip' + (i.prefer === z ? ' on' : '')} aria-pressed={i.prefer === z} onClick={() => set({ prefer: z })}>{l}</button>)}</div>
        <label className="row"><input type="checkbox" checked={i.gentle} onChange={(e) => set({ gentle: e.target.checked })} /> Evitar o que esgota o lugar (cortar árvores, arrancar raízes)</label>
      </fieldset>
      <h4>O que ela faria agora</h4>
      {sugg.length ? <ol className="ecos-sugglist">{sugg.map((s) => <li key={s.node.id + s.approach.id} className={s.blocked ? 'blocked' : ''}>{s.blocked ? `${s.approach.label} no ${s.node.name ?? s.node.kind}: ${s.blocked}` : s.reason}</li>)}</ol> : <p className="hint">Ela ainda não vê nada útil por perto — vai andar um pouco procurando.</p>}
      <div className="row">
        {auto.on ? <button type="button" className="primary" onClick={() => useEcos.getState().stopIntent('você pediu')}>Parar</button>
          : <button type="button" className="primary" onClick={() => useEcos.getState().startIntent(i)}>Pode ir!</button>}
      </div>
    </div>
  );
}

