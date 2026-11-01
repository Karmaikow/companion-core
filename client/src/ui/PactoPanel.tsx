/**
 * Oficina do Pacto das Cinco: bancada (ofício da classe ou Forja Primordial da Taurina), encomendas, peças e o Pacto.
 * Desktop: projeto/cliente/intenção no topo; materiais e procedência à esquerda; peça com Corpo/Trama/Marca no centro;
 * previsão e requisitos à direita; etapas e ação embaixo. Celular: peça em cima, bandeja embaixo, abas.
 * A previsão é determinística (as mesmas regras do servidor): o que aparece é o que sai.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  OFFICES, CLASS_LABEL, SPECIES, COMPONENTS, BLUEPRINTS, TRANSFORMATIONS, ESSENCE_CRAFT, ELEMENTS, COMPANION_ELEMENTS, RARITIES, INTENT_LABEL, CONDUCT_LABEL, TEMPER_LABEL,
  SOURCE_LABEL, SOURCE_CLASS, AFFINITY_COLOR, canCompleteEquipment, transformationFor, checkTransformation, essenceApplies, inputFits, forgePreview, assistPlan,
  coreCost, meetsRequirements, recycleReturn, parseComponentKey, componentPropLabel, bandWord, blueprintById, cancelSettlement, payout, CERNE_ALTERNATIVE, REPAIR_KIT_AMOUNT,
  type SpeciesKey, type ForgePlan, type Pick, type Conduct, type Temper, type ForgeBlueprint, type OrderRequirements, type SourceKind,
} from '@rules';
import { useEcos, batchLabel } from '../ecos/ecosStore';
import { usePacto, uuid } from '../pacto/pactoStore';
import type { OrderView, PactoView } from '../pacto/types';

const KIT = 'item:kit-de-reparo';
const PROD_HOST = 'companion-core-two.vercel.app';
const ICON: Record<string, string> = { arco: '🏹', escudo: '🛡', faca: '🔪', machado: '🪓', picareta: '⛏', cinzel: '🪛', consumivel: '🧰' };
const pieceIcon = (bp: ForgeBlueprint | null) => (bp ? ICON[bp.itemType ?? bp.tool ?? bp.kind] ?? '✦' : '✦');
const ATTR: Record<string, string> = { vida: 'Vida', energia: 'Energia', poder: 'Poder', defesa: 'Defesa', agilidade: 'Agilidade', sintonia: 'Sintonia' };
const WEIGHT: Record<string, string> = { leve: 'leve', medio: 'médio', pesado: 'pesado' };

/** Nome legível de um lote da mochila (material, componente ou item). */
export function keyLabel(key: string, v?: PactoView | null) {
  if (key === KIT) return '🧰 Kit de Reparo';
  const c = parseComponentKey(key);
  if (c) {
    const def = COMPONENTS[c.component];
    const props = Object.entries(c.bands).map(([k, b]) => `${componentPropLabel(k)} ${bandWord(b)}`).join(', ');
    const who = v ? (c.maker.startsWith(v.me.replace(/-/g, '').slice(0, 8)) ? 'você' : Object.entries(v.names).find(([id]) => id.replace(/-/g, '').startsWith(c.maker))?.[1].name ?? 'outra pessoa') : '';
    return `${OFFICES[Object.values(OFFICES).find((o) => o.key === def.office)!.cls].icon} ${def.name}${props ? ` (${props})` : ''}${who ? ` · feito por ${who}` : ''}`;
  }
  return batchLabel(key);
}

export function PactoPanel() {
  const view = usePacto((s) => s.view);
  const error = usePacto((s) => s.error), notice = usePacto((s) => s.notice), conn = usePacto((s) => s.conn);
  const ecos = useEcos((s) => s.view);
  const [tab, setTab] = useState<'bancada' | 'encomendas' | 'pecas' | 'pacto'>('bancada');
  useEffect(() => { void usePacto.getState().refresh(); if (!useEcos.getState().view) void useEcos.getState().refresh(); }, []);
  if (!view) return <p className="empty">{conn === 'perdida' ? 'Sem conexão com a oficina. Tentando de novo…' : 'Abrindo a oficina…'}</p>;
  const cls = view.cls.effective;
  const forms = formsOfView(view);
  const office = cls ? OFFICES[cls] : null;
  // a forja saiu daqui: fica só na Escola da Forja, em Áster
  const onlyForge = canCompleteEquipment(forms) && !forms.some((f) => f !== 'touro');
  const showTest = view.cls.admin && (typeof location === 'undefined' || location.hostname !== PROD_HOST);
  const mineActive = view.orders.mine.filter((o) => o.artisan === view.me && (o.status === 'aceita' || o.status === 'em_forja')).length;

  return (
    <div className="pacto">
      <div className="pacto-top">
        <div className="pacto-who">
          <span className="pacto-office" aria-hidden>{office?.icon ?? '·'}</span>
          <div>
            <strong>{forms.length ? forms.map((f) => `${CLASS_LABEL[f]} · ${OFFICES[f].name}`).join('  +  ') : 'Sem classe'}</strong>
            <small>{forms.length > 1 ? null : office?.focus}</small>
            {(view.cls.essences ?? []).length > 0 && <small className="pacto-ess">{(view.cls.essences ?? []).map((e) => <b key={e} style={{ color: AFFINITY_COLOR[e] }}>{ELEMENTS[e].label}</b>)}</small>}
          </div>
        </div>
        <div className="pacto-lumes" title="Lumes: a moeda do Pacto. Entram por descobertas, obras e encomendas; saem nos núcleos da oficina e na taxa do quadro.">✧ <b>{view.lumes}</b> Lumes</div>
        {view.simulated && <span className="pacto-sim" title="Offline: tudo simulado neste aparelho, sem valor online">simulado</span>}
        {showTest && <TestClass view={view} />}
      </div>
      {view.cls.test && <p className="pacto-warn">Modo de teste: agindo como <b>{CLASS_LABEL[view.cls.test]}</b> (só permissões do Pacto; identidade e modelo continuam {view.cls.real ? CLASS_LABEL[view.cls.real] : '—'}).</p>}
      {error && <p className="pacto-error" role="alert" onClick={() => usePacto.getState().clear()}>{error}</p>}
      {notice && <p className="pacto-notice" role="status" onClick={() => usePacto.getState().clear()}>{notice}</p>}

      <nav className="st-tabs pacto-tabs" aria-label="Oficina">
        <button className={tab === 'bancada' ? 'on' : ''} onClick={() => setTab('bancada')}>Ofício</button>
        <button className={tab === 'encomendas' ? 'on' : ''} onClick={() => setTab('encomendas')}>Encomendas{mineActive ? <em>{mineActive}</em> : null}</button>
        <button className={tab === 'pecas' ? 'on' : ''} onClick={() => setTab('pecas')}>Peças{view.equipment.length ? <em>{view.equipment.length}</em> : null}</button>
        <button className={tab === 'pacto' ? 'on' : ''} onClick={() => setTab('pacto')}>As Cinco</button>
      </nav>

      <Jobs view={view} />

      {tab === 'bancada' && (onlyForge ? <TaurinaOffice /> : <OfficeBench view={view} bag={ecos?.bag ?? []} />)}
      {tab === 'encomendas' && <Orders view={view} bag={ecos?.bag ?? []} />}
      {tab === 'pecas' && <Pieces view={view} bag={ecos?.bag ?? []} />}
      {tab === 'pacto' && <TheFive view={view} />}
    </div>
  );
}

/** Formas que valem agora (teste de admin substitui; linhagem soma). */
const formsOfView = (v: PactoView): SpeciesKey[] => (v.cls.forms?.length ? v.cls.forms : v.cls.effective ? [v.cls.effective] : []);

function TestClass({ view }: { view: PactoView }) {
  const call = usePacto.getState().call;
  const lin = view.cls.lineage;
  const extraForms = (lin?.forms ?? []).slice(1), extraEss = (lin?.essences ?? []).slice(1);
  return (
    <div className="pacto-test" title="Só administradores, fora da produção">
      <label>🧪 testar como
        <select value={view.cls.test ?? ''} onChange={(e) => void call('pacto.testClass', { cls: e.target.value || null })}>
          <option value="">(classe real)</option>
          {(Object.keys(SPECIES) as SpeciesKey[]).map((k) => <option key={k} value={k}>{CLASS_LABEL[k]}</option>)}
        </select>
      </label>
      <label>+ forma
        <select value="" onChange={(e) => e.target.value && void call('pacto.lineage.set', { kind: 'form', value: e.target.value, on: true })}>
          <option value="">{extraForms.length ? extraForms.map((f) => CLASS_LABEL[f]).join(', ') : '—'}</option>
          {(Object.keys(SPECIES) as SpeciesKey[]).filter((k) => !lin?.forms.includes(k)).map((k) => <option key={k} value={k}>{CLASS_LABEL[k]}</option>)}
        </select>
      </label>
      <label>+ essência
        <select value="" onChange={(e) => e.target.value && void call('pacto.lineage.set', { kind: 'essence', value: e.target.value, on: true })}>
          <option value="">{extraEss.length ? extraEss.map((x) => ELEMENTS[x].label).join(', ') : '—'}</option>
          {COMPANION_ELEMENTS.filter((k) => !lin?.essences.includes(k)).map((k) => <option key={k} value={k}>{ELEMENTS[k].label}</option>)}
        </select>
      </label>
      {(extraForms.length > 0 || extraEss.length > 0) && <button className="ghost" onClick={() => { for (const f of extraForms) void call('pacto.lineage.set', { kind: 'form', value: f, on: false }); for (const x of extraEss) void call('pacto.lineage.set', { kind: 'essence', value: x, on: false }); }}>limpar</button>}
    </div>
  );
}

export function Jobs({ view }: { view: PactoView }) {
  const [, force] = useState(0);
  useEffect(() => { if (!view.jobs.length) return; const t = setInterval(() => force((x) => x + 1), 500); return () => clearInterval(t); }, [view.jobs.length]);
  if (!view.jobs.length) return null;
  return (
    <ul className="pacto-jobs" aria-label="Trabalhos em andamento">
      {view.jobs.map((j) => {
        const p = Math.min(1, (Date.now() - j.startedAt) / (j.seconds * 1000));
        const name = j.kind === 'forja' ? blueprintById(j.ref)?.name : TRANSFORMATIONS.find((t) => t.id === j.ref)?.name;
        return (
          <li key={j.request}>
            <span>{j.kind === 'forja' ? '🔨' : '✶'} {name}{j.order ? ' · encomenda' : ''}</span>
            <div className="bar"><i style={{ width: `${p * 100}%` }} /></div>
            <small>{p >= 1 ? 'concluindo…' : `${Math.ceil(j.seconds - p * j.seconds)}s`}</small>
            {p < 1 && <button className="ghost" onClick={() => void usePacto.getState().call('pacto.job.cancel', { request: j.request })} title="Cancelar: os materiais e os Lumes voltam">cancelar</button>}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Ofício (Dracônica, Alada, Feral, Feérica)
// ---------------------------------------------------------------------------

function OfficeBench({ view, bag }: { view: PactoView; bag: { key: string; qty: number }[] }) {
  const forms = formsOfView(view);
  const list = forms.filter((f) => f !== 'touro').flatMap((f) => transformationFor(OFFICES[f].key));
  const cls = forms[0] ?? null;
  const [tid, setTid] = useState(list[0]?.id ?? '');
  const essences = view.cls.essences?.length ? view.cls.essences : view.cls.essence ? [view.cls.essence] : [];
  const [essSel, setEssSel] = useState<string | null>(null);
  const t = list.find((x) => x.id === tid) ?? list[0];
  const [picks, setPicks] = useState<Pick[]>([]);
  const [choice, setChoice] = useState('');
  const [useEss, setUseEss] = useState(false);
  useEffect(() => { setPicks([]); setChoice(t?.choices[0]?.id ?? ''); setUseEss(false); }, [t?.id]);
  if (!cls) return <p className="empty">Sem classe definida.</p>;
  if (!t) return <p className="empty">Nenhuma transformação para esta classe ainda.</p>;
  const usable = essences.filter((e) => essenceApplies(t, e));
  const ess = (usable.find((e) => e === essSel) ?? usable[0] ?? null) as typeof essences[number] | null;
  const chk = checkTransformation(t, picks, bag, choice, ess, useEss, view.me);
  const fitsSlot = (i: number, key: string) => {
    if (inputFits(t.inputs[i], key)) return true;
    if (t.id === 'preservar-cerne') { const p = parseComponentKey(key) ? null : key.split('|')[0]; return !!p && CERNE_ALTERNATIVE.materials.includes(p) && key.includes(`${CERNE_ALTERNATIVE.prop}:${CERNE_ALTERNATIVE.min}`); }
    return false;
  };
  const used = (key: string) => picks.filter((p) => p.key === key).reduce((a, p) => a + p.qty, 0);
  const add = (slot: number, key: string) => setPicks((ps) => { const ex = ps.find((p) => p.slot === slot && p.key === key); return ex ? ps.map((p) => (p === ex ? { ...p, qty: p.qty + 1 } : p)) : [...ps, { slot, key, qty: 1 }]; });
  const remove = (slot: number, key: string) => setPicks((ps) => ps.flatMap((p) => (p.slot === slot && p.key === key ? (p.qty > 1 ? [{ ...p, qty: p.qty - 1 }] : []) : [p])));
  const busy = usePacto.getState().busy;
  return (
    <div className="office">
      {list.length > 1 && <div className="chips">{list.map((x) => <button key={x.id} className={'chip' + (x.id === t.id ? ' on' : '')} onClick={() => setTid(x.id)}>{Object.values(OFFICES).find((o) => o.key === x.office)?.icon} {x.name}</button>)}</div>}
      <h3>{t.name}</h3>
      <p className="hint">Produz: <b>{COMPONENTS[t.output].name}</b> — {COMPONENTS[t.output].description} Usado em: {COMPONENTS[t.output].uses.join('; ')}.</p>
      {t.inputs.map((inp, i) => {
        const got = picks.filter((p) => p.slot === i).reduce((a, p) => a + p.qty, 0);
        const cands = bag.filter((b) => fitsSlot(i, b.key));
        return (
          <section key={i} className="office-slot">
            <header><b>{inp.label}</b> <small>{got}/{t.id === 'preservar-cerne' && picks.some((p) => p.slot === 0 && !p.key.startsWith('cerne-salgueiro')) ? CERNE_ALTERNATIVE.qty : inp.qty}</small></header>
            {!cands.length && <small className="d why">Nada na mochila serve aqui ainda.</small>}
            <ul className="pick-list">
              {cands.map((b) => {
                const n = picks.find((p) => p.slot === i && p.key === b.key)?.qty ?? 0;
                return (
                  <li key={b.key}>
                    <span>{keyLabel(b.key, view)}</span><small>×{b.qty - used(b.key)}</small>
                    <button className="ghost" disabled={!n} onClick={() => remove(i, b.key)} aria-label="Tirar um">−</button>
                    <b>{n}</b>
                    <button className="ghost" disabled={b.qty - used(b.key) <= 0} onClick={() => add(i, b.key)} aria-label="Pôr um">+</button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <fieldset className="office-choice">
        <legend>Decisão do ofício (sempre uma troca)</legend>
        {t.choices.map((c) => (
          <label key={c.id} className={choice === c.id ? 'on' : ''}>
            <input type="radio" name="choice" checked={choice === c.id} onChange={() => setChoice(c.id)} />
            <span><b>{c.label}</b> — {c.detail} <small>({Object.entries(c.sets).map(([k, b]) => `${componentPropLabel(k)} ${bandWord(b)}`).join(', ')})</small></span>
          </label>
        ))}
      </fieldset>
      {usable.length > 1 && <div className="chips">{usable.map((e) => <button key={e} className={'chip' + (e === ess ? ' on' : '')} style={{ borderColor: AFFINITY_COLOR[e] }} onClick={() => setEssSel(e)}>{ELEMENTS[e].label}</button>)}</div>}
      {ess && (
        <label className="office-ess" style={{ borderColor: AFFINITY_COLOR[ess] }}>
          <input type="checkbox" checked={useEss} onChange={(e) => setUseEss(e.target.checked)} />
          Aplicar a essência <b style={{ color: AFFINITY_COLOR[ess] }}>{ELEMENTS[ess].label}</b>: {ESSENCE_CRAFT[ess].label} ({ESSENCE_CRAFT[ess].hint}) — sobe {componentPropLabel(ESSENCE_CRAFT[ess].lifts)} uma faixa.
        </label>
      )}
      <div className="office-out">
        {chk.ok ? <span>Vai sair: <b>{keyLabel(chk.output.key)}</b></span> : <span className="why">{chk.reason}</span>}
        <button className="primary" disabled={!chk.ok || !!busy} onClick={async () => { const r = await usePacto.getState().call('pacto.office.start', { request: uuid(), transformation: t.id, picks, choice, useEssence: useEss, essence: ess }); if (r?.started) setPicks([]); }}>Preparar ({t.seconds}s)</button>
      </div>
    </div>
  );
}

function TaurinaOffice() {
  return <p className="hint">Taurina: você coleta o básico e conclui todas as peças, mas a forja fica na <b>🔨 Escola da Forja, em Áster</b> (matricule-se lá). Fontes superiores você localiza e anuncia (aba Encomendas → quadro); os componentes vêm dos ofícios das outras classes.</p>;
}

// ---------------------------------------------------------------------------
// Forja Primordial (Taurina)
// ---------------------------------------------------------------------------

const STEPS = ['Leitura', 'Montagem', 'Condução', 'Têmpera', 'Assinatura'] as const;

/** Bancada da Forja Primordial: só na Escola da Forja (SchoolPanel). */
export function ForgeBench({ view, bag, orderId, setOrder }: { view: PactoView; bag: { key: string; qty: number }[]; orderId: string | null; setOrder: (id: string | null) => void }) {
  const order = view.orders.mine.find((o) => o.id === orderId && o.artisan === view.me && o.status === 'aceita') ?? null;
  const [bpId, setBp] = useState(order?.blueprint ?? BLUEPRINTS[0].id);
  const bp = blueprintById(order?.blueprint ?? bpId)!;
  const [picks, setPicks] = useState<Pick[]>([]);
  const [conduct, setConduct] = useState<Conduct>('resistencia');
  const [temper, setTemper] = useState<Temper>('estavel');
  const [name, setName] = useState('');
  const [slot, setSlot] = useState(0);
  const [step, setStep] = useState(0);
  const [mview, setMview] = useState<'materiais' | 'peca' | 'previsao'>('peca');
  useEffect(() => { setPicks([]); setSlot(0); setStep(0); setName(''); }, [bp.id, orderId]);
  // com encomenda: o depósito do cliente entra na bancada (e a mochila só se a encomenda aceitar substituições)
  const pool = useMemo(() => {
    const m = new Map<string, { qty: number; from: 'mochila' | 'deposito' }>();
    if (order) for (const d of order.deposit) if (d.qty > 0) m.set(d.key, { qty: d.qty, from: 'deposito' });
    if (!order || order.substitutions) for (const b of bag) { const e = m.get(b.key); m.set(b.key, { qty: (e?.qty ?? 0) + b.qty, from: e ? e.from : 'mochila' }); }
    return [...m].map(([key, v]) => ({ key, ...v }));
  }, [order, bag]);
  const plan: ForgePlan = { blueprint: bp.id, picks, conduct, temper, name: name.trim() || undefined };
  const pv = forgePreview(plan, pool, { barrier: view.config.barrier });
  const essAll = view.cls.essences?.length ? view.cls.essences : view.cls.essence ? [view.cls.essence] : [];
  const fee = coreCost(essAll, view.config);
  const fails = order && pv.ok ? meetsRequirements(order.requirements, pv) : [];
  const used = (key: string) => picks.filter((p) => p.key === key).reduce((a, p) => a + p.qty, 0);
  const cands = pool.filter((b) => inputFits({ label: '', qty: 0, accepts: bp.slots[slot]?.accepts ?? [] }, b.key));
  const add = (key: string) => setPicks((ps) => { const ex = ps.find((p) => p.slot === slot && p.key === key); return ex ? ps.map((p) => (p === ex ? { ...p, qty: p.qty + 1 } : p)) : [...ps, { slot, key, qty: 1 }]; });
  const remove = (s: number, key: string) => setPicks((ps) => ps.flatMap((p) => (p.slot === s && p.key === key ? (p.qty > 1 ? [{ ...p, qty: p.qty - 1 }] : []) : [p])));
  const assisted = () => { const a = assistPlan(bp.id, pool, conduct); if (a) { setPicks(a.picks); setStep(2); } else usePacto.setState({ error: 'Não dá para montar sozinho: faltam materiais. Veja o que cada camada pede.' }); };
  const busy = usePacto((s) => s.busy);
  const layerSlots = (layer: string) => bp.slots.map((s, i) => ({ s, i })).filter((x) => x.s.layer === layer || (layer === 'marca' && x.s.layer === 'tempera'));

  return (
    <div className={'bench m-' + mview}>
      <div className="bench-top">
        {order ? (
          <p><b>Encomenda</b> de {view.names[order.client]?.name ?? 'alguém'}: {bp.name} · {order.payment} Lumes {order.substitutions ? '· aceita substituições' : '· só com o depósito'} <button className="ghost" onClick={() => setOrder(null)}>sair da encomenda</button></p>
        ) : (
          <div className="chips">{BLUEPRINTS.map((b) => <button key={b.id} className={'chip' + (b.id === bp.id ? ' on' : '')} onClick={() => setBp(b.id)}>{pieceIcon(b)} {b.name}{b.tier === 'avancado' ? ' ★' : ''}</button>)}</div>
        )}
        <small className="hint">Intenção: {bp.intents.map((i) => INTENT_LABEL[i]).join(' · ')} — {bp.description}{bp.offices.length > 1 ? ` · coopera: ${bp.offices.map((o) => Object.values(OFFICES).find((x) => x.key === o)!.name).join(', ')}` : ''}</small>
      </div>

      <nav className="bench-mtabs st-tabs" aria-label="Bancada no celular">
        <button className={mview === 'materiais' ? 'on' : ''} onClick={() => setMview('materiais')}>Materiais</button>
        <button className={mview === 'peca' ? 'on' : ''} onClick={() => setMview('peca')}>Peça</button>
        <button className={mview === 'previsao' ? 'on' : ''} onClick={() => setMview('previsao')}>Previsão</button>
      </nav>

      <aside className="bench-left" aria-label="Materiais e procedência">
        <h4>Para: {bp.slots[slot]?.label}</h4>
        {!cands.length && <p className="d why">Nada {order && !order.substitutions ? 'no depósito' : 'na mochila'} serve para esta parte.</p>}
        <ul className="pick-list">
          {cands.map((b) => (
            <li key={b.key}>
              <span>{keyLabel(b.key, view)}<small className="from">{b.from === 'deposito' ? ' · do cliente' : ''}</small></span>
              <small>×{b.qty - used(b.key)}</small>
              <button className="ghost" disabled={b.qty - used(b.key) <= 0} onClick={() => add(b.key)}>+ usar</button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="bench-center" aria-label="Peça">
        <div className="piece" style={{ borderColor: pv.ok && pv.affinity ? AFFINITY_COLOR[pv.affinity] : undefined }}><span aria-hidden>{pieceIcon(bp)}</span><b>{name.trim() || bp.name}</b></div>
        {(['corpo', 'trama', 'marca'] as const).map((layer) => {
          const ss = layerSlots(layer);
          return (
            <div key={layer} className={'layer layer-' + layer + (ss.length ? '' : ' empty')}>
              <h4>{layer === 'corpo' ? 'Corpo' : layer === 'trama' ? 'Trama' : 'Marca'}</h4>
              {!ss.length && <small>— esta peça não usa {layer}</small>}
              {ss.map(({ s, i }) => {
                const got = picks.filter((p) => p.slot === i);
                const n = got.reduce((a, p) => a + p.qty, 0);
                return (
                  <button key={i} className={'slot' + (slot === i ? ' on' : '') + (n === s.qty ? ' full' : '')} onClick={() => { setSlot(i); setMview('materiais'); if (step < 1) setStep(1); }}>
                    <span>{s.layer === 'tempera' ? 'Têmpera: ' : ''}{s.label}{s.optional ? ' (opcional)' : ''}</span>
                    <small>{n}/{s.qty}</small>
                    {got.map((p) => <em key={p.key} onClick={(e) => { e.stopPropagation(); remove(i, p.key); }} title="Tirar um">{p.qty}× {keyLabel(p.key, view)} ✕</em>)}
                  </button>
                );
              })}
            </div>
          );
        })}
      </section>

      <aside className="bench-right" aria-label="Previsão e requisitos">
        <h4>Previsão</h4>
        {pv.ok ? (
          <dl className="pv">
            <dt>Atributos</dt><dd>{Object.entries(pv.stats).map(([k, v]) => `${ATTR[k]} ${v! > 0 ? '+' : ''}${v}%`).join(' · ') || '—'}</dd>
            <dt>Peso</dt><dd>{WEIGHT[pv.weight]}</dd>
            <dt>Durabilidade</dt><dd>{pv.durability || '—'}</dd>
            <dt>Raridade</dt><dd style={{ color: RARITIES[pv.rarity].color }}>{RARITIES[pv.rarity].label}</dd>
            {pv.affinity && <><dt>Afinidade</dt><dd style={{ color: AFFINITY_COLOR[pv.affinity] }}>{ELEMENTS[pv.affinity].label}</dd></>}
            {pv.mark && <><dt>Marca</dt><dd><b>{pv.mark.label}</b>{pv.mark.id === 'barreira-breve' && <> · absorve {pv.mark.absorb} · {pv.mark.duration}s · recarga {pv.mark.cooldown}s · {pv.mark.spCost} SP<br /><small>{pv.mark.trigger}</small></>}</dd></>}
            {pv.contributors.length > 0 && <><dt>Ofícios</dt><dd>{pv.contributors.map((c) => COMPONENTS[c.component].name).join(', ')}</dd></>}
          </dl>
        ) : <p className="d why">{pv.reason}{pv.missing ? <><br />{pv.missing.join(' · ')}</> : null}</p>}
        <p className="d">Núcleos da oficina: {fee.total ? `${fee.total} Lumes (Fogo ${fee.fogo} + Terra ${fee.terra})` : 'grátis'}{essAll.includes('fogo') && essAll.includes('terra') ? ' — você traz o Fogo e a Terra' : essAll.includes('fogo') ? ' — você traz o seu Fogo' : essAll.includes('terra') ? ' — você traz a sua Terra' : ''}</p>
        {order && <div className={'reqs' + (fails.length ? ' bad' : ' good')}><b>Requisitos do cliente</b>{reqText(order.requirements)}{pv.ok && <small>{fails.length ? `Não cumpre: ${fails.join(', ')}` : 'Cumpre o contrato ✓'}</small>}</div>}
        <p className="d risk">Risco: a forja consome os materiais. Cancelar antes de terminar devolve tudo; depois de pronta, só reforja limitada (1 material do corpo) ou reciclagem com perda.</p>
      </aside>

      <footer className="bench-bottom">
        <ol className="forge-steps">{STEPS.map((s, i) => <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}><button onClick={() => setStep(i)}>{i + 1}. {s}</button></li>)}</ol>
        <div className="step-body">
          {step === 0 && <p>Leia o projeto: {bp.slots.map((s) => `${s.qty}× ${s.label}`).join(' · ')}. <button className="ghost" onClick={assisted}>Modo assistido: montar com o melhor da mochila</button> <button className="ghost" onClick={() => setStep(1)}>Montar à mão</button></p>}
          {step === 1 && <p>Escolha cada parte na peça e os lotes à esquerda (a procedência aparece no nome). <button className="ghost" onClick={assisted}>Completar sozinho</button> <button className="ghost" onClick={() => setStep(2)}>Seguir</button></p>}
          {step === 2 && <div className="radios">{(Object.keys(CONDUCT_LABEL) as Conduct[]).map((k) => <label key={k}><input type="radio" checked={conduct === k} onChange={() => setConduct(k)} /> {CONDUCT_LABEL[k]}</label>)} <button className="ghost" onClick={() => setStep(3)}>Seguir</button></div>}
          {step === 3 && <div className="radios">{(Object.keys(TEMPER_LABEL) as Temper[]).map((k) => <label key={k}><input type="radio" checked={temper === k} onChange={() => setTemper(k)} /> {TEMPER_LABEL[k]}</label>)} <button className="ghost" onClick={() => setStep(4)}>Seguir</button></div>}
          {step === 4 && <label>Nome da peça (opcional) <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={bp.name} /> <small>A assinatura grava você e quem fez cada componente.</small></label>}
        </div>
        <button className="primary forge-go" disabled={!pv.ok || !!busy || fails.length > 0 || view.lumes < fee.total}
          title={!pv.ok ? pv.reason : fails.length ? 'Não cumpre os requisitos da encomenda' : view.lumes < fee.total ? 'Lumes insuficientes para os núcleos' : 'Forjar'}
          onClick={async () => { const r = await usePacto.getState().call('pacto.forge.start', { request: uuid(), plan, order: order?.id ?? null }); if (r?.started) { setPicks([]); setStep(0); } }}>
          🔨 Forjar ({bp.seconds}s)
        </button>
      </footer>
    </div>
  );
}

function reqText(r: OrderRequirements) {
  const parts = [...Object.entries(r.minStats ?? {}).map(([k, v]) => `${ATTR[k]} ≥ ${v}%`), r.maxWeight ? `peso até ${WEIGHT[r.maxWeight]}` : '', r.mark ? `Marca: ${r.mark === 'barreira-breve' ? 'Barreira Breve' : 'Afinidade de Água'}` : ''].filter(Boolean);
  return <small>{parts.join(' · ') || 'sem exigências'}</small>;
}

// ---------------------------------------------------------------------------
// Encomendas e quadro
// ---------------------------------------------------------------------------

const STATUS: Record<OrderView['status'], string> = { aberta: 'aberta', aceita: 'aceita', em_forja: 'na forja', entregue: 'entregue', cancelada: 'cancelada', expirada: 'expirada' };

/** `onForge`: só dentro da Escola da Forja (fora dela, aceitar e forjar ficam para lá). */
export function Orders({ view, bag, onForge }: { view: PactoView; bag: { key: string; qty: number }[]; onForge?: (id: string) => void }) {
  const [creating, setCreating] = useState(false);
  const taurina = canCompleteEquipment(formsOfView(view));
  const call = usePacto.getState().call;
  const others = view.orders.open.filter((o) => o.client !== view.me);
  return (
    <div className="orders">
      {view.simulated && <p className="hint">Offline: encomendas e o quadro são entre pessoas — entre com a conta para usar.</p>}
      <div className="orders-head">
        <h3>Minhas encomendas</h3>
        {!view.simulated && <button className="primary" onClick={() => setCreating((x) => !x)}>{creating ? 'Fechar' : '+ Encomendar uma peça'}</button>}
      </div>
      {creating && <NewOrder view={view} bag={bag} onDone={() => setCreating(false)} />}
      {!view.orders.mine.length && <p className="empty">Nenhuma ainda. Quem não é Taurina consegue equipamento encomendando a uma Taurina (com materiais e Lumes reservados).</p>}
      <ul className="order-list">
        {view.orders.mine.map((o) => <OrderItem key={o.id} o={o} view={view} onForge={onForge} />)}
      </ul>
      {taurina && (<>
        <h3>Abertas no quadro</h3>
        {!onForge && <p className="hint">Aceitar e forjar encomendas: na 🔨 Escola da Forja, em Áster.</p>}
        {!others.length && <p className="empty">Nenhuma encomenda aberta agora.</p>}
        <ul className="order-list">
          {others.map((o) => (
            <li key={o.id} className="order">
              <OrderSummary o={o} view={view} />
              {onForge && <button className="primary" onClick={() => void call('pacto.order.accept', { id: o.id })}>Aceitar</button>}
            </li>
          ))}
        </ul>
      </>)}
      <Board view={view} />
    </div>
  );
}

function OrderSummary({ o, view }: { o: OrderView; view: PactoView }) {
  const bp = blueprintById(o.blueprint);
  return (
    <div>
      <strong>{pieceIcon(bp)} {bp?.name ?? o.blueprint}</strong> <small className={'st st-' + o.status}>{STATUS[o.status]}</small>
      <small className="d">Cliente: {o.client === view.me ? 'você' : view.names[o.client]?.name ?? '—'}{o.artisan ? ` · artesã(o): ${o.artisan === view.me ? 'você' : view.names[o.artisan]?.name ?? '—'}` : ''} · {o.payment} Lumes · prazo {new Date(o.deadline).toLocaleString()}</small>
      <small className="d">Depósito: {o.deposit.filter((d) => d.qty > 0).map((d) => `${d.qty}× ${keyLabel(d.key, view)}`).join(' · ') || '—'} {o.substitutions ? '· aceita substituições' : ''}</small>
      {reqText(o.requirements)}
    </div>
  );
}

function OrderItem({ o, view, onForge }: { o: OrderView; view: PactoView; onForge?: (id: string) => void }) {
  const [hist, setHist] = useState(false);
  const call = usePacto.getState().call;
  const iAmArtisan = o.artisan === view.me, iAmClient = o.client === view.me;
  const running = view.jobs.some((j) => j.order === o.id);
  const st = cancelSettlement(o.status, o.payment, view.config, false);
  return (
    <li className="order">
      <OrderSummary o={o} view={view} />
      <div className="order-actions">
        {iAmArtisan && o.status === 'aceita' && !o.item && (onForge ? <button className="primary" onClick={() => onForge(o.id)}>Forjar na bancada</button> : <small className="d">Forjar: na Escola da Forja</small>)}
        {iAmArtisan && (o.status === 'aceita' || o.status === 'em_forja') && o.item && !running && <button className="primary" onClick={() => void call('pacto.order.deliver', { id: o.id, item: o.item })}>Entregar (recebe {payout(o.payment, view.config).artisan})</button>}
        {(iAmClient || iAmArtisan) && st && <button className="ghost" onClick={() => { if (confirmCancel(o, iAmClient, view)) void call('pacto.order.cancel', { id: o.id }); }}>Cancelar</button>}
        <button className="ghost" onClick={() => setHist((x) => !x)}>Histórico</button>
      </div>
      {hist && <ol className="history">{o.history.map((h, i) => <li key={i}><small>{new Date(h.at).toLocaleString()}</small> {h.what}{h.by ? ` — ${h.by === view.me ? 'você' : view.names[h.by]?.name ?? ''}` : ''}</li>)}</ol>}
    </li>
  );
}
function confirmCancel(o: OrderView, client: boolean, view: PactoView) {
  const s = cancelSettlement(o.status, o.payment, view.config, !client);
  const msg = client
    ? (o.status === 'em_forja' ? `Já está na forja: volta o que não foi usado do depósito e ${s?.toClient} Lumes; ${s?.toArtisan} ficam com a artesã(o) como compensação (se ela sumiu, volta tudo).` : 'Tudo volta para você (depósito e Lumes).')
    : 'Você desiste: o depósito e os Lumes voltam ao cliente, sem compensação.';
  return typeof window === 'undefined' || window.confirm(msg + '\n\nCancelar a encomenda?');
}

function NewOrder({ view, bag, onDone }: { view: PactoView; bag: { key: string; qty: number }[]; onDone: () => void }) {
  const eq = BLUEPRINTS.filter((b) => b.kind !== 'consumivel');
  const [bpId, setBp] = useState(eq[0].id);
  const bp = blueprintById(bpId)!;
  const [dep, setDep] = useState<Record<string, number>>({});
  const [payment, setPayment] = useState(20);
  const [hours, setHours] = useState(48);
  const [subs, setSubs] = useState(false);
  const [minDef, setMinDef] = useState(0);
  const [mark, setMark] = useState<'' | 'barreira-breve'>('');
  const useful = bag.filter((b) => bp.slots.some((s) => inputFits({ label: '', qty: 0, accepts: s.accepts }, b.key)));
  const deposit = Object.entries(dep).filter(([, q]) => q > 0).map(([key, qty]) => ({ key, qty }));
  const ok = payment <= view.lumes;
  return (
    <div className="new-order">
      <div className="chips">{eq.map((b) => <button key={b.id} className={'chip' + (b.id === bpId ? ' on' : '')} onClick={() => { setBp(b.id); setDep({}); }}>{pieceIcon(b)} {b.name}</button>)}</div>
      <p className="hint">{bp.slots.map((s) => `${s.qty}× ${s.label}`).join(' · ')}</p>
      <h4>Depositar materiais (ficam reservados)</h4>
      {!useful.length && <p className="d why">Nada na mochila serve para esta peça — marque "aceita substituições" para a artesã usar o dela.</p>}
      <ul className="pick-list">
        {useful.map((b) => (
          <li key={b.key}><span>{keyLabel(b.key, view)}</span><small>×{b.qty}</small>
            <button className="ghost" disabled={!dep[b.key]} onClick={() => setDep({ ...dep, [b.key]: (dep[b.key] ?? 0) - 1 })}>−</button><b>{dep[b.key] ?? 0}</b>
            <button className="ghost" disabled={(dep[b.key] ?? 0) >= b.qty} onClick={() => setDep({ ...dep, [b.key]: (dep[b.key] ?? 0) + 1 })}>+</button></li>
        ))}
      </ul>
      <div className="form-row">
        <label>Pagamento <input type="number" min={0} max={view.lumes} value={payment} onChange={(e) => setPayment(Math.max(0, Math.round(Number(e.target.value) || 0)))} /> Lumes</label>
        <label>Prazo <input type="number" min={1} max={336} value={hours} onChange={(e) => setHours(Math.max(1, Number(e.target.value) || 1))} /> h</label>
        <label><input type="checkbox" checked={subs} onChange={(e) => setSubs(e.target.checked)} /> aceita substituições</label>
      </div>
      <div className="form-row">
        {bp.itemType === 'escudo' && <label>Defesa mínima <input type="number" min={0} max={30} value={minDef} onChange={(e) => setMinDef(Math.max(0, Number(e.target.value) || 0))} />%</label>}
        {bp.id === 'guardiao-da-nascente' && <label><input type="checkbox" checked={!!mark} onChange={(e) => setMark(e.target.checked ? 'barreira-breve' : '')} /> exigir a Barreira Breve</label>}
      </div>
      <p className="d">Taxa do quadro na entrega: {payout(payment, view.config).fee} Lumes (some da economia). Cancelar antes da forja devolve tudo.</p>
      <button className="primary" disabled={!ok} onClick={async () => {
        const r = await usePacto.getState().call('pacto.order.create', { id: uuid(), blueprint: bp.id, deposit, payment, deadlineHours: hours, substitutions: subs, requirements: { minStats: minDef ? { defesa: minDef } : {}, maxWeight: null, mark: mark || null } });
        if (r?.pacto) onDone();
      }}>{ok ? 'Abrir encomenda' : 'Lumes insuficientes'}</button>
    </div>
  );
}

function Board({ view }: { view: PactoView }) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'oportunidade' | 'servico'>(canCompleteEquipment(formsOfView(view)) ? 'oportunidade' : 'servico');
  return (
    <section className="board">
      <h3>Quadro do Pacto</h3>
      <p className="hint">Oportunidades (fontes superiores que alguém localizou) e serviços oferecidos. Taurinas localizam o que não podem extrair.</p>
      <ul>
        {view.board.map((b) => <li key={b.id}><small className={'st st-' + b.kind}>{b.kind === 'oportunidade' ? 'oportunidade' : 'serviço'}</small> {b.text} <small>— {view.names[b.companion_id]?.name ?? '—'}{view.names[b.companion_id]?.cls ? ` (${CLASS_LABEL[view.names[b.companion_id].cls!]})` : ''}</small></li>)}
        {!view.board.length && <li className="empty">Nada anunciado.</li>}
      </ul>
      {!view.simulated && (
        <div className="form-row">
          <select value={kind} onChange={(e) => setKind(e.target.value as never)}><option value="oportunidade">Oportunidade</option><option value="servico">Serviço</option></select>
          <input value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder={kind === 'oportunidade' ? 'Ex.: Remanso Profundo cheio, perto da nascente' : 'Ex.: Preparo agentes de têmpera'} />
          <button className="primary" disabled={!text.trim()} onClick={async () => { const r = await usePacto.getState().call('pacto.board.post', { kind, text }); if (r?.pacto) setText(''); }}>Anunciar</button>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Peças: durabilidade, reparo, reforja, reciclagem, assinatura
// ---------------------------------------------------------------------------

/** `atForge`: dentro da Escola da Forja (só lá a Taurina reforja). */
export function Pieces({ view, bag, atForge = false }: { view: PactoView; bag: { key: string; qty: number }[]; atForge?: boolean }) {
  const kits = bag.find((b) => b.key === KIT)?.qty ?? 0;
  const taurina = canCompleteEquipment(formsOfView(view));
  const call = usePacto.getState().call;
  const [open, setOpen] = useState<string | null>(null);
  if (!view.equipment.length) return <p className="empty">Nenhuma peça ainda. Peças só nascem na Forja Primordial — encomende a uma Taurina{taurina ? ' ou forje a sua' : ''}. Ferramentas destravam coletas (faca, machado, picareta, cinzel).</p>;
  return (
    <div className="pieces">
      <p className="hint">Kits de Reparo: <b>{kits}</b> (cada um devolve {REPAIR_KIT_AMOUNT} de durabilidade; Taurinas forjam, qualquer pessoa usa). Ferramentas gastam 1 por coleta.</p>
      <ul className="eq-list">
        {view.equipment.map((e) => {
          const bp = blueprintById(e.blueprint), ratio = e.durability / Math.max(1, e.maxDurability);
          const back = recycleReturn(e.consumed ?? []);
          return (
            <li key={e.id} className={'eq-item piece-item' + (e.durability <= 0 ? ' broken' : '')}>
              <span className="eq-icon" style={{ borderColor: e.affinity ? AFFINITY_COLOR[e.affinity] : RARITIES[e.rarity ?? 'comum'].color }} aria-hidden>{pieceIcon(bp)}</span>
              <div>
                <strong>{e.name ?? bp?.name}</strong> <small style={{ color: RARITIES[e.rarity ?? 'comum'].color }}>{RARITIES[e.rarity ?? 'comum'].label}{e.kind === 'ferramenta' ? ' · ferramenta' : ''}</small>
                <div className="bar dur"><i style={{ width: `${ratio * 100}%`, background: ratio < 0.25 ? '#e0664f' : undefined }} /></div>
                <small className="d">Durabilidade {e.durability}/{e.maxDurability}{e.durability <= 0 ? ' — quebrada: repare para usar' : ''}{e.stats && Object.keys(e.stats).length ? ' · ' + Object.entries(e.stats).map(([k, v]) => `${ATTR[k]} ${v! > 0 ? '+' : ''}${v}%`).join(' · ') : ''}{e.mark ? ` · ${e.mark.label}` : ''}</small>
                {open === e.id && (
                  <div className="piece-more">
                    {e.signature && <p><b>Assinatura:</b> {e.signature.artisanName}{e.signature.contributors.length ? ` · com ${e.signature.contributors.map((c) => `${COMPONENTS[c.component]?.name} (${c.name ?? 'artesão'})`).join(', ')}` : ''}</p>}
                    {e.layers && <p><b>Corpo:</b> {e.layers.corpo.join(', ') || '—'} · <b>Trama:</b> {e.layers.trama.join(', ') || '—'} · <b>Marca:</b> {[...e.layers.marca, ...e.layers.tempera].join(', ') || '—'}</p>}
                    <p><b>Reciclar devolve:</b> {back.map((b) => `${b.qty}× ${keyLabel(b.key, view)}`).join(', ') || 'nada (componentes se perdem)'} — sempre menos do que entrou.</p>
                    <ol className="history">{(e.history ?? []).map((h, i) => <li key={i}><small>{new Date(h.at).toLocaleString()}</small> {h.what}</li>)}</ol>
                    {taurina && e.plan && (atForge ? <Reforge id={e.id} plan={e.plan} /> : <p className="d">Reforja: na Escola da Forja.</p>)}
                  </div>
                )}
              </div>
              <div className="piece-actions">
                <button className="ghost" onClick={() => setOpen(open === e.id ? null : e.id)}>{open === e.id ? 'menos' : 'detalhes'}</button>
                <button className="primary" disabled={!kits || e.durability >= e.maxDurability} onClick={() => void call('pacto.item.repair', { item: e.id })}>Reparar</button>
                <button className="ghost" onClick={() => { if (typeof window === 'undefined' || window.confirm(`Reciclar ${e.name ?? bp?.name}? Volta ${back.map((b) => `${b.qty}× ${keyLabel(b.key)}`).join(', ') || 'nada'}. A peça some.`)) void call('pacto.item.recycle', { item: e.id }); }}>Reciclar</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Reforge({ id, plan }: { id: string; plan: ForgePlan }) {
  const [c, setC] = useState<Conduct>(plan.conduct);
  const [t, setT] = useState<Temper>(plan.temper);
  return (
    <div className="reforge">
      <b>Reforja (Taurina):</b>
      <select value={c} onChange={(e) => setC(e.target.value as Conduct)}>{(Object.keys(CONDUCT_LABEL) as Conduct[]).map((k) => <option key={k} value={k}>{CONDUCT_LABEL[k]}</option>)}</select>
      <select value={t} onChange={(e) => setT(e.target.value as Temper)}>{(Object.keys(TEMPER_LABEL) as Temper[]).map((k) => <option key={k} value={k}>{TEMPER_LABEL[k]}</option>)}</select>
      <button className="ghost" disabled={c === plan.conduct && t === plan.temper} onClick={() => void usePacto.getState().call('pacto.item.reforge', { item: id, conduct: c, temper: t })}>Reforjar (1 material do corpo)</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// As Cinco: ofícios, fontes superiores e essências
// ---------------------------------------------------------------------------

function TheFive({ view }: { view: PactoView }) {
  const bySource = (cls: SpeciesKey) => (Object.keys(SOURCE_CLASS) as SourceKind[]).filter((s) => SOURCE_CLASS[s] === cls).map((s) => SOURCE_LABEL[s]).join(', ');
  return (
    <div className="five">
      <p className="hint">Ninguém faz tudo sozinho: cada classe prepara componentes no seu ofício, e só a Taurina conclui a peça. Nenhum equipamento vem de drop, baú ou recompensa.</p>
      <ul>
        {(Object.keys(OFFICES) as SpeciesKey[]).map((k) => (
          <li key={k} className={formsOfView(view).includes(k) ? 'on' : ''}>
            <span aria-hidden>{OFFICES[k].icon}</span>
            <div><b>{CLASS_LABEL[k]} · {OFFICES[k].name}</b><small>{OFFICES[k].focus}</small><small>Coleta superior: {k === 'touro' ? OFFICES[k].superior : bySource(k)}</small></div>
          </li>
        ))}
      </ul>
      <h4>Essências na criação</h4>
      <p className="hint">A essência modifica a técnica (sobe uma propriedade uma faixa), sem transferir exclusividade. Fogo e Terra são os núcleos da forja: a oficina cobra cada núcleo, e a Taurina de Fogo ou de Terra traz a própria metade.</p>
      <ul className="ess">
        {COMPANION_ELEMENTS.map((e) => <li key={e} style={{ borderColor: AFFINITY_COLOR[e] }}><b style={{ color: AFFINITY_COLOR[e] }}>{ELEMENTS[e].label}</b> · {ESSENCE_CRAFT[e].label}: {ESSENCE_CRAFT[e].hint}</li>)}
      </ul>
    </div>
  );
}
