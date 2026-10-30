/**
 * Modo GOD: botão e painel de testes que só a conta de Administrador vê, dentro do jogo.
 * Poderes (invulnerável, SP infinito, sem recarga, dano alto), invocar monstros do Invocador, dar itens do Arsenal,
 * trocar o modelo 3D por um dos enviados na Fábrica e dar habilidades da Forja (valem na barra 1–9).
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { DEFAULT_CREATURES, ITEM_CATEGORIES, SPECIES, ELEMENTS, categoryOf, creatureStatsAt, type ItemCategory, type SpeciesKey, type Element } from '@rules';
import { supabase } from '../backend/online';
import { useGame } from '../store';
import { companionFocus } from '../scene/world';
import { brain } from '../scene/brain';
import { healCompanion, reviveCompanion, vitals } from '../scene/vitals';
import { useSkills } from './skillState';
import { useCompanionModels } from './companionModels';
import { useGod } from './godMode';

type Tab = 'poderes' | 'monstros' | 'itens' | 'modelo' | 'habilidades' | 'perfil';
const TABS: [Tab, string][] = [['poderes', 'Poderes'], ['monstros', 'Monstros'], ['itens', 'Itens'], ['modelo', 'Modelo 3D'], ['habilidades', 'Habilidades'], ['perfil', 'Classe e essência']];
const DEV_FORCE = typeof location !== 'undefined' && import.meta.env.DEV && new URLSearchParams(location.search).has('god');

/** Botão ⚡ (só aparece para o Administrador) e o painel. */
export function GodMode({ inWorld }: { inWorld: boolean }) {
  const admin = useGod((g) => g.admin), open = useGod((g) => g.open);
  const online = useGame((s) => s.backend?.kind === 'online');
  useEffect(() => {
    if (DEV_FORCE) { useGod.getState().setAdmin(true); return; }
    if (!online) { useGod.getState().setAdmin(false); return; }
    let alive = true;
    supabase().functions.invoke('refuge', { body: { action: 'whoami' } }).then(({ data }) => { if (alive) useGod.getState().setAdmin(!!(data as { admin?: boolean } | null)?.admin); }, () => {});
    return () => { alive = false; };
  }, [online]);
  if (!admin) return null;
  return (
    <>
      {open && createPortal(<GodPanel inWorld={inWorld} />, document.body)}
    </>
  );
}

/** Lives in the HUD menu flow, so it cannot cover another action button. */
export function GodButton() {
  const admin = useGod(g => g.admin), open = useGod(g => g.open), on = useGod(g => g.on);
  if (!admin) return null;
  return <button type="button" className={'god-btn' + (on ? ' on' : '')} data-tip="Modo GOD" onClick={() => useGod.getState().setOpen(!open)} aria-label="Modo GOD (Administrador)" aria-expanded={open}><b aria-hidden="true">⚡</b><span>GOD</span></button>;
}

function GodPanel({ inWorld }: { inWorld: boolean }) {
  const [tab, setTab] = useState<Tab>('poderes');
  return (
    <div className="god-backdrop" onClick={(e) => { if (e.target === e.currentTarget) useGod.getState().setOpen(false); }}>
      <section className="god-panel" role="dialog" aria-label="Modo GOD">
        <header>
          <b>⚡ Modo GOD <small>só Administrador</small></b>
          <button onClick={() => useGod.getState().setOpen(false)} aria-label="Fechar">×</button>
        </header>
        <nav className="god-tabs">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</nav>
        <div className="god-body">
          {tab === 'poderes' && <Powers />}
          {tab === 'monstros' && <Monsters inWorld={inWorld} />}
          {tab === 'itens' && <Items />}
          {tab === 'modelo' && <Models />}
          {tab === 'habilidades' && <Skills />}
          {tab === 'perfil' && <TreeProfile />}
        </div>
      </section>
    </div>
  );
}

function Powers() {
  const on = useGod((g) => g.on), setOn = useGod((g) => g.setOn);
  const toast = useGame((s) => s.toast);
  return (
    <div className="god-col">
      <button className={'god-switch' + (on ? ' on' : '')} onClick={() => setOn(!on)} aria-pressed={on}>
        <b>{on ? 'GOD ligado' : 'GOD desligado'}</b>
        <small>{on ? 'Toque para desligar' : 'Toque para ligar'}</small>
      </button>
      <ul className="god-list">
        <li>Ninguém te machuca (vida sempre cheia)</li>
        <li>SP e stamina infinitos</li>
        <li>Habilidades sem recarga</li>
        <li>Seus golpes e habilidades causam muito mais dano</li>
      </ul>
      <div className="god-row">
        <button onClick={() => { healCompanion(vitals.hpMax); vitals.sp = vitals.spMax; vitals.st = vitals.stMax; toast('Vida, SP e stamina cheios.', 'gold'); }}>Curar tudo</button>
        <button onClick={() => { if (!reviveCompanion(true)) toast('Ela não está desmaiada.', 'soft'); }}>Levantar</button>
      </div>
    </div>
  );
}

function Monsters({ inWorld }: { inWorld: boolean }) {
  const toast = useGame((s) => s.toast);
  const spawns = useGod((g) => g.spawns.length);
  const defs = brain.defs.length ? brain.defs : DEFAULT_CREATURES;
  const [slug, setSlug] = useState(defs[0]?.slug ?? '');
  const [level, setLevel] = useState(5);
  const [count, setCount] = useState(1);
  const def = defs.find((d) => d.slug === slug) ?? defs[0];
  const st = def ? creatureStatsAt(def, level) : null;
  return (
    <div className="god-col">
      {!inWorld && <p className="god-warn">Os monstros só aparecem no Companion World. Entre lá e invoque de novo (os já invocados esperam por você).</p>}
      <label>Monstro
        <select value={def?.slug ?? ''} onChange={(e) => setSlug(e.target.value)}>
          {defs.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
        </select>
      </label>
      <div className="god-row">
        <label>Nível <input type="number" min={1} max={99} value={level} onChange={(e) => setLevel(Math.max(1, Math.min(99, Number(e.target.value) || 1)))} /></label>
        <label>Quantos <input type="number" min={1} max={8} value={count} onChange={(e) => setCount(Math.max(1, Math.min(8, Number(e.target.value) || 1)))} /></label>
      </div>
      {st && <small className="god-hint">nv {level}: vida {Math.round(st.vida)} · poder {Math.round(st.poder)} · defesa {Math.round(st.defesa)}</small>}
      <div className="god-row">
        <button className="primary" disabled={!def} onClick={() => { if (!def) return; useGod.getState().summon(def.slug, level, { x: companionFocus.x, z: companionFocus.z }, count); toast(`${count}× ${def.name} nv ${level} invocado${count > 1 ? 's' : ''} perto de você.`, 'gold'); }}>Invocar</button>
        <button disabled={!spawns} onClick={() => useGod.getState().clearSpawns()}>Limpar invocados{spawns ? ` (${spawns})` : ''}</button>
      </div>
    </div>
  );
}

function Items() {
  const items = useGame((s) => s.items), toast = useGame((s) => s.toast);
  const [cat, setCat] = useState<ItemCategory | 'todos'>('todos');
  const [q, setQ] = useState('');
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const list = useMemo(() => items.filter((i) => !i.slug.startsWith('inst-') && (cat === 'todos' || categoryOf(i.type) === cat) && (!q || i.name.toLowerCase().includes(q.toLowerCase()))), [items, cat, q]);
  const give = async (slugs: string[], n: number) => {
    setBusy(true);
    let fail: string | null = null;
    for (const slug of slugs) fail = (await useGame.getState().bagAction('inventory.grant', { slug, qty: n })) ?? fail;
    setBusy(false);
    toast(fail ? fail : slugs.length === 1 ? `${n}× na bolsa.` : `${slugs.length} itens na bolsa.`, fail ? 'warn' : 'gold');
  };
  return (
    <div className="god-col">
      <div className="god-row">
        <select value={cat} onChange={(e) => setCat(e.target.value as ItemCategory | 'todos')} aria-label="Tipo">
          <option value="todos">Todos os tipos</option>
          {(Object.keys(ITEM_CATEGORIES) as ItemCategory[]).map((k) => <option key={k} value={k}>{ITEM_CATEGORIES[k].label}</option>)}
        </select>
        <input placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar item" />
      </div>
      <div className="god-row">
        <span>Quantidade</span>
        {[1, 5, 20].map((n) => <button key={n} className={qty === n ? 'on' : ''} onClick={() => setQty(n)}>{n}</button>)}
        <button disabled={busy || !list.length} onClick={() => void give(list.map((i) => i.slug), qty)}>Dar todos da lista ({list.length})</button>
      </div>
      <ul className="god-items">
        {list.map((i) => (
          <li key={i.slug}>
            <span><b>{i.name}</b><small>{ITEM_CATEGORIES[categoryOf(i.type)].label} · {i.rarity}</small></span>
            <button disabled={busy} onClick={() => void give([i.slug], qty)}>+{qty}</button>
          </li>
        ))}
        {!list.length && <li className="god-hint">Nenhum item. Publique itens no Arsenal.</li>}
      </ul>
    </div>
  );
}

function Models() {
  const list = useCompanionModels();
  const cur = useGod((g) => g.modelName), toast = useGame((s) => s.toast);
  return (
    <div className="god-col">
      <p className="god-hint">{cur ? `Usando agora: ${cur} (só nesta aba)` : 'Usando o seu modelo.'}</p>
      {cur && <button onClick={() => { useGod.getState().setModel(null); toast('Voltou ao seu modelo.', 'soft'); }}>Voltar ao meu modelo</button>}
      {list === null && <p className="god-hint">Carregando modelos…</p>}
      {list && !list.length && <p className="god-hint">Nenhum modelo enviado na Fábrica ainda.</p>}
      <ul className="god-items">
        {list?.map((m) => (
          <li key={m.companionId}>
            <span><b>{m.name ?? 'Companion'}</b><small>{m.status} · {m.all?.length ?? m.anims.length} animações</small></span>
            <button onClick={() => { useGod.getState().setModel({ url: m.url, anims: m.all ?? m.anims }, m.name ?? 'Companion'); toast(`Modelo de ${m.name ?? 'Companion'} em uso.`, 'gold'); }}>Usar</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Skills() {
  const catalog = useSkills((s) => s.catalog), granted = useGod((g) => g.skills), toast = useGame((s) => s.toast);
  const [q, setQ] = useState('');
  const [level, setLevel] = useState(1);
  const list = catalog.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="god-col">
      <div className="god-row">
        <input placeholder="Buscar habilidade" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar habilidade" />
        <label>Nível <select value={level} onChange={(e) => setLevel(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
      </div>
      <ul className="god-items">
        {list.map((s) => {
          const has = granted[s.slug];
          return (
            <li key={s.slug}>
              <span><b>{s.name}{has ? ` · nv ${has}` : ''}</b><small>{s.description}</small></span>
              <span className="god-row">
                <button onClick={() => { useGod.getState().grantSkill(s.slug, level); toast(`${s.name} (nv ${level}) na sua barra.`, 'gold'); }}>{has ? 'Mudar' : 'Dar'}</button>
                {has && <button onClick={() => useGod.getState().revokeSkill(s.slug)} aria-label={`Tirar ${s.name}`}>Tirar</button>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TreeProfile() {
  const c = useGame(s => s.snap?.companion);
  const profile = useGod(g => g.treeProfile);
  const active = profile?.companionId === c?.id ? profile : null;
  const [species, setSpecies] = useState<SpeciesKey>(active?.species ?? c?.discoveries.form ?? 'serpente');
  const [essence, setEssence] = useState<Element | ''>(active ? active.essence ?? '' : c?.discoveries.element ?? '');
  if (!c) return <p className="god-hint">Abra um Companion para testar.</p>;
  return <div className="god-col">
    <p className="god-hint">Escolha a combinação e abra Habilidades para testar a árvore. Os pontos e a barra de teste duram só nesta sessão; o vínculo atual continua definindo os requisitos.</p>
    <label>Classe de teste<select value={species} onChange={e => setSpecies(e.target.value as SpeciesKey)}>{(Object.keys(SPECIES) as SpeciesKey[]).map(key => <option key={key} value={key}>{SPECIES[key].label}</option>)}</select></label>
    <label>Essência de teste<select value={essence} onChange={e => setEssence(e.target.value as Element | '')}><option value="">Sem essência</option>{(Object.keys(ELEMENTS) as Element[]).map(key => <option key={key} value={key}>{ELEMENTS[key].label}</option>)}</select></label>
    {active && <p className="god-warn" role="status">Teste ativo: {SPECIES[active.species].label} · {active.essence ? ELEMENTS[active.essence].label : 'Sem essência'}</p>}
    <div className="god-row">
      <button className="primary" onClick={() => { useGod.getState().testTree(c.id, species, essence || null); useGod.getState().setOpen(false); }}>Aplicar teste</button>
      {active && <button onClick={() => useGod.getState().stopTreeTest()}>Restaurar classe e essência originais</button>}
    </div>
  </div>;
}
