/**
 * Estúdio de Biomas (painel do ADM): cores do chão, pedras e céu + modelos .GLB com papel, zona, tamanho,
 * quantidade e vento, e (nas regiões do mundo) a tabela de recursos de coleta. A prévia 3D usa o mesmo código do jogo.
 * O bioma "refugio", publicado, é o que o Refúgio usa (e a região do portal no mundo).
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  BIOME_ROLES, BIOME_ZONES, BIOME_AMBIENTS, DEFAULT_PALETTE, REFUGE_BIOME, LOOK_PRESETS, LOOK_ORIGINAL, biomeSlug, sanitizeBiome,
  DEFAULT_BIOME_RESOURCES, RESOURCE_TIMES, RESOURCE_TERRAINS, RESOURCE_MAX_DENSITY, NODE_KINDS, CATEGORIES, WEATHERS, WEATHER_KINDS, CHUNK, UNLOCKS,
  type BiomeAmbient, type BiomeKind, type ModelLook, type BiomeAsset, type BiomeAssetRole, type BiomeConfig, type BiomePalette, type BiomeZone,
  type BiomeResource, type ResourceTime, type ResourceTerrain,
} from '@rules';
import { supabase } from '../backend/online';
import { EditorHead, ListSearch, StudioActions, ask, matches, useAdminDirty } from './adminKit';

const BiomePreview = lazy(() => import('../scene/BiomePreview').then((m) => ({ default: m.BiomePreview })));

interface Row extends BiomeConfig { status: 'draft' | 'published'; updated_at?: string }

const PALETTE_LABELS: [keyof BiomePalette, string][] = [
  ['grassLight', 'Grama clara'], ['grassDark', 'Grama escura'], ['dirt', 'Terra'], ['dirtDark', 'Terra escura'],
  ['rockSide', 'Pedra'], ['rockTop', 'Musgo no topo'], ['rockBottom', 'Base da pedra'],
  ['sky', 'Céu (dia)'], ['fog', 'Névoa (dia)'], ['skyNight', 'Céu (noite)'], ['fogNight', 'Névoa (noite)'],
];

/** Papel sugerido pelo nome do arquivo. */
function guessRole(name: string): BiomeAssetRole {
  const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/arvore|tree|pinheiro|palmeira|carvalho/.test(n)) return 'tree';
  if (/pedra|rocha|rock|stone|cristal/.test(n)) return 'rock';
  if (/grama|tufo|grass|capim|mato/.test(n)) return 'grass';
  if (/flor|planta|arbusto|bush|cogumelo|mushroom|samambaia|fern/.test(n)) return 'plant';
  if (/ruina|torre|estatua|portal|totem|marco|arco|templo/.test(n)) return 'landmark';
  return 'prop';
}

const toRow = (r: Record<string, unknown>): Row => ({ ...sanitizeBiome(r), status: r.status === 'published' ? 'published' : 'draft', updated_at: r.updated_at as string | undefined });

export function BiomeStudio() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<Row | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<BiomeKind>('world');
  const [lookOpen, setLookOpen] = useState<string | null>(null);
  const [daylight, setDaylight] = useState(1);
  const [open, setOpen] = useState(true);
  const [q, setQ] = useState('');
  useAdminDirty(dirty);

  const load = useCallback(async () => {
    const { data, error } = await supabase().from('biomes').select('*').order('updated_at', { ascending: false });
    if (error) { setMsg({ text: 'Não consegui ler os biomas: ' + error.message }); return; }
    const list = (data ?? []).map(toRow);
    setRows(list);
    return list;
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function pick(slug: string) {
    if (dirty && !(await ask({ title: 'Trocar sem salvar?', body: 'Há mudanças não salvas neste item. Se trocar agora, elas se perdem.', confirm: 'Trocar e descartar', cancel: 'Continuar editando', danger: true }))) return;
    const r = rows?.find((x) => x.slug === slug) ?? null;
    setSel(slug); setDraft(r ? structuredClone(r) : null); setDirty(false); setMsg(null);
  }

  const edit = (patch: Partial<Row>) => { setDraft((d) => (d ? { ...d, ...patch } : d)); setDirty(true); };
  const editAsset = (id: string, patch: Partial<BiomeAsset>) => edit({ assets: draft!.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)) });

  async function create(fromRefuge: boolean) {
    const name = fromRefuge ? REFUGE_BIOME.name : newName.trim();
    if (!name) { setMsg({ text: 'Dê um nome ao bioma.' }); return; }
    const slug = fromRefuge ? 'refugio' : biomeSlug(name);
    if (rows?.some((r) => r.slug === slug)) { setMsg({ text: `Já existe um bioma "${slug}".` }); return; }
    const kind: BiomeKind = fromRefuge ? 'refuge' : newKind;
    // região nova começa com os modelos do Refúgio (dá para trocar a aparência deles ou tirar)
    const base = fromRefuge ? REFUGE_BIOME : { ...REFUGE_BIOME, slug, name, description: '', assets: kind === 'world' ? REFUGE_BIOME.assets : [], settings: { ...REFUGE_BIOME.settings, kind, world: kind === 'world', cliffs: kind === 'refuge', ambient: (kind === 'world' ? 'none' : 'fireflies') as BiomeAmbient, hills: 1 } };
    setBusy(true);
    const { error } = await supabase().from('biomes').insert({ slug, name, description: base.description, palette: base.palette, settings: base.settings, assets: base.assets, status: 'draft' });
    setBusy(false);
    if (error) { setMsg({ text: 'Não consegui criar: ' + error.message }); return; }
    setNewName('');
    const list = await load();
    const r = list?.find((x) => x.slug === slug);
    if (r) { setSel(slug); setDraft(structuredClone(r)); setDirty(false); }
  }

  async function save(status?: 'draft' | 'published') {
    if (!draft) return;
    const clean = sanitizeBiome(draft);
    setBusy(true); setMsg(null);
    const { error } = await supabase().from('biomes').update({
      name: clean.name, description: clean.description, palette: clean.palette, settings: clean.settings, assets: clean.assets,
      status: status ?? draft.status, updated_at: new Date().toISOString(),
    }).eq('slug', draft.slug);
    setBusy(false);
    if (error) { setMsg({ text: 'Não consegui salvar: ' + error.message }); return; }
    setDirty(false);
    const list = await load();
    const r = list?.find((x) => x.slug === draft.slug);
    if (r) setDraft(structuredClone(r));
    setMsg({ ok: true, text: status === 'published' ? (draft.slug === 'refugio' ? 'Publicado. O Refúgio do jogo já usa este bioma (recarregue o jogo).' : 'Publicado.') : status === 'draft' ? 'Voltou para rascunho.' : 'Salvo.' });
  }

  async function upload(files: File[]) {
    if (!draft) return;
    const glbs = files.filter((f) => /\.glb$/i.test(f.name));
    if (!glbs.length) { setMsg({ text: 'Envie modelos em .GLB.' }); return; }
    setBusy(true); setMsg(null);
    const added: BiomeAsset[] = [], heavy: string[] = [];
    try {
      for (const f of glbs) {
        const safe = f.name.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[^\w-]+/g, '_').slice(0, 40);
        const path = `biomes/${draft.slug}/${Date.now()}-${safe}.glb`;
        // o navegador não informa tipo para .glb; sem isso o bucket recusa
        const { error } = await supabase().storage.from('world-assets').upload(path, new Blob([f], { type: 'model/gltf-binary' }), { contentType: 'model/gltf-binary', upsert: false, cacheControl: '31536000' });
        if (error) throw new Error(`${f.name}: ${error.message}`);
        const url = supabase().storage.from('world-assets').getPublicUrl(path).data.publicUrl;
        const role = guessRole(f.name), def = BIOME_ROLES[role];
        added.push({ id: safe + '-' + Date.now().toString(36), name: f.name.replace(/\.glb$/i, ''), url, path, role, zone: def.zone, height: def.height, count: def.count, wind: def.wind });
        if (f.size > 3 * 1024 * 1024) heavy.push(`${f.name} (${(f.size / 1048576).toFixed(1)} MB)`);
      }
      edit({ assets: [...draft.assets, ...added] });
      setMsg({ ok: !heavy.length, text: `${added.length} modelo(s) adicionados. Ajuste papel, tamanho e quantidade e salve.` + (heavy.length ? ` Pesados para celular: ${heavy.join(', ')}. Me mande que eu otimizo (texturas 1024 + compressão).` : '') });
    } catch (e) { setMsg({ text: 'Falha no envio: ' + (e as Error).message }); } finally { setBusy(false); }
  }

  const preview = useMemo(() => (draft ? sanitizeBiome(draft) : null), [draft]);

  return (
    <div className="biome-studio">
      <aside className="biome-list">
        <form className="biome-new" onSubmit={(e) => { e.preventDefault(); void create(false); }}>
          <select value={newKind} onChange={(e) => setNewKind(e.target.value as BiomeKind)} aria-label="Tipo do novo bioma">
            <option value="world">Região do mundo</option>
            <option value="refuge">Refúgio</option>
          </select>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={newKind === 'world' ? 'Ex.: Planície Vulcânica' : 'Ex.: Refúgio da Mayuna'} maxLength={60} aria-label="Nome do novo bioma" />
          <button className="primary" disabled={busy || !newName.trim()}>+ Criar</button>
        </form>
        <ListSearch value={q} onChange={setQ} label="Buscar bioma" />
        {!rows && <p className="msg">Carregando…</p>}
        {([['refuge', 'Refúgios', 'O cenário em volta do altar. "refugio" é o padrão de todos; os outros a Fábrica dá a um Companion.'], ['world', 'Regiões do mundo', 'Pedaços do Companion World: cada uma vira várias regiões do mapa.']] as const).map(([kind, title, hint]) => (
          <div key={kind} className="biome-group">
            <h2>{title}</h2>
            <small className="hint">{hint}</small>
            <ul>
              {rows?.filter((r) => r.settings.kind === kind && matches(q, r.name, r.slug)).map((r) => (
                <li key={r.slug}>
                  <button className={sel === r.slug ? 'on' : ''} onClick={() => pick(r.slug)}>
                    <strong>{r.name}</strong>
                    <small>{r.slug} · {r.status === 'published' ? 'no jogo' : 'rascunho'} · {r.assets.length} modelo(s)</small>
                  </button>
                </li>
              ))}
            </ul>
            {rows && !rows.some((r) => r.settings.kind === kind) && <p className="empty">Nenhum ainda.</p>}
          </div>
        ))}
        {rows && !rows.some((r) => r.slug === 'refugio') && <button className="ghost" disabled={busy} onClick={() => void create(true)}>Criar o bioma do Refúgio (a partir do atual)</button>}
      </aside>

      {!draft ? (
        <section className="biome-empty"><p>Escolha um bioma ou crie um novo. O bioma <b>refugio</b>, quando publicado, vira o cenário do Refúgio no jogo.</p></section>
      ) : (
        <section className="biome-editor">
          <EditorHead name={draft.name} sub={(draft.settings.kind === 'refuge' ? 'Refúgio' : 'Região do mundo') + ' · ' + draft.slug + ' · ' + draft.assets.length + ' modelo(s)'} status={draft.status === 'published' ? 'published' : 'draft'} dirty={dirty} />
          <div className="biome-preview">
            <Suspense fallback={<div className="art-empty">Carregando prévia…</div>}>
              {preview && <BiomePreview biome={preview} daylight={daylight} seed={7} open={open || preview.settings.kind === 'world'} />}
            </Suspense>
            <div className="preview-tools">
              <label>Hora <input type="range" min={0} max={1} step={0.05} value={daylight} onChange={(e) => setDaylight(Number(e.target.value))} aria-label="Dia e noite" /></label>
              {draft.settings.kind === 'refuge' && <label><input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} /> passagem aberta</label>}
            </div>
          </div>

          <div className="biome-form">
            <div className="row-3">
              <label>Nome<input value={draft.name} onChange={(e) => edit({ name: e.target.value })} maxLength={60} /></label>
              <label>Tipo
                <select value={draft.settings.kind} onChange={(e) => { const kind = e.target.value as BiomeKind; edit({ settings: { ...draft.settings, kind, world: kind === 'world', cliffs: kind === 'refuge' ? draft.settings.cliffs : false } }); }}>
                  <option value="refuge">Refúgio</option>
                  <option value="world">Região do mundo</option>
                </select>
              </label>
              <label>Status<span className={'pill ' + draft.status}>{draft.status === 'published' ? 'Publicado' : 'Rascunho'}</span></label>
            </div>
            <label>Descrição<textarea rows={2} value={draft.description} onChange={(e) => edit({ description: e.target.value })} maxLength={300} /></label>

            <fieldset>
              <legend>Cores do chão e do céu</legend>
              <div className="swatches">
                {PALETTE_LABELS.map(([k, label]) => (
                  <label key={k} className="swatch"><input type="color" value={draft.palette[k]} onChange={(e) => edit({ palette: { ...draft.palette, [k]: e.target.value } })} />{label}</label>
                ))}
              </div>
              <button className="link" onClick={() => edit({ palette: { ...DEFAULT_PALETTE } })}>voltar às cores do Refúgio</button>
            </fieldset>

            <fieldset>
              <legend>Chão</legend>
              <label>Grama leve (preenchimento) <input type="range" min={0} max={2} step={0.1} value={draft.settings.grassBlades} onChange={(e) => edit({ settings: { ...draft.settings, grassBlades: Number(e.target.value) } })} /> <small>{Math.round(draft.settings.grassBlades * 100)}%</small></label>
              {draft.settings.kind === 'refuge' ? (
                <label><input type="checkbox" checked={draft.settings.cliffs} onChange={(e) => edit({ settings: { ...draft.settings, cliffs: e.target.checked } })} /> Muralha de pedras em volta</label>
              ) : (
                <>
                  <label>Relevo <input type="range" min={0} max={2} step={0.1} value={draft.settings.hills} onChange={(e) => edit({ settings: { ...draft.settings, hills: Number(e.target.value) } })} /> <small>{draft.settings.hills < 0.4 ? 'plano' : draft.settings.hills < 1.3 ? 'colinas' : 'morros'}</small></label>
                  <label>Névoa <input type="range" min={1} max={2} step={0.1} value={Math.max(1, draft.settings.fog)} onChange={(e) => edit({ settings: { ...draft.settings, fog: Number(e.target.value) } })} /> <small>{draft.settings.fog < 1.3 ? 'normal' : draft.settings.fog < 1.7 ? 'nebuloso' : 'densa'}</small></label>
                </>
              )}
              <label>No ar
                <select value={draft.settings.ambient} onChange={(e) => edit({ settings: { ...draft.settings, ambient: e.target.value as BiomeAmbient } })}>
                  {Object.entries(BIOME_AMBIENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
            </fieldset>

            {(draft.settings.kind === 'world' || draft.slug === 'refugio') && (
              <ResourceTable value={draft.settings.resources} onChange={(resources) => edit({ settings: { ...draft.settings, resources } })} />
            )}

            <fieldset>
              <legend>Modelos ({draft.assets.length})</legend>
              {!draft.assets.length && <p className="empty">Nenhum modelo. Envie os .GLB do bioma: árvores, pedras, gramas, plantas e um marco do lugar.</p>}
              <div className="asset-table">
                {draft.assets.map((a) => (
                  <div key={a.id} className="asset-row">
                    <input className="asset-name" value={a.name} onChange={(e) => editAsset(a.id, { name: e.target.value })} aria-label="Nome do modelo" />
                    <select value={a.role} onChange={(e) => { const role = e.target.value as BiomeAssetRole, d = BIOME_ROLES[role]; editAsset(a.id, { role, zone: d.zone, height: d.height, count: d.count, wind: d.wind }); }} aria-label="Papel">
                      {Object.entries(BIOME_ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <select value={a.zone} onChange={(e) => editAsset(a.id, { zone: e.target.value as BiomeZone })} aria-label="Zona">
                      {Object.entries(BIOME_ZONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <label title="Altura em metros (mín–máx)">Altura <input type="number" step={0.1} min={0.05} max={30} aria-label={"Altura mínima de " + a.name} value={a.height[0]} onChange={(e) => editAsset(a.id, { height: [Number(e.target.value), a.height[1]] })} />–<input type="number" step={0.1} min={0.05} max={30} aria-label={"Altura máxima de " + a.name} value={a.height[1]} onChange={(e) => editAsset(a.id, { height: [a.height[0], Number(e.target.value)] })} /> m</label>
                    <label title="Quantas cópias (no celular cai pela metade)">Qtd <input type="number" min={0} max={600} aria-label={"Quantidade de " + a.name} value={a.count} onChange={(e) => editAsset(a.id, { count: Number(e.target.value) })} /></label>
                    <label title="0 = parado, 0,35 = árvore, 1 = grama">Vento <input type="range" min={0} max={1.5} step={0.05} value={a.wind} onChange={(e) => editAsset(a.id, { wind: Number(e.target.value) })} /></label>
                    <button className={'link' + (a.look ? ' tinted' : '')} onClick={() => setLookOpen(lookOpen === a.id ? null : a.id)} aria-expanded={lookOpen === a.id}>
                      <i className="look-dot" style={{ background: a.look ? a.look.tint : 'transparent' }} />aparência
                    </button>
                    <button className="link" onClick={() => edit({ assets: draft.assets.filter((x) => x.id !== a.id) })}>tirar</button>
                    {lookOpen === a.id && <LookEditor look={a.look} onChange={(look) => editAsset(a.id, { look })} />}
                  </div>
                ))}
              </div>
              <label className="upload">
                <input type="file" accept=".glb,model/gltf-binary" multiple disabled={busy} onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; if (fs.length) void upload(fs); }} />
                + Modelos .GLB (pode escolher vários; o papel vem do nome: árvore, pedra, grama, flor, ruína…)
              </label>
            </fieldset>

            <StudioActions name={draft.name} status={draft.status === 'published' ? 'published' : 'draft'} dirty={dirty} busy={busy} msg={msg}
              note={<small className="hint">A prévia já mostra o que não foi salvo; o jogo, só depois de salvar.</small>}
              onSave={() => void save()} onPublish={() => void save('published')} onUnpublish={() => void save('draft')} />
          </div>
        </section>
      )}
    </div>
  );
}

/** em média, quantos recursos numa área de 100 m × 100 m (a densidade é por chunk de 16 m) */
const perHectare = (d: number) => d * (10_000 / (CHUNK * CHUNK));

/**
 * Recursos de coleta da região (Ecos da Terra): o que nasce, quanto, quando e onde. Sem tabela própria a região usa a
 * padrão (o básico em toda parte, as fontes superiores raras).
 */
function ResourceTable({ value, onChange }: { value: BiomeResource[] | undefined; onChange: (v: BiomeResource[] | undefined) => void }) {
  const rows = value ?? DEFAULT_BIOME_RESOURCES;
  const custom = !!value;
  const set = (i: number, patch: Partial<BiomeResource>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const free = Object.keys(NODE_KINDS).filter((k) => !rows.some((r) => r.kind === k));
  return (
    <fieldset>
      <legend>Recursos de coleta ({rows.length})</legend>
      <p className="hint">
        {custom ? 'Tabela própria desta região.' : 'Usando a tabela padrão (o básico em toda parte, as fontes superiores raras). Mexer em qualquer linha cria uma tabela própria.'}
        {' '}Os recursos nascem espalhados pela região, longe das trilhas e dos marcos. Densidade = quantos por chunk de {CHUNK} m.
      </p>
      <div className="asset-table">
        {rows.map((r, i) => {
          const k = NODE_KINDS[r.kind];
          return (
            <div key={r.kind} className="asset-row">
              <select className="asset-name" value={r.kind} onChange={(e) => set(i, { kind: e.target.value })} aria-label="Recurso">
                {[r.kind, ...free].map((id) => <option key={id} value={id}>{CATEGORIES[NODE_KINDS[id].category].icon} {NODE_KINDS[id].name}{NODE_KINDS[id].source ? ' (superior)' : ''}</option>)}
              </select>
              <label title={`Por chunk de ${CHUNK} m. Hoje: ~${perHectare(r.density).toFixed(1)} em 100 × 100 m`}>Densidade <input type="number" step={0.01} min={0} max={RESOURCE_MAX_DENSITY} aria-label={'Densidade de ' + k.name} value={r.density} onChange={(e) => set(i, { density: Math.max(0, Math.min(RESOURCE_MAX_DENSITY, Number(e.target.value) || 0)) })} /> <small>~{perHectare(r.density).toFixed(1)}/ha</small></label>
              <select value={r.time} onChange={(e) => set(i, { time: e.target.value as ResourceTime })} aria-label={'Horário de ' + k.name}>
                {Object.entries(RESOURCE_TIMES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <select value={r.terrain} onChange={(e) => set(i, { terrain: e.target.value as ResourceTerrain })} aria-label={'Terreno de ' + k.name}>
                {Object.entries(RESOURCE_TERRAINS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <span className="res-weather" role="group" aria-label={'Clima em que ' + k.name + ' aparece'}>
                {WEATHER_KINDS.map((w) => {
                  const on = r.weather.includes(w);
                  return <button key={w} type="button" className={'chip' + (on ? ' on' : '')} aria-pressed={on} title={WEATHERS[w].label} onClick={() => set(i, { weather: on ? r.weather.filter((x) => x !== w) : [...r.weather, w] })}>{WEATHERS[w].icon}</button>;
                })}
                <small>{r.weather.length ? '' : 'qualquer clima'}</small>
              </span>
              <input value={r.unlock ?? ''} list="res-unlocks" onChange={(e) => set(i, { unlock: e.target.value.trim() || undefined })} placeholder="para todos" maxLength={60} aria-label={'Só para quem tem o desbloqueio (' + k.name + ')'} title="Só aparece para quem ganhou este desbloqueio numa missão" style={{ width: 170 }} />
              <button className="link" onClick={() => onChange(rows.filter((_, k2) => k2 !== i))}>tirar</button>
            </div>
          );
        })}
      </div>
      <datalist id="res-unlocks">{Object.entries(UNLOCKS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</datalist>
      <small className="hint">Desbloqueio: o recurso só aparece para quem ganhou esse desbloqueio como prêmio de missão (Admin → Missões). Vazio = para todos.</small>
      <div className="row">
        {free.length > 0 && <button className="ghost" onClick={() => onChange([...rows, { kind: free[0], density: 0.1, time: 'sempre', weather: [], terrain: 'qualquer' }])}>+ Recurso</button>}
        {custom && <button className="link" onClick={() => onChange(undefined)}>voltar à tabela padrão</button>}
      </div>
    </fieldset>
  );
}

/** Controles de aparência de um modelo: predefinições + ajuste fino. A prévia muda na hora. */
export function LookEditor({ look, onChange }: { look?: ModelLook; onChange: (l: ModelLook | undefined) => void }) {
  const l = look ?? LOOK_ORIGINAL;
  const set = (patch: Partial<ModelLook>) => onChange({ ...l, ...patch });
  const R = (k: 'hue' | 'sat' | 'light' | 'contrast' | 'tintAmount' | 'glow', label: string, min: number, max: number, step: number, fmt: (v: number) => string) => (
    <label key={k}>{label}<input type="range" min={min} max={max} step={step} value={l[k]} onChange={(e) => set({ [k]: Number(e.target.value) })} /><small>{fmt(l[k])}</small></label>
  );
  const pct = (v: number) => Math.round(v * 100) + '%';
  return (
    <div className="look-editor">
      <div className="look-presets">
        {LOOK_PRESETS.map((p) => (
          <button key={p.key} type="button" className="chip" onClick={() => onChange(p.key === 'original' ? undefined : { ...p.look })} title={p.label}>
            <i style={{ background: p.key === 'original' ? 'linear-gradient(135deg,#8fcf60,#b3a8d2)' : p.look.tint }} />{p.label}
          </button>
        ))}
      </div>
      <div className="look-sliders">
        {R('hue', 'Matiz', -180, 180, 1, (v) => (v > 0 ? '+' : '') + v + '°')}
        {R('sat', 'Saturação', 0, 2, 0.05, pct)}
        {R('light', 'Luz', 0.3, 2, 0.05, pct)}
        {R('contrast', 'Contraste', 0.5, 1.6, 0.05, pct)}
        <label>Tinta<input type="color" value={l.tint} onChange={(e) => set({ tint: e.target.value, tintAmount: l.tintAmount || 0.35 })} /><small>{l.tint}</small></label>
        {R('tintAmount', 'Força da tinta', 0, 1, 0.05, pct)}
        {R('glow', 'Brilho próprio', 0, 2, 0.05, pct)}
      </div>
    </div>
  );
}
