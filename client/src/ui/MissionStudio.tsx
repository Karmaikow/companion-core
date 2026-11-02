/**
 * Missões (painel do ADM): quem dá, raridade e repetição; objetivos (coletar, entregar, caçar, fabricar); requisitos
 * (missão anterior, vínculo, escola, classe, essência) e prêmios (Lumes, vínculo, materiais, itens, desbloqueio).
 * O jogo confere tudo no servidor: progresso só conta o que acontece depois de aceitar.
 */
import { WEAPON_KINDS, ITEM_TYPES, TIERS, TIER_KEYS, type WeaponReq } from '@rules';
import { useEffect, useMemo, useState } from 'react';
import {
  sanitizeMission, biomeSlug, objectiveLabel, batchKey, parseBatchKey, recipeName, sanitizeCreature, sanitizeItem, sanitizeBiome,
  MISSION_RARITIES, MISSION_REPEATS, MISSION_GIVERS, OBJECTIVE_KINDS, MAX_OBJECTIVES, DEFAULT_MISSIONS, CRAFTABLES, CREATURE_FAMILIES,
  MATERIALS, CATEGORIES, PROP_LABEL, BAND_LABEL, CITY_SCHOOLS, CLASS_LABEL, ELEMENTS, RARITIES, UNLOCKS,
  type MissionDef, type MissionObjective, type MissionRarity, type MissionRepeat, type MissionGiver, type ObjectiveKind,
  type ResCategory, type PropKey, type Band, type CitySchool, type SpeciesKey, type Element, type CreatureDef, type ItemDef, type BiomeConfig,
} from '@rules';
import { supabase } from '../backend/online';
import { useCatalog } from './catalog';
import { EditorHead, ListSearch, StudioActions, Tabs, ask, matches, useAdminDirty } from './adminKit';

const BANDS: Band[] = ['baixa', 'media', 'alta'];
const EMPTY: Omit<MissionDef, 'slug' | 'name'> = {
  description: '', rarity: 'comum', repeat: 'unica', giver: 'casa-dos-ecos',
  req: { after: [], bond: 0, schools: [], classes: [], essences: [], weapon: null },
  objectives: [{ kind: 'coletar', qty: 5, material: 'erva-orvalho-folha' }],
  rewards: { lumes: 30, bond: 10, materials: [], items: [] },
};
const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function MissionStudio() {
  const cat = useCatalog<MissionDef>('missions', sanitizeMission);
  const creatures = useCatalog<CreatureDef>('creatures', sanitizeCreature);
  const items = useCatalog<ItemDef>('items', sanitizeItem);
  const [biomes, setBiomes] = useState<BiomeConfig[]>([]);
  useEffect(() => { void supabase().from('biomes').select('slug,name,description,palette,settings,assets').then(({ data }) => setBiomes((data ?? []).map(sanitizeBiome).filter((b) => b.settings.kind === 'world' || b.slug === 'refugio'))); }, []);
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<MissionDef | null>(null);
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [newName, setNewName] = useState('');
  const [tab, setTab] = useState('dados');
  const [q, setQ] = useState('');
  useAdminDirty(dirty);

  const run = async (f: () => Promise<unknown>, ok: string) => { setBusy(true); setMsg(null); try { await f(); setMsg({ ok: true, text: ok }); } catch (e) { setMsg({ text: (e as Error).message }); } finally { setBusy(false); } };
  const pick = async (slug: string) => {
    if (dirty && !(await ask({ title: 'Trocar sem salvar?', body: 'Há mudanças não salvas nesta missão. Se trocar agora, elas se perdem.', confirm: 'Trocar e descartar', cancel: 'Continuar editando', danger: true }))) return;
    const r = cat.rows?.find((x) => x.slug === slug);
    setSel(slug); setDraft(r ? structuredClone(r.data) : null); setStatus(r?.status ?? 'draft'); setDirty(false); setMsg(null);
  };
  const edit = (p: Partial<MissionDef>) => { setDraft((d) => (d ? { ...d, ...p } : d)); setDirty(true); };
  const editObj = (i: number, p: Partial<MissionObjective>) => edit({ objectives: draft!.objectives.map((o, k) => (k === i ? { ...o, ...p } : o)) });
  function create() {
    const slug = biomeSlug(newName);
    if (!newName.trim()) return;
    if (cat.rows?.some((r) => r.slug === slug)) { setMsg({ text: `Já existe "${slug}".` }); return; }
    setSel(slug); setDraft({ ...structuredClone(EMPTY), slug, name: newName.trim() }); setStatus('draft'); setDirty(true); setNewName(''); setTab('dados');
  }
  const names = (kind: 'creature' | 'family' | 'biome', slug: string) =>
    kind === 'creature' ? creatures.rows?.find((c) => c.slug === slug)?.name ?? slug : kind === 'family' ? CREATURE_FAMILIES.find((f) => f.id === slug)?.name ?? slug : biomes.find((b) => b.slug === slug)?.name ?? slug;
  const found = (cat.rows ?? []).filter((r) => matches(q, r.name, r.slug, MISSION_GIVERS[r.data.giver], MISSION_RARITIES[r.data.rarity].label));
  const byGiver = (g: MissionGiver) => found.filter((r) => r.data.giver === g);
  const missing = DEFAULT_MISSIONS.filter((d) => cat.rows && !cat.rows.some((r) => r.slug === d.slug));
  const clean = useMemo(() => (draft ? sanitizeMission(draft) : null), [draft]);
  // objetivos que o saneamento descartaria (falta material, receita…)
  const dropped = draft && clean ? draft.objectives.length - clean.objectives.length : 0;

  return (
    <div className="biome-studio">
      <aside className="biome-list">
        <div className="list-head"><h2>Missões <small>{cat.rows?.length ?? 0}</small></h2></div>
        <form className="biome-new" onSubmit={(e) => { e.preventDefault(); create(); }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome da nova missão" maxLength={60} aria-label="Nome da nova missão" />
          <button className="primary" disabled={!newName.trim()}>+ Criar</button>
        </form>
        <ListSearch value={q} onChange={setQ} label="Buscar missão" count={found.length} />
        {cat.error && <p className="msg err">{cat.error}</p>}
        {cat.rows && !cat.rows.length && <button className="primary" disabled={busy} onClick={() => void run(() => cat.saveMany(DEFAULT_MISSIONS, 'draft'), `${DEFAULT_MISSIONS.length} missões de exemplo como rascunho.`)}>Carregar {DEFAULT_MISSIONS.length} missões de exemplo (rascunho)</button>}
        {(Object.keys(MISSION_GIVERS) as MissionGiver[]).map((g) => byGiver(g).length > 0 && (
          <div key={g} className="biome-group">
            <h3>{MISSION_GIVERS[g]}</h3>
            <ul>
              {byGiver(g).map((r) => (
                <li key={r.slug}><button className={sel === r.slug ? 'on' : ''} onClick={() => pick(r.slug)}>
                  <strong><i className="look-dot" style={{ background: MISSION_RARITIES[r.data.rarity].color }} />{r.name}</strong>
                  <small>{MISSION_RARITIES[r.data.rarity].label} · {MISSION_REPEATS[r.data.repeat]} · {r.data.objectives.length} objetivo(s){r.status === 'draft' ? ' · rascunho' : ''}</small>
                </button></li>
              ))}
            </ul>
          </div>
        ))}
        {cat.rows && cat.rows.length > 0 && missing.length > 0 && <button className="ghost" disabled={busy} onClick={() => void run(() => cat.saveMany(missing, 'draft'), 'Exemplos adicionados como rascunho.')}>+ {missing.length} missões de exemplo</button>}
      </aside>

      {!draft ? <section className="biome-empty"><p>Escolha uma missão ou crie uma nova. A missão só aparece no jogo depois de publicada.</p></section> : (
        <section className="biome-editor">
          <EditorHead name={draft.name} sub={`${MISSION_RARITIES[draft.rarity].label} · ${MISSION_REPEATS[draft.repeat]} · ${MISSION_GIVERS[draft.giver]}`} color={MISSION_RARITIES[draft.rarity].color} status={status} dirty={dirty} />
          <Tabs label="Partes da missão" idPrefix="mis-" value={tab} onChange={setTab} items={[
            { key: 'dados', label: 'Dados', done: !!draft.description },
            { key: 'objetivos', label: `Objetivos (${draft.objectives.length})`, done: !!clean?.objectives.length },
            { key: 'requisitos', label: 'Requisitos' },
            { key: 'premios', label: 'Prêmios', done: !!(draft.rewards.lumes || draft.rewards.bond || draft.rewards.materials.length || draft.rewards.items.length || draft.rewards.unlock) },
          ]} />
          <div className="biome-form">
            {tab === 'dados' && <>
              <label>Nome<input value={draft.name} onChange={(e) => edit({ name: e.target.value })} maxLength={60} /></label>
              <label>Descrição (o que o jogador lê)<textarea rows={3} value={draft.description} onChange={(e) => edit({ description: e.target.value })} maxLength={400} /></label>
              <div className="row-3">
                <label>Raridade<select value={draft.rarity} onChange={(e) => edit({ rarity: e.target.value as MissionRarity })}>{Object.entries(MISSION_RARITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
                <label>Repetição<select value={draft.repeat} onChange={(e) => edit({ repeat: e.target.value as MissionRepeat })}>{Object.entries(MISSION_REPEATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label>Quem dá<select value={draft.giver} onChange={(e) => edit({ giver: e.target.value as MissionGiver })}>{Object.entries(MISSION_GIVERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              </div>
              <small className="hint">"Quem dá" é onde se pega e entrega a missão. Por enquanto todas aparecem no painel Missões do jogo; os prédios de Áster passam a dar as deles na próxima etapa.</small>
            </>}

            {tab === 'objetivos' && <>
              {draft.objectives.map((o, i) => <ObjectiveRow key={i} o={o} onChange={(p) => editObj(i, p)} onRemove={() => edit({ objectives: draft.objectives.filter((_, k) => k !== i) })} creatures={creatures.rows?.map((r) => r.data) ?? []} biomes={biomes} names={names} />)}
              {dropped > 0 && <p className="ap-why">{dropped} objetivo(s) incompleto(s) não serão salvos: escolha o material, a criatura ou a receita.</p>}
              <button className="ghost" disabled={draft.objectives.length >= MAX_OBJECTIVES} onClick={() => edit({ objectives: [...draft.objectives, { kind: 'coletar', qty: 5, material: 'erva-orvalho-folha' }] })}>+ Objetivo</button>
              <small className="hint">O progresso conta só o que acontece depois de aceitar: coletas confirmadas, monstros derrotados e receitas ou preparos feitos. "Entregar" tira da mochila de coleta na hora.</small>
            </>}

            {tab === 'requisitos' && <>
              <fieldset><legend>Antes desta, concluir</legend>
                <div className="chips">{(cat.rows ?? []).filter((r) => r.slug !== draft.slug).map((r) => { const on = draft.req.after.includes(r.slug); return <button key={r.slug} type="button" className={'chip' + (on ? ' on' : '')} aria-pressed={on} onClick={() => edit({ req: { ...draft.req, after: toggle(draft.req.after, r.slug) } })}>{r.name}</button>; })}</div>
              </fieldset>
              <label>Vínculo mínimo<input type="number" min={0} max={99} value={draft.req.bond} onChange={(e) => edit({ req: { ...draft.req, bond: Number(e.target.value) || 0 } })} style={{ width: 80 }} /></label>
              <fieldset><legend>Estudar na escola</legend>
                <div className="chips">{(Object.keys(CITY_SCHOOLS) as CitySchool[]).map((s) => { const on = draft.req.schools.includes(s); return <button key={s} type="button" className={'chip' + (on ? ' on' : '')} aria-pressed={on} onClick={() => edit({ req: { ...draft.req, schools: toggle(draft.req.schools, s) } })}>{CITY_SCHOOLS[s].label}</button>; })}</div>
              </fieldset>
              <fieldset><legend>Só estas classes (nenhuma marcada = todas)</legend>
                <div className="chips">{(Object.keys(CLASS_LABEL) as SpeciesKey[]).map((s) => { const on = draft.req.classes.includes(s); return <button key={s} type="button" className={'chip' + (on ? ' on' : '')} aria-pressed={on} onClick={() => edit({ req: { ...draft.req, classes: toggle(draft.req.classes, s) } })}>{CLASS_LABEL[s]}</button>; })}</div>
              </fieldset>
              <fieldset><legend>Só estas essências (nenhuma marcada = todas)</legend>
                <div className="chips">{(Object.keys(ELEMENTS) as Element[]).filter((e) => e !== 'veneno').map((s) => { const on = draft.req.essences.includes(s); return <button key={s} type="button" className={'chip' + (on ? ' on' : '')} aria-pressed={on} onClick={() => edit({ req: { ...draft.req, essences: toggle(draft.req.essences, s) } })}>{ELEMENTS[s].label}</button>; })}</div>
              </fieldset>
              <fieldset><legend>Arma na mão (opcional)</legend>
                <div className="row">
                  <label>Tipo<select value={draft.req.weapon ? draft.req.weapon.kind ?? '' : 'none'} onChange={(e) => edit({ req: { ...draft.req, weapon: e.target.value === 'none' ? null : { tier: draft.req.weapon?.tier ?? 1, ...(draft.req.weapon?.twoHanded ? { twoHanded: true } : {}), kind: (e.target.value || null) as WeaponReq['kind'] } } })}>
                    <option value="none">Não pede arma</option><option value="">Qualquer arma</option>
                    {WEAPON_KINDS.map((k) => <option key={k} value={k}>{ITEM_TYPES[k].label}</option>)}
                  </select></label>
                  {draft.req.weapon && <label>Tier mínimo<select value={draft.req.weapon.tier} onChange={(e) => edit({ req: { ...draft.req, weapon: { ...draft.req.weapon!, tier: Number(e.target.value) as WeaponReq['tier'] } } })}>{TIER_KEYS.map((t) => <option key={t} value={t}>{TIERS[t].label}</option>)}</select></label>}
                  {draft.req.weapon && <label className="check"><input type="checkbox" checked={!!draft.req.weapon.twoHanded} onChange={(e) => edit({ req: { ...draft.req, weapon: { ...draft.req.weapon!, twoHanded: e.target.checked || undefined } } })} /> De duas mãos</label>}
                </div>
              </fieldset>
            </>}

            {tab === 'premios' && <Rewards draft={draft} edit={edit} items={items.rows?.map((r) => r.data) ?? []} />}

            <StudioActions name={draft.name} status={status} dirty={dirty} busy={busy} msg={msg}
              note={clean ? <small className="hint">Resumo: {clean.objectives.map((o) => objectiveLabel(o, names)).join(' · ') || 'sem objetivos'}.</small> : <small className="hint">Dê um nome à missão.</small>}
              onSave={() => void run(async () => { await cat.save(draft, status); setDirty(false); }, status === 'published' ? 'Salvo: já vale no jogo.' : 'Rascunho salvo.')}
              onPublish={() => void run(async () => { if (!clean?.objectives.length) throw new Error('A missão precisa de pelo menos um objetivo completo.'); await cat.save(draft, 'published'); setStatus('published'); setDirty(false); }, 'Publicada: já aparece no jogo.')}
              onUnpublish={() => void run(async () => { await cat.save(draft, 'draft'); setStatus('draft'); setDirty(false); }, 'Despublicada: saiu do jogo (quem já aceitou fica sem ela).')}
              onDelete={() => void run(async () => { await cat.remove(draft.slug); setSel(null); setDraft(null); setDirty(false); }, 'Apagada.')} />
          </div>
        </section>
      )}
    </div>
  );
}

function ObjectiveRow({ o, onChange, onRemove, creatures, biomes, names }: {
  o: MissionObjective; onChange: (p: Partial<MissionObjective>) => void; onRemove: () => void; creatures: CreatureDef[]; biomes: BiomeConfig[];
  names: (kind: 'creature' | 'family' | 'biome', slug: string) => string;
}) {
  const props = o.material ? (Object.keys(MATERIALS[o.material]?.ranges ?? {}) as PropKey[]) : o.category ? (Object.keys(PROP_LABEL) as PropKey[]).filter((p) => Object.values(MATERIALS).some((m) => m.category === o.category && p in m.ranges)) : [];
  const setKind = (kind: ObjectiveKind) => onChange(kind === 'cacar' ? { kind, material: undefined, category: undefined, prop: undefined, min: undefined, biome: undefined, recipe: undefined } : kind === 'fabricar' ? { kind, recipe: CRAFTABLES[0], material: undefined, category: undefined, prop: undefined, min: undefined, biome: undefined, creature: undefined, family: undefined, minLevel: undefined } : { kind, creature: undefined, family: undefined, minLevel: undefined, recipe: undefined, material: o.material ?? 'erva-orvalho-folha', biome: kind === 'entregar' ? undefined : o.biome });
  return (
    <div className="asset-row">
      <select value={o.kind} onChange={(e) => setKind(e.target.value as ObjectiveKind)} aria-label="Tipo do objetivo">{Object.entries(OBJECTIVE_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <label>Qtd <input type="number" min={1} max={999} value={o.qty} onChange={(e) => onChange({ qty: Number(e.target.value) || 1 })} /></label>
      {(o.kind === 'coletar' || o.kind === 'entregar') && <>
        <select value={o.material ? 'm:' + o.material : 'c:' + (o.category ?? '')} onChange={(e) => { const [t, v] = e.target.value.split(':'); onChange(t === 'm' ? { material: v, category: undefined, prop: undefined, min: undefined } : { category: v as ResCategory, material: undefined, prop: undefined, min: undefined }); }} aria-label="Material">
          <optgroup label="Qualquer da categoria">{(Object.keys(CATEGORIES) as ResCategory[]).filter((c) => Object.values(MATERIALS).some((m) => m.category === c)).map((c) => <option key={c} value={'c:' + c}>{CATEGORIES[c].icon} {CATEGORIES[c].label}</option>)}</optgroup>
          <optgroup label="Material">{Object.values(MATERIALS).map((m) => <option key={m.id} value={'m:' + m.id}>{CATEGORIES[m.category].icon} {m.name}</option>)}</optgroup>
        </select>
        {props.length > 0 && <select value={o.prop ? `${o.prop}:${o.min}` : ''} onChange={(e) => { const [p, b] = e.target.value.split(':'); onChange(p ? { prop: p as PropKey, min: b as Band } : { prop: undefined, min: undefined }); }} aria-label="Faixa mínima">
          <option value="">qualquer qualidade</option>
          {props.flatMap((p) => BANDS.slice(1).map((b) => <option key={p + b} value={`${p}:${b}`}>{PROP_LABEL[p]} {BAND_LABEL[b]}+</option>))}
        </select>}
        {o.kind === 'coletar' && <select value={o.biome ?? ''} onChange={(e) => onChange({ biome: e.target.value || undefined })} aria-label="Região"><option value="">em qualquer região</option>{biomes.map((b) => <option key={b.slug} value={b.slug}>em {b.name}</option>)}</select>}
      </>}
      {o.kind === 'cacar' && <>
        <select value={o.creature ? 'c:' + o.creature : o.family ? 'f:' + o.family : ''} onChange={(e) => { const [t, v] = e.target.value.split(':'); onChange(t === 'c' ? { creature: v, family: undefined } : t === 'f' ? { family: v, creature: undefined } : { creature: undefined, family: undefined }); }} aria-label="Criatura">
          <option value="">qualquer monstro</option>
          <optgroup label="Família">{CREATURE_FAMILIES.map((f) => <option key={f.id} value={'f:' + f.id}>{f.name}</option>)}</optgroup>
          <optgroup label="Criatura">{creatures.map((c) => <option key={c.slug} value={'c:' + c.slug}>{c.name}</option>)}</optgroup>
        </select>
        <label>nível mín. <input type="number" min={0} max={60} value={o.minLevel ?? 0} onChange={(e) => onChange({ minLevel: Number(e.target.value) || undefined })} /></label>
      </>}
      {o.kind === 'fabricar' && <select value={o.recipe ?? ''} onChange={(e) => onChange({ recipe: e.target.value })} aria-label="Receita">{CRAFTABLES.map((r) => <option key={r} value={r}>{recipeName(r)}</option>)}</select>}
      <input className="asset-name" value={o.label ?? ''} onChange={(e) => onChange({ label: e.target.value || undefined })} placeholder={objectiveLabel({ ...o, label: undefined }, names)} maxLength={80} aria-label="Texto do objetivo (opcional)" />
      <button className="link" onClick={onRemove}>tirar</button>
    </div>
  );
}

function Rewards({ draft, edit, items }: { draft: MissionDef; edit: (p: Partial<MissionDef>) => void; items: ItemDef[] }) {
  const rw = draft.rewards, set = (p: Partial<MissionDef['rewards']>) => edit({ rewards: { ...rw, ...p } });
  const [mat, setMat] = useState('erva-orvalho-raiz'), [band, setBand] = useState<Band>('media');
  const keyOf = (m: string, b: Band) => batchKey(m, Object.fromEntries(Object.keys(MATERIALS[m].ranges).map((p) => [p, b])) as Partial<Record<PropKey, Band>>);
  return <>
    <div className="row-3">
      <label>Lumes<input type="number" min={0} max={100000} value={rw.lumes} onChange={(e) => set({ lumes: Number(e.target.value) || 0 })} /></label>
      <label>XP de vínculo<input type="number" min={0} max={10000} value={rw.bond} onChange={(e) => set({ bond: Number(e.target.value) || 0 })} /></label>
      <label>Desbloqueio (opcional)<input list="unlock-ids" value={rw.unlock ?? ''} onChange={(e) => set({ unlock: e.target.value.trim() || undefined })} placeholder="ex.: variedade:erva-lunar" maxLength={60} />
        <datalist id="unlock-ids">{Object.entries(UNLOCKS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</datalist>
        {rw.unlock && <small className="hint">{UNLOCKS[rw.unlock] ?? 'Sem texto próprio: use o mesmo id na tabela de recursos de um bioma.'}</small>}</label>
    </div>
    <fieldset><legend>Materiais da coleta</legend>
      {rw.materials.map((m, i) => { const p = parseBatchKey(m.key); return (
        <div key={i} className="list-row">
          <span className="grow">{p ? `${MATERIALS[p.material]?.name ?? p.material} (${Object.values(p.bands).map((b) => BAND_LABEL[b as Band]).join('/') || 'padrão'})` : m.key}</span>
          <label>qtd <input type="number" min={1} max={999} value={m.qty} onChange={(e) => set({ materials: rw.materials.map((x, k) => (k === i ? { ...x, qty: Number(e.target.value) || 1 } : x)) })} /></label>
          <button className="link" onClick={() => set({ materials: rw.materials.filter((_, k) => k !== i) })}>tirar</button>
        </div>
      ); })}
      <div className="row">
        <select value={mat} onChange={(e) => setMat(e.target.value)} aria-label="Material do prêmio">{Object.values(MATERIALS).map((m) => <option key={m.id} value={m.id}>{CATEGORIES[m.category].icon} {m.name}</option>)}</select>
        <select value={band} onChange={(e) => setBand(e.target.value as Band)} aria-label="Qualidade">{BANDS.map((b) => <option key={b} value={b}>qualidade {BAND_LABEL[b]}</option>)}</select>
        <button className="ghost" disabled={rw.materials.length >= 8} onClick={() => set({ materials: [...rw.materials, { key: keyOf(mat, band), qty: 1 }] })}>+ Material</button>
      </div>
    </fieldset>
    <fieldset><legend>Itens do Arsenal</legend>
      {rw.items.map((it, i) => (
        <div key={i} className="list-row">
          <select className="grow" value={it.item} onChange={(e) => set({ items: rw.items.map((x, k) => (k === i ? { ...x, item: e.target.value } : x)) })} aria-label="Item">{items.map((x) => <option key={x.slug} value={x.slug}>{x.name} ({RARITIES[x.rarity].label})</option>)}{!items.some((x) => x.slug === it.item) && <option value={it.item}>{it.item}</option>}</select>
          <label>qtd <input type="number" min={1} max={99} value={it.qty} onChange={(e) => set({ items: rw.items.map((x, k) => (k === i ? { ...x, qty: Number(e.target.value) || 1 } : x)) })} /></label>
          <button className="link" onClick={() => set({ items: rw.items.filter((_, k) => k !== i) })}>tirar</button>
        </div>
      ))}
      <button className="ghost" disabled={!items.length || rw.items.length >= 8} onClick={() => set({ items: [...rw.items, { item: items[0].slug, qty: 1 }] })}>+ Item</button>
      <small className="hint">Só itens publicados no Arsenal chegam à bolsa.</small>
    </fieldset>
  </>;
}
