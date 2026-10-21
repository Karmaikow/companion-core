/**
 * Estúdio de Biomas (painel do ADM): cores do chão, pedras e céu + modelos .GLB com papel, zona, tamanho,
 * quantidade e vento. A prévia 3D usa o mesmo código do jogo. O bioma "refugio", publicado, é o que o Refúgio usa.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  BIOME_ROLES, BIOME_ZONES, DEFAULT_PALETTE, REFUGE_BIOME, biomeSlug, sanitizeBiome,
  type BiomeAsset, type BiomeAssetRole, type BiomeConfig, type BiomePalette, type BiomeZone,
} from '@rules';
import { supabase } from '../backend/online';

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
  const [daylight, setDaylight] = useState(1);
  const [open, setOpen] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase().from('biomes').select('*').order('updated_at', { ascending: false });
    if (error) { setMsg({ text: 'Não consegui ler os biomas: ' + error.message }); return; }
    const list = (data ?? []).map(toRow);
    setRows(list);
    return list;
  }, []);
  useEffect(() => { void load(); }, [load]);

  function pick(slug: string) {
    if (dirty && !window.confirm('Há mudanças não salvas neste bioma. Trocar mesmo assim?')) return;
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
    const base = fromRefuge ? REFUGE_BIOME : { ...REFUGE_BIOME, slug, name, description: '', assets: [] };
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
        const { error } = await supabase().storage.from('world-assets').upload(path, new Blob([f], { type: 'model/gltf-binary' }), { contentType: 'model/gltf-binary', upsert: false });
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
        <h2>Biomas</h2>
        {!rows && <p className="msg">Carregando…</p>}
        {rows && !rows.length && <p className="empty">Nenhum bioma ainda.</p>}
        <ul>
          {rows?.map((r) => (
            <li key={r.slug}>
              <button className={sel === r.slug ? 'on' : ''} onClick={() => pick(r.slug)}>
                <strong>{r.name}</strong>
                <small>{r.slug} · {r.status === 'published' ? 'publicado' : 'rascunho'} · {r.assets.length} modelo(s)</small>
              </button>
            </li>
          ))}
        </ul>
        {rows && !rows.some((r) => r.slug === 'refugio') && <button className="ghost" disabled={busy} onClick={() => void create(true)}>Criar o bioma do Refúgio (a partir do atual)</button>}
        <form className="biome-new" onSubmit={(e) => { e.preventDefault(); void create(false); }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome do novo bioma" maxLength={60} aria-label="Nome do novo bioma" />
          <button className="primary" disabled={busy || !newName.trim()}>Criar</button>
        </form>
      </aside>

      {!draft ? (
        <section className="biome-empty"><p>Escolha um bioma ou crie um novo. O bioma <b>refugio</b>, quando publicado, vira o cenário do Refúgio no jogo.</p></section>
      ) : (
        <section className="biome-editor">
          <div className="biome-preview">
            <Suspense fallback={<div className="art-empty">Carregando prévia…</div>}>
              {preview && <BiomePreview biome={preview} daylight={daylight} seed={7} open={open} />}
            </Suspense>
            <div className="preview-tools">
              <label>Hora <input type="range" min={0} max={1} step={0.05} value={daylight} onChange={(e) => setDaylight(Number(e.target.value))} aria-label="Dia e noite" /></label>
              <label><input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} /> passagem aberta</label>
            </div>
          </div>

          <div className="biome-form">
            <div className="row-2">
              <label>Nome<input value={draft.name} onChange={(e) => edit({ name: e.target.value })} maxLength={60} /></label>
              <label>Status<span className={'pill ' + draft.status}>{draft.status === 'published' ? 'Publicado' : 'Rascunho'}</span></label>
            </div>
            <label>Descrição<textarea rows={2} value={draft.description} onChange={(e) => edit({ description: e.target.value })} maxLength={300} /></label>

            <fieldset>
              <legend>Cores</legend>
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
              <label><input type="checkbox" checked={draft.settings.cliffs} onChange={(e) => edit({ settings: { ...draft.settings, cliffs: e.target.checked } })} /> Muralha de pedras em volta (só no Refúgio)</label>
              <label><input type="checkbox" checked={draft.settings.world} onChange={(e) => edit({ settings: { ...draft.settings, world: e.target.checked } })} /> Aparece como região do Companion World <small>(desligue para um Refúgio feito só para um Companion)</small></label>
              <label>Relevo no mundo <input type="range" min={0} max={2} step={0.1} value={draft.settings.hills} onChange={(e) => edit({ settings: { ...draft.settings, hills: Number(e.target.value) } })} /> <small>{draft.settings.hills < 0.4 ? 'plano' : draft.settings.hills < 1.3 ? 'colinas' : 'morros'}</small></label>
            </fieldset>

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
                    <label title="Altura em metros (mín–máx)">Altura <input type="number" step={0.1} min={0.05} max={30} value={a.height[0]} onChange={(e) => editAsset(a.id, { height: [Number(e.target.value), a.height[1]] })} />–<input type="number" step={0.1} min={0.05} max={30} value={a.height[1]} onChange={(e) => editAsset(a.id, { height: [a.height[0], Number(e.target.value)] })} /> m</label>
                    <label title="Quantas cópias (no celular cai pela metade)">Qtd <input type="number" min={0} max={600} value={a.count} onChange={(e) => editAsset(a.id, { count: Number(e.target.value) })} /></label>
                    <label title="0 = parado, 0,35 = árvore, 1 = grama">Vento <input type="range" min={0} max={1.5} step={0.05} value={a.wind} onChange={(e) => editAsset(a.id, { wind: Number(e.target.value) })} /></label>
                    <button className="link" onClick={() => edit({ assets: draft.assets.filter((x) => x.id !== a.id) })}>tirar</button>
                  </div>
                ))}
              </div>
              <label className="upload">
                <input type="file" accept=".glb,model/gltf-binary" multiple disabled={busy} onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; if (fs.length) void upload(fs); }} />
                + Modelos .GLB (pode escolher vários; o papel vem do nome: árvore, pedra, grama, flor, ruína…)
              </label>
            </fieldset>

            {msg && <p className={'msg' + (msg.ok ? ' ok' : ' err')}>{msg.text}</p>}
            <div className="row">
              <button className="primary" disabled={busy || !dirty} onClick={() => void save()}>Salvar</button>
              {draft.status === 'draft'
                ? <button className="secondary" disabled={busy} onClick={() => void save('published')}>Salvar e publicar</button>
                : <button className="ghost" disabled={busy} onClick={() => void save('draft')}>Tirar do jogo (rascunho)</button>}
              {dirty && <small className="msg">Mudanças não salvas: a prévia já mostra, o jogo ainda não.</small>}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
