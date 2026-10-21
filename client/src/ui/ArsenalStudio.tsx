/**
 * Arsenal (painel do ADM): armas e equipamentos. Cada item tem tipo (escolhe o espaço, a animação e o golpe),
 * raridade, essência, atributos leves, modelo (gerado por código com cores, ou .GLB), aparência, a pegada (ajuste
 * na mão/osso — o rig é o mesmo para todos, então vale para todo Companion) e a receita da Forja (só Taurinas forjam).
 */
import { lazy, Suspense, useMemo, useState } from 'react';
import { DEFAULT_ITEMS, ITEM_TYPES, RARITIES, ELEMENTS, SLOTS_EQ, DEFAULT_GRIP, sanitizeItem, biomeSlug, basicAttack, type ItemDef, type ItemType, type Rarity, type Element, type EquipSlot } from '@rules';
import { useCatalog, uploadWorldAsset, safeName } from './catalog';
import { LookEditor } from './BiomeStudio';

const ItemPreview = lazy(() => import('../scene/ItemPreview').then((m) => ({ default: m.ItemPreview })));
const ATTRS = ['vida', 'energia', 'poder', 'defesa', 'agilidade', 'sintonia'] as const;
const ESS = Object.keys(ELEMENTS) as Element[];

export function ArsenalStudio() {
  const cat = useCatalog<ItemDef>('items', sanitizeItem);
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<ItemDef | null>(null);
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [newName, setNewName] = useState('');
  const [charge, setCharge] = useState(0);
  const [lookOpen, setLookOpen] = useState(false);

  const run = async (f: () => Promise<unknown>, ok: string) => { setBusy(true); setMsg(null); try { await f(); setMsg({ ok: true, text: ok }); } catch (e) { setMsg({ text: (e as Error).message }); } finally { setBusy(false); } };
  const pick = (slug: string) => {
    if (dirty && !window.confirm('Há mudanças não salvas. Trocar mesmo assim?')) return;
    const r = cat.rows?.find((x) => x.slug === slug);
    setSel(slug); setDraft(r ? structuredClone(r.data) : null); setStatus(r?.status ?? 'draft'); setDirty(false); setMsg(null);
  };
  const edit = (p: Partial<ItemDef>) => { setDraft((d) => (d ? { ...d, ...p } : d)); setDirty(true); };
  function create() {
    const slug = biomeSlug(newName);
    if (!newName.trim()) return;
    if (cat.rows?.some((r) => r.slug === slug)) { setMsg({ text: `Já existe "${slug}".` }); return; }
    setSel(slug); setDraft(sanitizeItem({ ...DEFAULT_ITEMS[0], slug, name: newName.trim(), description: '' })!); setStatus('draft'); setDirty(true); setNewName('');
  }
  async function uploadModel(f: File) {
    if (!draft) return;
    await run(async () => { const up = await uploadWorldAsset(`items/${draft.slug}/${Date.now()}-${safeName(f.name)}.glb`, f); edit({ model: up }); }, 'Modelo enviado. Ajuste a pegada e salve.');
  }
  const clean = useMemo(() => (draft ? sanitizeItem(draft) : null), [draft]);
  const bySlot = (slot: EquipSlot) => (cat.rows ?? []).filter((r) => ITEM_TYPES[r.data.type].slot === slot);
  const atk = clean && ITEM_TYPES[clean.type].weapon ? basicAttack(clean) : null;
  const setGrip = (k: 'pos' | 'rot', i: number, v: number) => { const g = structuredClone(draft!.grip); g[k][i] = v; edit({ grip: g }); };

  return (
    <div className="biome-studio">
      <aside className="biome-list">
        <h2>Arsenal</h2>
        <small className="hint">Itens são raros e só nascem na Forja — e só Companions da classe Taurina forjam. Cada item tem receita com ingredientes (drops dos monstros).</small>
        {cat.error && <p className="msg err">{cat.error}</p>}
        {cat.rows && !cat.rows.length && <button className="primary" disabled={busy} onClick={() => void run(() => cat.saveMany(DEFAULT_ITEMS, 'published'), `${DEFAULT_ITEMS.length} itens carregados.`)}>Carregar o arsenal inicial ({DEFAULT_ITEMS.length} itens)</button>}
        {(Object.keys(SLOTS_EQ) as EquipSlot[]).map((slot) => bySlot(slot).length > 0 && (
          <div key={slot} className="biome-group">
            <h3>{SLOTS_EQ[slot].label}</h3>
            <ul>
              {bySlot(slot).map((r) => (
                <li key={r.slug}><button className={sel === r.slug ? 'on' : ''} onClick={() => pick(r.slug)}>
                  <strong><i className="look-dot" style={{ background: RARITIES[r.data.rarity].color }} />{r.name}</strong>
                  <small>{ITEM_TYPES[r.data.type].label} · {RARITIES[r.data.rarity].label}{r.data.model ? ' · .GLB' : ''}{r.status === 'draft' ? ' · rascunho' : ''}</small>
                </button></li>
              ))}
            </ul>
          </div>
        ))}
        <form className="biome-new" onSubmit={(e) => { e.preventDefault(); create(); }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Novo item" maxLength={40} aria-label="Nome do novo item" />
          <button className="primary" disabled={!newName.trim()}>Criar</button>
        </form>
      </aside>

      {!draft || !clean ? <section className="biome-empty"><p>Escolha um item ou crie um novo.</p></section> : (
        <section className="biome-editor">
          <div className="biome-preview">
            <Suspense fallback={<div className="art-empty">Carregando prévia…</div>}><ItemPreview item={clean} charge={charge} /></Suspense>
            {clean.type === 'arco' && <div className="preview-tools"><label>Carga do arco <input type="range" min={0} max={1} step={0.05} value={charge} onChange={(e) => setCharge(Number(e.target.value))} /></label></div>}
          </div>
          <div className="biome-form">
            <div className="row-3">
              <label>Nome<input value={draft.name} onChange={(e) => edit({ name: e.target.value })} maxLength={40} /></label>
              <label>Tipo<select value={draft.type} onChange={(e) => edit({ type: e.target.value as ItemType, grip: DEFAULT_GRIP })}>{(Object.keys(ITEM_TYPES) as ItemType[]).map((k) => <option key={k} value={k}>{ITEM_TYPES[k].label} ({SLOTS_EQ[ITEM_TYPES[k].slot].label})</option>)}</select></label>
              <label>Status<span className={'pill ' + status}>{status === 'published' ? 'Publicado' : 'Rascunho'}</span></label>
            </div>
            <label>Descrição<textarea rows={2} value={draft.description} onChange={(e) => edit({ description: e.target.value })} maxLength={200} /></label>
            {atk && <small className="hint">Golpe: {atk.label} · alcance {atk.range} m · {atk.cadence} golpes/s · dano ×{atk.power} · animação {atk.anim}{atk.twoHanded ? ' · duas mãos' : ''}{atk.ranged === 'charged' ? ' · tiro carregado' : ''}</small>}

            <fieldset>
              <legend>Raridade, essência e atributos</legend>
              <div className="grid-form">
                <label>Raridade<select value={draft.rarity} onChange={(e) => edit({ rarity: e.target.value as Rarity })}>{(Object.keys(RARITIES) as Rarity[]).map((k) => <option key={k} value={k}>{RARITIES[k].label} (×{RARITIES[k].statMul})</option>)}</select></label>
                <label>Essência<select value={draft.essence ?? ''} onChange={(e) => edit({ essence: (e.target.value || null) as Element | null })}><option value="">Nenhuma</option>{ESS.map((e) => <option key={e} value={e}>{ELEMENTS[e].label}</option>)}</select></label>
                {ATTRS.map((k) => <label key={k}>{k[0].toUpperCase() + k.slice(1)} (%)<input type="number" min={-20} max={40} value={draft.stats[k] ?? 0} onChange={(e) => edit({ stats: { ...draft.stats, [k]: Number(e.target.value) } })} /></label>)}
              </div>
              <small className="hint">Atributos leves: o valor é multiplicado pela raridade.</small>
            </fieldset>

            <fieldset>
              <legend>Modelo</legend>
              {!draft.model && (
                <div className="grid-form">
                  <label className="swatch">Cor principal<input type="color" value={draft.proc.primary} onChange={(e) => edit({ proc: { ...draft.proc, primary: e.target.value } })} /></label>
                  <label className="swatch">Cor secundária<input type="color" value={draft.proc.secondary} onChange={(e) => edit({ proc: { ...draft.proc, secondary: e.target.value } })} /></label>
                  <label className="swatch">Metal<input type="color" value={draft.proc.metal} onChange={(e) => edit({ proc: { ...draft.proc, metal: e.target.value } })} /></label>
                  <label><input type="checkbox" checked={draft.proc.gem} onChange={(e) => edit({ proc: { ...draft.proc, gem: e.target.checked } })} /> Gema (cor da essência/raridade)</label>
                  <label>Variação<select value={draft.proc.variant} onChange={(e) => edit({ proc: { ...draft.proc, variant: Number(e.target.value) } })}><option value={0}>1</option><option value={1}>2</option><option value={2}>3</option></select></label>
                </div>
              )}
              <div className="row">
                <label className="upload"><input type="file" accept=".glb,model/gltf-binary" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void uploadModel(f); }} />{draft.model ? 'Trocar .GLB' : 'Usar um .GLB (Tripo, sem rig)'}</label>
                {draft.model && <button className="link" onClick={() => edit({ model: undefined })}>voltar ao modelo gerado</button>}
                {draft.model && <button className={'link' + (draft.look ? ' tinted' : '')} onClick={() => setLookOpen(!lookOpen)}>aparência</button>}
              </div>
              {draft.model && lookOpen && <LookEditor look={draft.look} onChange={(look) => edit({ look })} />}
            </fieldset>

            <fieldset>
              <legend>Pegada (ajuste na mão / no osso)</legend>
              <div className="look-sliders">
                {(['x', 'y', 'z'] as const).map((a, i) => <label key={'p' + a}>Posição {a}<input type="range" min={-0.3} max={0.3} step={0.01} value={draft.grip.pos[i]} onChange={(e) => setGrip('pos', i, Number(e.target.value))} /><small>{draft.grip.pos[i].toFixed(2)}</small></label>)}
                {(['x', 'y', 'z'] as const).map((a, i) => <label key={'r' + a}>Giro {a}<input type="range" min={-3.14} max={3.14} step={0.05} value={draft.grip.rot[i]} onChange={(e) => setGrip('rot', i, Number(e.target.value))} /><small>{Math.round((draft.grip.rot[i] * 180) / Math.PI)}°</small></label>)}
                <label>Tamanho<input type="range" min={0.3} max={2.5} step={0.05} value={draft.grip.scale} onChange={(e) => edit({ grip: { ...draft.grip, scale: Number(e.target.value) } })} /><small>{draft.grip.scale.toFixed(2)}×</small></label>
              </div>
              <button className="link" onClick={() => edit({ grip: DEFAULT_GRIP })}>zerar pegada</button>
              <small className="hint">Como todo Companion usa o mesmo rig humanoide, a pegada vale para todos. Quando o primeiro humanoide com animações chegar, confira aqui segurando a arma.</small>
            </fieldset>

            <fieldset>
              <legend>Receita da Forja (só Taurinas)</legend>
              {draft.recipe.ingredients.map((g, i) => (
                <div key={i} className="list-row">
                  <input className="grow" value={g.item} onChange={(e) => edit({ recipe: { ...draft.recipe, ingredients: draft.recipe.ingredients.map((x, j) => (j === i ? { ...x, item: e.target.value } : x)) } })} placeholder="Ingrediente (drop de monstro)" maxLength={40} />
                  <label>qtd <input type="number" min={1} max={99} value={g.qty} onChange={(e) => edit({ recipe: { ...draft.recipe, ingredients: draft.recipe.ingredients.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)) } })} /></label>
                  <button className="link" onClick={() => edit({ recipe: { ...draft.recipe, ingredients: draft.recipe.ingredients.filter((_, j) => j !== i) } })}>tirar</button>
                </div>
              ))}
              <div className="row">
                <button className="link" disabled={draft.recipe.ingredients.length >= 8} onClick={() => edit({ recipe: { ...draft.recipe, ingredients: [...draft.recipe.ingredients, { item: '', qty: 1 }] } })}>+ ingrediente</button>
                <label>Vínculo mínimo <input type="number" min={1} max={20} value={draft.recipe.minBond} onChange={(e) => edit({ recipe: { ...draft.recipe, minBond: Number(e.target.value) } })} style={{ width: 60 }} /></label>
                <label>Tempo na forja (s) <input type="number" min={0} max={3600} value={draft.recipe.seconds} onChange={(e) => edit({ recipe: { ...draft.recipe, seconds: Number(e.target.value) } })} style={{ width: 70 }} /></label>
              </div>
              <label><input type="checkbox" checked={draft.starter} onChange={(e) => edit({ starter: e.target.checked })} /> Dar a todos os Companions (só para eventos)</label>
            </fieldset>

            {msg && <p className={'msg' + (msg.ok ? ' ok' : ' err')}>{msg.text}</p>}
            <div className="row">
              <button className="primary" disabled={busy || !dirty} onClick={() => void run(async () => { await cat.save(draft, status); setDirty(false); }, 'Salvo.')}>Salvar</button>
              {status === 'draft'
                ? <button className="secondary" disabled={busy} onClick={() => void run(async () => { await cat.save(draft, 'published'); setStatus('published'); setDirty(false); }, 'Publicado.')}>Salvar e publicar</button>
                : <button className="ghost" disabled={busy} onClick={() => void run(async () => { await cat.save(draft, 'draft'); setStatus('draft'); setDirty(false); }, 'Tirado do jogo.')}>Tirar do jogo</button>}
              <button className="link" disabled={busy} onClick={() => { if (window.confirm(`Apagar "${draft.name}"?`)) void run(async () => { await cat.remove(draft.slug); setSel(null); setDraft(null); setDirty(false); }, 'Apagado.'); }}>apagar</button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
