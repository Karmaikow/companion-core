/**
 * Arsenal (painel do ADM): todos os itens do jogo, em quatro categorias — Materiais (coleta e drops), Diversos (itens
 * normais), Equipamentos e Armas. Cada item tem tipo (escolhe a categoria, o espaço, a animação e o golpe), peso,
 * raridade, elemento (peças do mesmo elemento formam conjuntos), atributos leves, modelo (gerado por código com cores,
 * ou .GLB), aparência; o que se veste tem a pegada (ajuste na mão/osso) e a receita da Forja (só Taurinas forjam).
 */
import { lazy, Suspense, useMemo, useState } from 'react';
import { TIERS, TIER_KEYS, tierOf, DEFAULT_ITEMS, ITEM_TYPES, ITEM_CATEGORIES, ELEMENT_SETS, RARITIES, ELEMENTS, SLOTS_EQ, DEFAULT_GRIP, sanitizeItem, biomeSlug, basicAttack, isWearable, slotsFor, type ItemDef, type ItemType, type ItemCategory, type Rarity, type Element } from '@rules';
import { supabase } from '../backend/online';
import { boneFor } from '../scene/Equipment';
import { useCatalog, uploadWorldAsset, safeName } from './catalog';
import { LookEditor } from './BiomeStudio';
import { EditorHead, ListSearch, StudioActions, ask, matches, useAdminDirty } from './adminKit';

import { useCompanionModels } from './companionModels';
const ItemPreview = lazy(() => import('../scene/ItemPreview').then((m) => ({ default: m.ItemPreview })));
const ATTRS = ['vida', 'energia', 'poder', 'defesa', 'agilidade', 'sintonia'] as const;
const ESS = Object.keys(ELEMENTS) as Element[];
const CATS: ItemCategory[] = ['arma', 'equipamento', 'material', 'diversos'];
const FIRST_TYPE: Record<ItemCategory, ItemType> = { arma: 'espada', equipamento: 'armadura', material: 'madeira', diversos: 'outro' };
const typesOf = (c: ItemCategory) => (Object.keys(ITEM_TYPES) as ItemType[]).filter((t) => ITEM_TYPES[t].category === c);

export function ArsenalStudio() {
  const cat = useCatalog<ItemDef>('items', sanitizeItem);
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<ItemDef | null>(null);
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [newName, setNewName] = useState('');
  const [newCat, setNewCat] = useState<ItemCategory>('arma');
  const [charge, setCharge] = useState(0);
  const [lookOpen, setLookOpen] = useState(false);
  const models = useCompanionModels();
  const [trainer, setTrainer] = useState('');
  const trainerModel = models?.find((m) => m.companionId === trainer) ?? null;
  const [swing, setSwing] = useState(true);
  const [socket, setSocket] = useState(false);
  const [q, setQ] = useState('');
  useAdminDirty(dirty);

  const run = async (f: () => Promise<unknown>, ok: string) => { setBusy(true); setMsg(null); try { await f(); setMsg({ ok: true, text: ok }); } catch (e) { setMsg({ text: (e as Error).message }); } finally { setBusy(false); } };
  const pick = async (slug: string) => {
    if (dirty && !(await ask({ title: 'Trocar sem salvar?', body: 'Há mudanças não salvas neste item. Se trocar agora, elas se perdem.', confirm: 'Trocar e descartar', cancel: 'Continuar editando', danger: true }))) return;
    const r = cat.rows?.find((x) => x.slug === slug);
    setSel(slug); setDraft(r ? structuredClone(r.data) : null); setStatus(r?.status ?? 'draft'); setDirty(false); setMsg(null);
  };
  const edit = (p: Partial<ItemDef>) => { setDraft((d) => (d ? { ...d, ...p } : d)); setDirty(true); };
  function create() {
    const slug = biomeSlug(newName);
    if (!newName.trim()) return;
    if (cat.rows?.some((r) => r.slug === slug)) { setMsg({ text: `Já existe "${slug}".` }); return; }
    const type = FIRST_TYPE[newCat];
    const base = DEFAULT_ITEMS.find((i) => i.type === type) ?? DEFAULT_ITEMS[0];
    setSel(slug); setDraft(sanitizeItem({ ...base, slug, name: newName.trim(), description: '', type, weight: ITEM_TYPES[type].weight, stats: {}, essence: null, model: undefined, gripByModel: undefined, recipe: isWearable(type) ? base.recipe : { ingredients: [], minBond: 1, seconds: 0 } })!); setStatus('draft'); setDirty(true); setNewName('');
  }
  async function uploadModel(f: File) {
    if (!draft) return;
    await run(async () => { const up = await uploadWorldAsset(`items/${draft.slug}/${Date.now()}-${safeName(f.name)}.glb`, f); edit({ model: up }); }, 'Modelo enviado. Ajuste a pegada e salve.');
  }
  const clean = useMemo(() => (draft ? sanitizeItem(draft) : null), [draft]);
  const found = (cat.rows ?? []).filter((r) => matches(q, r.name, r.slug, ITEM_TYPES[r.data.type].label, RARITIES[r.data.rarity].label));
  const byCat = (c: ItemCategory) => found.filter((r) => ITEM_TYPES[r.data.type].category === c);
  const missing = DEFAULT_ITEMS.filter((d) => cat.rows && !cat.rows.some((r) => r.slug === d.slug));
  const wear = clean ? isWearable(clean.type) : false;
  const onBone = clean ? wear && boneFor(clean) !== 'nenhum' : false;
  // ADM testa: põe o item publicado na própria bolsa (vai para o Inventário do jogo)
  async function grant() {
    if (!draft) return;
    const { data, error } = await supabase().functions.invoke('refuge', { body: { action: 'inventory.grant', slug: draft.slug, qty: 1 } });
    if (error) { let m = 'Não deu.'; try { const b = await (error as { context?: Response }).context?.json(); if (b?.error) m = b.error; } catch { /* mantém */ } throw new Error(m); }
    return data;
  }
  const atk = clean && ITEM_TYPES[clean.type].weapon ? basicAttack(clean) : null;
  // pegada: com um modelo escolhido no campo de treino, edita a pegada só daquele modelo (o padrão fica para os outros)
  const grip = draft ? (trainer && draft.gripByModel?.[trainer]) || draft.grip : DEFAULT_GRIP;
  const ownGrip = !!(trainer && draft?.gripByModel?.[trainer]);
  const putGrip = (g: ItemDef['grip']) => { if (!draft) return; if (trainer) edit({ gripByModel: { ...(draft.gripByModel ?? {}), [trainer]: g } }); else edit({ grip: g }); };
  const setGrip = (k: 'pos' | 'rot', i: number, v: number) => { const g = structuredClone(grip); g[k][i] = v; putGrip(g); };
  // .GLB já enviados para o mesmo tipo de arma (em outros itens): reaproveita sem enviar de novo
  const library = useMemo(() => {
    if (!draft) return [] as { url: string; path?: string; from: string }[];
    const seen = new Set<string>(), out: { url: string; path?: string; from: string }[] = [];
    for (const r of cat.rows ?? []) if (r.data.type === draft.type && r.data.model && !seen.has(r.data.model.url)) { seen.add(r.data.model.url); out.push({ ...r.data.model, from: r.name }); }
    return out;
  }, [cat.rows, draft?.type]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="biome-studio">
      <aside className="biome-list">
        <div className="list-head">
          <h2>Arsenal <small>{cat.rows?.length ?? 0}</small></h2>
        </div>
        <form className="biome-new" onSubmit={(e) => { e.preventDefault(); create(); }}>
          <select value={newCat} onChange={(e) => setNewCat(e.target.value as ItemCategory)} aria-label="Categoria do novo item">{CATS.map((c) => <option key={c} value={c}>{ITEM_CATEGORIES[c].label}</option>)}</select>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome do novo item" maxLength={40} aria-label="Nome do novo item" />
          <button className="primary" disabled={!newName.trim()}>+ Criar</button>
        </form>
        <ListSearch value={q} onChange={setQ} label="Buscar item" count={found.length} />
        {cat.error && <p className="msg err">{cat.error}</p>}
        {cat.rows && !cat.rows.length && <button className="primary" disabled={busy} onClick={() => void run(() => cat.saveMany(DEFAULT_ITEMS, 'published'), `${DEFAULT_ITEMS.length} itens carregados.`)}>Carregar o arsenal inicial ({DEFAULT_ITEMS.length} itens)</button>}
        {q.trim() && !found.length && <p className="empty">Nenhum item com “{q.trim()}”.</p>}
        {CATS.map((c) => byCat(c).length > 0 && (
          <div key={c} className="biome-group">
            <h3>{ITEM_CATEGORIES[c].label}</h3>
            <ul>
              {byCat(c).map((r) => (
                <li key={r.slug}><button className={sel === r.slug ? 'on' : ''} onClick={() => pick(r.slug)}>
                  <strong><i className="look-dot" style={{ background: RARITIES[r.data.rarity].color }} />{r.name}</strong>
                  <small>{ITEM_TYPES[r.data.type].label} · {RARITIES[r.data.rarity].label}{isWearable(r.data.type) ? ' · ' + TIERS[tierOf(r.data)].label : ''}{r.data.essence ? ' · ' + ELEMENTS[r.data.essence].label : ''} · {String(r.data.weight).replace('.', ',')} kg{r.data.model ? ' · .GLB' : ''}{r.status === 'draft' ? ' · rascunho' : ''}</small>
                </button></li>
              ))}
            </ul>
          </div>
        ))}
        <details className="list-extra">
          <summary>Sobre o Arsenal</summary>
          <small className="hint">Materiais e diversos caem dos monstros (o nome do drop no Invocador é o nome do item) e vêm da coleta; equipamentos e armas nascem na Forja (só Taurinas) — ou caem de monstro, se você puser no drop.</small>
          {cat.rows && cat.rows.length > 0 && missing.length > 0 && <button className="ghost" disabled={busy} onClick={() => void ask({ title: `Adicionar ${missing.length} itens de exemplo?`, body: 'Armadura, botas, capa, anel e materiais entram no catálogo já publicados.', confirm: 'Adicionar e publicar' }).then((ok) => { if (ok) void run(() => cat.saveMany(missing, 'published'), `${missing.length} itens de exemplo adicionados.`); })}>+ {missing.length} itens de exemplo novos</button>}
        </details>
      </aside>

      {!draft || !clean ? <section className="biome-empty"><p>Escolha um item ou crie um novo.</p></section> : (
        <section className="biome-editor">
          <EditorHead name={draft.name} sub={`${ITEM_TYPES[draft.type].label} · ${RARITIES[draft.rarity].label}${draft.essence ? ' · ' + ELEMENTS[draft.essence].label : ''}`} color={RARITIES[draft.rarity].color} status={status} dirty={dirty} />
          <div className="biome-preview">
            <Suspense fallback={<div className="art-empty">Carregando prévia…</div>}><ItemPreview item={clean} charge={charge} body={trainerModel ? { url: trainerModel.url, companionId: trainerModel.companionId, swing, socket } : null} /></Suspense>
            <div className="preview-tools">
              <label>Campo de treino <select value={trainer} onChange={(e) => setTrainer(e.target.value)} aria-label="Modelo que segura o item">
                <option value="">manequim</option>
                {(models ?? []).map((m) => <option key={m.companionId} value={m.companionId}>{m.name}</option>)}
              </select></label>
              {trainerModel && ITEM_TYPES[clean.type].weapon && <label><input type="checkbox" checked={swing} onChange={(e) => setSwing(e.target.checked)} /> golpear em loop</label>}
              {trainerModel && <label title="Mostra os eixos do encaixe preso ao osso (vermelho = x, verde = y, azul = z)"><input type="checkbox" checked={socket} onChange={(e) => setSocket(e.target.checked)} /> mostrar o ponto do osso</label>}
              {clean.type === 'arco' && <label>Carga do arco <input type="range" min={0} max={1} step={0.05} value={charge} onChange={(e) => setCharge(Number(e.target.value))} /></label>}
            </div>
          </div>
          <div className="biome-form">
            {onBone && <fieldset className="grip-box">
              <legend>Pegada (ajuste na mão / no osso){trainerModel ? ` — ${trainerModel.name}` : ' — padrão'}</legend>
              {trainerModel && <small className="hint">{ownGrip ? `Ajuste próprio de ${trainerModel.name}: vale só para este modelo.` : `${trainerModel.name} usa a pegada padrão. Mexa nos controles para criar um ajuste só dele.`}</small>}
              <div className="look-sliders">
                {(['x', 'y', 'z'] as const).map((a, i) => <label key={'p' + a}>Posição {a}<input type="range" min={-0.3} max={0.3} step={0.01} value={grip.pos[i]} onChange={(e) => setGrip('pos', i, Number(e.target.value))} /><small>{grip.pos[i].toFixed(2)}</small></label>)}
                {(['x', 'y', 'z'] as const).map((a, i) => <label key={'r' + a}>Giro {a}<input type="range" min={-3.14} max={3.14} step={0.05} value={grip.rot[i]} onChange={(e) => setGrip('rot', i, Number(e.target.value))} /><small>{Math.round((grip.rot[i] * 180) / Math.PI)}°</small></label>)}
                <label>Tamanho<input type="range" min={0.3} max={2.5} step={0.05} value={grip.scale} onChange={(e) => putGrip({ ...grip, scale: Number(e.target.value) })} /><small>{grip.scale.toFixed(2)}×</small></label>
              </div>
              <div className="row">
                <button className="link" onClick={() => putGrip(DEFAULT_GRIP)}>zerar pegada</button>
                {ownGrip && <button className="link" onClick={() => { const m = { ...(draft.gripByModel ?? {}) }; delete m[trainer]; edit({ gripByModel: m }); }}>voltar à pegada padrão neste modelo</button>}
                {trainerModel && !ownGrip && <button className="link" onClick={() => putGrip(structuredClone(draft.grip))}>criar ajuste só para {trainerModel.name}</button>}
              </div>
              <small className="hint">A peça fica presa direto no osso (mão, cabeça ou peito) e acompanha toda animação. A pegada parte da pose de ligação (A-pose), igual para todo rig: em geral basta o Tamanho e um pouco de Posição. Pegadas salvas antes desta versão podem precisar de “zerar pegada”. Escolha um Companion no campo de treino para ver a arma na mão dele, golpeando. Modelos de tamanhos diferentes podem ter a pegada ajustada um a um; salve o item para valer no jogo.{draft.gripByModel && Object.keys(draft.gripByModel).length ? ` Ajustes por modelo: ${Object.keys(draft.gripByModel).map((k) => models?.find((m) => m.companionId === k)?.name ?? k.slice(0, 6)).join(', ')}.` : ''}</small>
            </fieldset>}

            <div className="row-3">
              <label>Nome<input value={draft.name} onChange={(e) => edit({ name: e.target.value })} maxLength={40} /></label>
              <label>Tipo<select value={draft.type} onChange={(e) => { const t = e.target.value as ItemType; edit({ type: t, grip: DEFAULT_GRIP, ...(draft.weight === ITEM_TYPES[draft.type].weight ? { weight: ITEM_TYPES[t].weight } : {}) }); }}>
                {CATS.map((c) => <optgroup key={c} label={ITEM_CATEGORIES[c].label}>{typesOf(c).map((k) => <option key={k} value={k}>{ITEM_TYPES[k].label}{slotsFor(k).length ? ` (${slotsFor(k).map((x) => SLOTS_EQ[x].short).join(' ou ')})` : ''}</option>)}</optgroup>)}
              </select></label>
            </div>
            <label>Descrição<textarea rows={2} value={draft.description} onChange={(e) => edit({ description: e.target.value })} maxLength={200} /></label>
            <div className="row-3">
              <label>Peso (kg)<input type="number" min={0} max={500} step={0.05} value={draft.weight} onChange={(e) => edit({ weight: Number(e.target.value) })} /><small className="hint">padrão do tipo: {String(ITEM_TYPES[draft.type].weight).replace('.', ',')} kg</small></label>
              <label>Categoria<span className="pill">{ITEM_CATEGORIES[ITEM_TYPES[draft.type].category].label}</span><small className="hint">{ITEM_CATEGORIES[ITEM_TYPES[draft.type].category].hint}</small></label>
              {wear && <label>Espaço<span className="pill">{slotsFor(draft.type).map((x) => SLOTS_EQ[x].label).join(' ou ')}</span></label>}
            </div>
            {atk && <small className="hint">Golpe: {atk.label} · alcance {atk.range} m · {atk.cadence} golpes/s · dano ×{atk.power} · animação {atk.anim}{atk.twoHanded ? ' · duas mãos' : ''}{atk.ranged === 'charged' ? ' · tiro carregado' : ''}</small>}

            <fieldset>
              <legend>Raridade, elemento{wear ? ' e atributos' : ''}</legend>
              <div className="grid-form">
                <label>Raridade<select value={draft.rarity} onChange={(e) => edit({ rarity: e.target.value as Rarity })}>{(Object.keys(RARITIES) as Rarity[]).map((k) => <option key={k} value={k}>{RARITIES[k].label} (×{RARITIES[k].statMul})</option>)}</select></label>
                {isWearable(draft.type) && <label>Tier<select value={draft.tier ?? ''} onChange={(e) => edit({ tier: e.target.value ? (Number(e.target.value) as ItemDef['tier']) : undefined })}><option value="">T1 (padrão)</option>{TIER_KEYS.map((t) => <option key={t} value={t}>{TIERS[t].label} · {TIERS[t].material} (dano ×{TIERS[t].power}, vínculo {TIERS[t].bond})</option>)}</select></label>}
                <label>Elemento<select value={draft.essence ?? ''} onChange={(e) => edit({ essence: (e.target.value || null) as Element | null })}><option value="">Nenhuma</option>{ESS.map((e) => <option key={e} value={e}>{ELEMENTS[e].label}</option>)}</select></label>
                {wear && ATTRS.map((k) => <label key={k}>{k[0].toUpperCase() + k.slice(1)} (%)<input type="number" min={-20} max={40} value={draft.stats[k] ?? 0} onChange={(e) => edit({ stats: { ...draft.stats, [k]: Number(e.target.value) } })} /></label>)}
              </div>
              {wear && <small className="hint">Atributos leves: o valor é multiplicado pela raridade. Elemento: peças equipadas do mesmo elemento formam um conjunto (2, 4 e 6 peças){draft.essence ? ` — ${ELEMENT_SETS[draft.essence].label}: ${ELEMENT_SETS[draft.essence].note}` : ''}.</small>}
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
                <label className="upload"><input type="file" accept=".glb,model/gltf-binary" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void uploadModel(f); }} />{draft.model ? 'Trocar .GLB' : `Enviar .GLB de ${ITEM_TYPES[draft.type].label.toLowerCase()} (Tripo, sem rig)`}</label>
                {library.filter((m) => m.url !== draft.model?.url).length > 0 && (
                  <label>ou usar um já enviado <select value="" onChange={(e) => { const m = library.find((x) => x.url === e.target.value); if (m) edit({ model: { url: m.url, path: m.path } }); }}>
                    <option value="">{ITEM_TYPES[draft.type].label}: {library.length} modelo{library.length > 1 ? 's' : ''}…</option>
                    {library.filter((m) => m.url !== draft.model?.url).map((m) => <option key={m.url} value={m.url}>{m.url.split('/').pop()?.replace(/^\d+-/, '')} (de {m.from})</option>)}
                  </select></label>
                )}
                {draft.model && <button className="link" onClick={() => edit({ model: undefined })}>voltar ao modelo gerado</button>}
                {draft.model && <button className={'link' + (draft.look ? ' tinted' : '')} onClick={() => setLookOpen(!lookOpen)}>aparência</button>}
              </div>
              {draft.model && lookOpen && <LookEditor look={draft.look} onChange={(look) => edit({ look })} />}
            </fieldset>

            {wear && <fieldset>
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
            </fieldset>}

            <StudioActions name={draft.name} status={status} dirty={dirty} busy={busy} msg={msg}
              onSave={() => void run(async () => { await cat.save(draft, status); setDirty(false); }, status === 'published' ? 'Salvo: já vale no jogo.' : 'Rascunho salvo.')}
              onPublish={() => void run(async () => { await cat.save(draft, 'published'); setStatus('published'); setDirty(false); }, 'Publicado: já está no jogo.')}
              onUnpublish={() => void run(async () => { await cat.save(draft, 'draft'); setStatus('draft'); setDirty(false); }, 'Despublicado: saiu do jogo e ficou como rascunho.')}
              onDelete={() => void run(async () => { await cat.remove(draft.slug); setSel(null); setDraft(null); setDirty(false); }, 'Apagado.')}
              menu={status === 'published' && !dirty ? [{ label: 'Pôr na minha bolsa (teste)', title: 'Põe 1 unidade na bolsa do seu Companion', onClick: () => void run(grant, `${draft.name} foi para a bolsa do seu Companion (Inventário no jogo).`) }] : undefined} />
          </div>
        </section>
      )}
    </div>
  );
}
