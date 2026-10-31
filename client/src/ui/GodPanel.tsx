/**
 * Modo GOD: botão e painel de testes que só a conta de Administrador vê, dentro do jogo.
 * Poderes (invulnerável, SP infinito, sem recarga, dano alto), invocar monstros do Invocador, dar itens do Arsenal,
 * trocar o modelo 3D por um dos enviados na Fábrica e dar habilidades da Forja (valem na barra 1–9).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  CITY_MARKERS, DEFAULT_CREATURES, GATES, GATE_IDS, ITEM_CATEGORIES, OUT_ARRIVAL, categoryOf, cityArrival, creatureStatsAt, outskirtsGatePoint,
  type CityLayout, type CompanionWorld, type ItemCategory,
} from '@rules';
import { supabase } from '../backend/online';
import { useGame } from '../store';
import { companionFocus } from '../scene/world';
import { brain } from '../scene/brain';
import { healCompanion, reviveCompanion, vitals } from '../scene/vitals';
import { farPoses, remotePoses, usePresence, watchWorld } from '../net/presence';
import { useSkills } from './skillState';
import { useCompanionModels } from './companionModels';
import { useGod, type TpPlace } from './godMode';

type Tab = 'poderes' | 'teleporte' | 'monstros' | 'itens' | 'modelo' | 'habilidades';
const TABS: [Tab, string][] = [['poderes', 'Poderes'], ['teleporte', 'Teleporte'], ['monstros', 'Monstros'], ['itens', 'Itens'], ['modelo', 'Modelo 3D'], ['habilidades', 'Habilidades']];
const DEV_FORCE = typeof location !== 'undefined' && import.meta.env.DEV && new URLSearchParams(location.search).has('god');
const PLACE_LABEL: Record<TpPlace, string> = { refuge: 'Refúgio', world: 'Companion World', arredores: 'Arredores de Áster', cidade: 'Cidade de Áster' };
interface Where { place: TpPlace; world: CompanionWorld; city: CityLayout }

/** Botão ⚡ (só aparece para o Administrador) e o painel. */
export function GodMode({ inWorld, ...where }: { inWorld: boolean } & Where) {
  const admin = useGod((g) => g.admin), open = useGod((g) => g.open), on = useGod((g) => g.on);
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
      <button className={'god-btn' + (on ? ' on' : '')} onClick={() => useGod.getState().setOpen(!open)} aria-label="Modo GOD (Administrador)" aria-expanded={open}>⚡<small>GOD</small></button>
      {open && <GodPanel inWorld={inWorld} where={where} />}
    </>
  );
}

function GodPanel({ inWorld, where }: { inWorld: boolean; where: Where }) {
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
          {tab === 'teleporte' && <Teleport {...where} />}
          {tab === 'monstros' && <Monsters inWorld={inWorld} />}
          {tab === 'itens' && <Items />}
          {tab === 'modelo' && <Models />}
          {tab === 'habilidades' && <Skills />}
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

interface Spot { key: string; group: string; name: string; place: TpPlace; x: number; z: number }

function Teleport({ place, world, city }: Where) {
  const toast = useGame((s) => s.toast);
  const online = useGame((s) => s.backend?.kind === 'online');
  const players = usePresence((s) => s.all);
  const [q, setQ] = useState('');
  const [xz, setXz] = useState(() => ({ x: Math.round(companionFocus.x), z: Math.round(companionFocus.z) }));
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 1000); return () => window.clearInterval(t); }, []);
  // no Refúgio a presença não está ligada: só observa os mapas (sem aparecer para ninguém)
  const local = !online && import.meta.env.DEV && new URLSearchParams(location.search).has('eco');
  useEffect(() => { if (place !== 'refuge' || (!online && !local)) return; return watchWorld(local); }, [place, online, local]);

  const spots = useMemo<Spot[]>(() => {
    const out: Spot[] = [{ key: 'refugio', group: 'Refúgio', name: 'Meu Refúgio', place: 'refuge', x: 0, z: 0 }];
    // pedras-guia: um passo para o lado, para não nascer dentro delas
    for (const s of [...world.sites].sort((a, b) => Number(b.home) - Number(a.home) || Number(!!b.gate) - Number(!!a.gate) || a.name.localeCompare(b.name)))
      out.push({ key: `w-${s.i}-${s.j}`, group: 'Companion World', name: s.home && !/portal/i.test(s.name) ? `${s.name} (Portal do Refúgio)` : s.name, place: 'world', x: s.x + 4, z: s.z + 4 });
    out.push({ key: 'a-chegada', group: 'Áster · Arredores', name: 'Chegada (portal do sul)', place: 'arredores', x: OUT_ARRIVAL.x, z: OUT_ARRIVAL.z - 6 });
    for (const g of GATE_IDS) { const p = outskirtsGatePoint(g, 9); out.push({ key: 'a-' + g, group: 'Áster · Arredores', name: `${GATES[g].label} (de fora)`, place: 'arredores', x: p.x, z: p.z }); }
    for (const m of city.markers) {
      if (m.kind === 'chegada') continue;
      const p = m.kind === 'portao' ? cityArrival(city, m.gate ?? 'sul') : m.kind === 'cristal' ? { x: m.x, z: m.z + 8 } : { x: m.x + 2, z: m.z + 2 };
      out.push({ key: 'c-' + m.id, group: 'Áster · Cidade', name: m.kind === 'portao' ? `${m.name} (por dentro)` : `${CITY_MARKERS[m.kind].icon} ${m.name}`, place: 'cidade', x: p.x, z: p.z });
    }
    return out;
  }, [world, city]);

  const go = (to: TpPlace, x: number, z: number, label: string) => { useGod.getState().teleportTo(to, x, z); toast(`Teleporte: ${label}.`, 'gold'); };
  const list = spots.filter((s) => !q || (s.group + ' ' + s.name).toLowerCase().includes(q.toLowerCase()));
  const groups = [...new Set(list.map((s) => s.group))];
  return (
    <div className="god-col">
      <p className="god-hint">Você está em <b>{PLACE_LABEL[place]}</b> · x {Math.round(companionFocus.x)}, z {Math.round(companionFocus.z)}</p>
      <div className="god-row">
        <label>X <input type="number" value={xz.x} onChange={(e) => setXz({ ...xz, x: Number(e.target.value) || 0 })} /></label>
        <label>Z <input type="number" value={xz.z} onChange={(e) => setXz({ ...xz, z: Number(e.target.value) || 0 })} /></label>
        <button onClick={() => go(place, xz.x, xz.z, `x ${xz.x}, z ${xz.z}`)}>Ir (neste mapa)</button>
      </div>

      <b>Jogadores</b>
      <ul className="god-items">
        {players.map(({ info: o, map }) => {
          const pose = () => remotePoses.get(o.id) ?? farPoses.get(o.id);
          const p = pose(), ok = !!p && Number.isFinite(p.x);
          return (
            <li key={o.id}>
              <span><b style={{ color: o.color }}>{o.name}</b><small>{PLACE_LABEL[map]}{map === place ? ' (aqui)' : ''} · {ok ? `x ${Math.round(p!.x)}, z ${Math.round(p!.z)}` : 'esperando a posição…'}</small></span>
              <button disabled={!ok} onClick={() => { const r = pose(); if (r && Number.isFinite(r.x)) go(map, r.x + 2, r.z + 2, `perto de ${o.name}`); }}>Ir</button>
            </li>
          );
        })}
        {!players.length && <li className="god-hint">{online || local ? 'Ninguém no Companion World nem em Áster agora (quem está no próprio Refúgio não aparece).' : 'Jogue online para ver os outros jogadores.'}</li>}
      </ul>

      <b>Lugares</b>
      <input placeholder="Buscar lugar" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar lugar" />
      <ul className="god-items">
        {groups.map((g) => [
          <li key={'g-' + g} className="god-hint"><b>{g}</b></li>,
          ...list.filter((s) => s.group === g).map((s) => (
            <li key={s.key}>
              <span><b>{s.name}</b>{s.place !== 'refuge' && <small>x {Math.round(s.x)}, z {Math.round(s.z)}</small>}</span>
              <button onClick={() => go(s.place, s.x, s.z, s.name)}>Ir</button>
            </li>
          )),
        ])}
      </ul>
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
