/**
 * Criador de Itens (painel do ADM): ferramenta dedicada à criação e gestão de itens normais
 * (Materiais, Consumíveis/Poções, Chaves, Lembranças e Diversos) e do catálogo de 200 itens.
 * Cada item possui: Nome do Item, Tipo do Item, Raridade, Ícone (exibido na grade do inventário),
 * Descrição e Imagem Grande (exibida na descrição ao selecionar o item no inventário).
 */
import { useMemo, useState } from 'react';
import {
  ALL_CATALOG_ITEMS, ARSENAL_200_ITEMS, ITEM_TYPES, ITEM_CATEGORIES, RARITIES, ELEMENTS, DEFAULT_GRIP,
  sanitizeItem, biomeSlug, isWearable, itemIconUrl, itemCardUrl,
  type ItemDef, type ItemType, type ItemCategory, type Rarity, type Element,
} from '@rules';
import { supabase } from '../backend/online';
import { useCatalog, uploadWorldAsset, safeName, type CatalogRow } from './catalog';
import { EditorHead, ListSearch, StudioActions, ask, matches, useAdminDirty } from './adminKit';

const NORMAL_CATS: ItemCategory[] = ['material', 'diversos'];
const ALL_CATS: ItemCategory[] = ['material', 'diversos', 'equipamento', 'arma'];
const ESS = Object.keys(ELEMENTS) as Element[];
const typesOf = (c: ItemCategory) => (Object.keys(ITEM_TYPES) as ItemType[]).filter((t) => ITEM_TYPES[t].category === c);

/**
 * Recorta automaticamente o ícone do canto inferior direito de uma imagem de carta (proporção 896×1200)
 * usando um <canvas> no navegador e devolve um Blob WebP (128×128).
 */
async function cropCornerIconFromFile(fileOrUrl: File | string): Promise<Blob> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  const url = typeof fileOrUrl === 'string' ? fileOrUrl : URL.createObjectURL(fileOrUrl);
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Não foi possível abrir a imagem para recortar o ícone.'));
      img.src = url;
    });
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    // Coordenadas médias do quadro de ícone no canto inferior direito das cartas
    const sx = Math.round(w * 0.652);
    const sy = Math.round(h * 0.742);
    const sw = Math.round(w * 0.246);
    const sh = Math.round(h * 0.185);
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponível.');
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 128, 128);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar WebP do ícone.'))), 'image/webp', 0.9);
    });
  } finally {
    if (typeof fileOrUrl !== 'string') URL.revokeObjectURL(url);
  }
}

export function ItemStudio() {
  const cat = useCatalog<ItemDef>('items', sanitizeItem);
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<ItemDef | null>(null);
  const [status, setStatus] = useState<'draft' | 'published'>('published');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<ItemType>('erva');
  const [scope, setScope] = useState<'normais' | 'todos'>('todos');
  const [autoCropIcon, setAutoCropIcon] = useState(true);
  const [q, setQ] = useState('');
  useAdminDirty(dirty);

  // Unifica os itens salvos no banco com os 200 itens registrados no catálogo do projeto
  const mergedRows = useMemo<CatalogRow<ItemDef>[]>(() => {
    const dbMap = new Map<string, CatalogRow<ItemDef>>();
    for (const r of cat.rows ?? []) {
      const icon = r.data.icon ?? itemIconUrl(r.data);
      const image = r.data.image ?? itemCardUrl(r.data);
      dbMap.set(r.slug, {
        ...r,
        data: {
          ...r.data,
          ...(icon ? { icon } : {}),
          ...(image ? { image } : {}),
        },
      });
    }
    for (const base of ALL_CATALOG_ITEMS) {
      if (!dbMap.has(base.slug)) {
        const icon = base.icon ?? itemIconUrl(base);
        const image = base.image ?? itemCardUrl(base);
        dbMap.set(base.slug, {
          slug: base.slug,
          name: base.name,
          status: 'published',
          data: {
            ...base,
            ...(icon ? { icon } : {}),
            ...(image ? { image } : {}),
          },
        });
      }
    }
    return [...dbMap.values()].sort((a, b) => {
      const ca = a.data.cardNumber ?? 9999;
      const cb = b.data.cardNumber ?? 9999;
      if (ca !== cb) return ca - cb;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  }, [cat.rows]);

  const missingInDb = useMemo(
    () => ARSENAL_200_ITEMS.filter((it) => !cat.rows?.some((r) => r.slug === it.slug)),
    [cat.rows]
  );

  const run = async (f: () => Promise<unknown>, ok: string) => {
    setBusy(true); setMsg(null);
    try { await f(); setMsg({ ok: true, text: ok }); }
    catch (e) { setMsg({ text: (e as Error).message }); }
    finally { setBusy(false); }
  };

  const pick = async (slug: string) => {
    if (dirty && !(await ask({ title: 'Trocar sem salvar?', body: 'Há mudanças não salvas neste item. Se trocar agora, elas se perdem.', confirm: 'Trocar e descartar', cancel: 'Continuar editando', danger: true }))) return;
    const r = mergedRows.find((x) => x.slug === slug);
    setSel(slug);
    setDraft(r ? structuredClone(r.data) : null);
    setStatus(r?.status ?? 'published');
    setDirty(false);
    setMsg(null);
  };

  const edit = (p: Partial<ItemDef>) => {
    setDraft((d) => (d ? { ...d, ...p } : d));
    setDirty(true);
  };

  function create() {
    const slug = biomeSlug(newName);
    if (!newName.trim()) return;
    if (mergedRows.some((r) => r.slug === slug)) {
      setMsg({ text: `Já existe um item com o código "${slug}".` });
      return;
    }
    const item = sanitizeItem({
      slug,
      name: newName.trim(),
      description: '',
      type: newType,
      rarity: 'comum',
      essence: null,
      weight: ITEM_TYPES[newType].weight,
      stats: {},
      proc: { primary: '#b98c5c', secondary: '#e8e2d0', metal: '#c9d2e0', gem: false, variant: 0 },
      grip: DEFAULT_GRIP,
      starter: false,
      obtain: '',
      recipe: { ingredients: [], minBond: 1, seconds: 0 },
    })!;
    setSel(slug);
    setDraft(item);
    setStatus('draft');
    setDirty(true);
    setNewName('');
  }

  async function uploadImageFile(f: File) {
    if (!draft) return;
    await run(async () => {
      const ext = f.name.split('.').pop()?.toLowerCase() || 'webp';
      const upCard = await uploadWorldAsset(`items/${draft.slug}/card-${Date.now()}-${safeName(f.name)}.${ext}`, f);
      const patch: Partial<ItemDef> = { image: upCard.url };
      if (autoCropIcon) {
        const iconBlob = await cropCornerIconFromFile(f);
        const iconFile = new File([iconBlob], `${draft.slug}-icon.webp`, { type: 'image/webp' });
        const upIcon = await uploadWorldAsset(`items/${draft.slug}/icon-${Date.now()}-${safeName(f.name)}.webp`, iconFile);
        patch.icon = upIcon.url;
      }
      edit(patch);
    }, autoCropIcon ? 'Imagem grande enviada e ícone do canto recortado automaticamente. Salve o item.' : 'Imagem grande enviada. Salve o item.');
  }

  async function uploadIconFile(f: File) {
    if (!draft) return;
    await run(async () => {
      const ext = f.name.split('.').pop()?.toLowerCase() || 'webp';
      const upIcon = await uploadWorldAsset(`items/${draft.slug}/icon-${Date.now()}-${safeName(f.name)}.${ext}`, f);
      edit({ icon: upIcon.url });
    }, 'Ícone enviado. Salve o item.');
  }

  async function recropFromCurrentImage() {
    if (!draft) return;
    const src = itemCardUrl(draft);
    if (!src) {
      setMsg({ text: 'Defina primeiro uma imagem grande para recortar o ícone do canto.' });
      return;
    }
    await run(async () => {
      const blob = await cropCornerIconFromFile(src);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Falha ao ler o recorte do ícone.'));
        reader.readAsDataURL(blob);
      });
      try {
        const iconFile = new File([blob], `${draft.slug}-icon.webp`, { type: 'image/webp' });
        const upIcon = await uploadWorldAsset(`items/${draft.slug}/icon-${Date.now()}.webp`, iconFile);
        edit({ icon: upIcon.url });
      } catch {
        // Caso o bucket online não esteja acessível na sessão local, usa data URL compacta
        edit({ icon: dataUrl });
      }
    }, 'Ícone recortado do canto inferior direito da imagem!');
  }

  async function grant() {
    if (!draft) return;
    const { data, error } = await supabase().functions.invoke('refuge', { body: { action: 'inventory.grant', slug: draft.slug, qty: 1 } });
    if (error) {
      let m = 'Não foi possível enviar para a bolsa.';
      try { const b = await (error as { context?: Response }).context?.json(); if (b?.error) m = b.error; } catch { /* mantém */ }
      throw new Error(m);
    }
    return data;
  }

  const clean = useMemo(() => (draft ? sanitizeItem(draft) : null), [draft]);
  const visibleCats = scope === 'normais' ? NORMAL_CATS : ALL_CATS;
  const found = mergedRows.filter((r) => {
    const catKey = ITEM_TYPES[r.data.type].category;
    if (scope === 'normais' && !NORMAL_CATS.includes(catKey)) return false;
    const numStr = r.data.cardNumber ? `#${String(r.data.cardNumber).padStart(3, '0')}` : '';
    return matches(q, r.name, r.slug, numStr, ITEM_TYPES[r.data.type].label, RARITIES[r.data.rarity].label, r.data.description);
  });
  const byCat = (c: ItemCategory) => found.filter((r) => ITEM_TYPES[r.data.type].category === c);

  const previewIcon = clean ? itemIconUrl(clean) : undefined;
  const previewCard = clean ? itemCardUrl(clean) : undefined;

  return (
    <div className="biome-studio">
      <aside className="biome-list">
        <div className="list-head">
          <h2>Itens <small>{found.length}</small></h2>
          <div className="row" style={{ gap: 4 }}>
            <button type="button" className={scope === 'normais' ? 'primary' : 'ghost'} onClick={() => setScope('normais')} title="Materiais, poções, comidas, chaves e lembranças">Normais</button>
            <button type="button" className={scope === 'todos' ? 'primary' : 'ghost'} onClick={() => setScope('todos')} title="Todos os 200 itens do catálogo">Todos ({mergedRows.length})</button>
          </div>
        </div>

        <form className="biome-new" onSubmit={(e) => { e.preventDefault(); create(); }}>
          <select value={newType} onChange={(e) => setNewType(e.target.value as ItemType)} aria-label="Tipo do novo item">
            {ALL_CATS.map((c) => (
              <optgroup key={c} label={ITEM_CATEGORIES[c].label}>
                {typesOf(c).map((t) => <option key={t} value={t}>{ITEM_TYPES[t].label}</option>)}
              </optgroup>
            ))}
          </select>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome do novo item" maxLength={40} aria-label="Nome do novo item" />
          <button className="primary" disabled={!newName.trim()}>+ Criar</button>
        </form>

        <ListSearch value={q} onChange={setQ} label="Buscar nos 200 itens (nome, #001, tipo…)" count={found.length} />
        {cat.error && <p className="msg err">{cat.error}</p>}

        {cat.rows && missingInDb.length > 0 && (
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => void run(() => cat.saveMany(ARSENAL_200_ITEMS, 'published'), `200 itens sincronizados e publicados no banco!`)}
          >
            Sincronizar 200 itens no banco ({missingInDb.length} pendentes)
          </button>
        )}

        {q.trim() && !found.length && <p className="empty">Nenhum item com “{q.trim()}”.</p>}

        {visibleCats.map((c) => byCat(c).length > 0 && (
          <div key={c} className="biome-group">
            <h3>{ITEM_CATEGORIES[c].label} <small>({byCat(c).length})</small></h3>
            <ul>
              {byCat(c).map((r) => {
                const ic = itemIconUrl(r.data);
                return (
                  <li key={r.slug}>
                    <button className={sel === r.slug ? 'on' : ''} onClick={() => void pick(r.slug)}>
                      <strong style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {ic ? (
                          <img src={ic} width={28} height={28} alt="" style={{ borderRadius: 6, objectFit: 'cover', flexShrink: 0, border: `1px solid ${RARITIES[r.data.rarity].color}` }} loading="lazy" />
                        ) : (
                          <i className="look-dot" style={{ background: RARITIES[r.data.rarity].color }} />
                        )}
                        <span>{r.data.cardNumber ? `#${String(r.data.cardNumber).padStart(3, '0')} ` : ''}{r.name}</span>
                      </strong>
                      <small>
                        {ITEM_TYPES[r.data.type].label} · <span style={{ color: RARITIES[r.data.rarity].color }}>{RARITIES[r.data.rarity].label}</span>
                        {r.data.essence ? ' · ' + ELEMENTS[r.data.essence].label : ''} · {String(r.data.weight).replace('.', ',')} kg
                        {r.status === 'draft' ? ' · rascunho' : ''}
                      </small>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </aside>

      {!draft || !clean ? (
        <section className="biome-empty">
          <p>Escolha um dos 200 itens ao lado ou crie um novo item normal.</p>
        </section>
      ) : (
        <section className="biome-editor">
          <EditorHead
            name={draft.name}
            sub={`${draft.cardNumber ? `Carta #${String(draft.cardNumber).padStart(3, '0')} · ` : ''}${ITEM_TYPES[draft.type].label} · ${RARITIES[draft.rarity].label}${draft.essence ? ' · ' + ELEMENTS[draft.essence].label : ''}`}
            color={RARITIES[draft.rarity].color}
            status={status}
            dirty={dirty}
          />

          <div className="biome-form">
            <fieldset>
              <legend>Prévia no Inventário (Ícone na grade vs. Imagem Grande na descrição)</legend>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 20, alignItems: 'start' }}>
                <div style={{ display: 'grid', justifyItems: 'center', gap: 6 }}>
                  <small className="hint">Slot do Inventário (só o ícone)</small>
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 10,
                      border: `2px solid ${RARITIES[clean.rarity].color}`,
                      background: 'radial-gradient(circle at 50% 35%, #fffaf0, #e6d3ab)',
                      display: 'grid',
                      placeItems: 'center',
                      overflow: 'hidden',
                      boxShadow: '0 2px 6px rgba(0,0,0,.25)',
                    }}
                  >
                    {previewIcon ? (
                      <img src={previewIcon} alt={clean.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: '1.8rem' }}>{ITEM_CATEGORIES[ITEM_TYPES[clean.type].category].icon}</span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: previewCard ? '120px 1fr' : '1fr', gap: 14, alignItems: 'start', padding: 12, borderRadius: 10, border: '1px solid rgba(183, 157, 97, .45)', background: 'rgba(12, 18, 42, .55)' }}>
                  {previewCard && (
                    <img
                      src={previewCard}
                      alt={`Carta de ${clean.name}`}
                      style={{ width: 120, height: 160, objectFit: 'cover', borderRadius: 8, border: `1px solid ${RARITIES[clean.rarity].color}`, boxShadow: '0 6px 16px rgba(0,0,0,.4)' }}
                    />
                  )}
                  <div style={{ display: 'grid', gap: 6 }}>
                    <small className="hint">Ao selecionar o item no inventário (Imagem Grande + Descrição)</small>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {previewIcon && <img src={previewIcon} width={32} height={32} alt="" style={{ borderRadius: 6 }} />}
                      <div>
                        <strong style={{ display: 'block', color: '#fff2d8' }}>{clean.name}</strong>
                        <small style={{ color: RARITIES[clean.rarity].color }}>
                          {ITEM_TYPES[clean.type].label} · {RARITIES[clean.rarity].label} · {String(clean.weight).replace('.', ',')} kg
                        </small>
                      </div>
                    </div>
                    <p style={{ margin: 0, fontSize: '.86rem', color: '#e9dfc6' }}>
                      {clean.description || 'Sem descrição definida.'}
                    </p>
                  </div>
                </div>
              </div>
            </fieldset>

            <div className="row-3">
              <label>
                Nome do Item
                <input value={draft.name} onChange={(e) => edit({ name: e.target.value })} maxLength={40} placeholder="Ex.: Gota de Seiva" />
              </label>
              <label>
                Tipo do Item
                <select
                  value={draft.type}
                  onChange={(e) => {
                    const t = e.target.value as ItemType;
                    edit({ type: t, ...(draft.weight === ITEM_TYPES[draft.type].weight ? { weight: ITEM_TYPES[t].weight } : {}) });
                  }}
                >
                  {ALL_CATS.map((c) => (
                    <optgroup key={c} label={ITEM_CATEGORIES[c].label}>
                      {typesOf(c).map((k) => <option key={k} value={k}>{ITEM_TYPES[k].label}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label>
                Raridade
                <select value={draft.rarity} onChange={(e) => edit({ rarity: e.target.value as Rarity })}>
                  {(Object.keys(RARITIES) as Rarity[]).map((k) => (
                    <option key={k} value={k}>{RARITIES[k].label}</option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              Descrição
              <textarea
                rows={3}
                value={draft.description}
                onChange={(e) => edit({ description: e.target.value })}
                maxLength={200}
                placeholder="Descrição exibida ao clicar no item dentro da Sacola…"
              />
            </label>

            <fieldset>
              <legend>Ícone e Imagem Grande</legend>
              <div className="grid-form">
                <label>
                  Carta do Catálogo (1 a 200)
                  <select
                    value={draft.cardNumber ?? ''}
                    onChange={(e) => {
                      const num = e.target.value ? Number(e.target.value) : undefined;
                      if (num) {
                        const pad = String(num).padStart(3, '0');
                        edit({
                          cardNumber: num,
                          icon: `/assets/itens/icons/item_${pad}.webp`,
                          image: `/assets/itens/cards/item_${pad}.webp`,
                        });
                      } else {
                        edit({ cardNumber: undefined });
                      }
                    }}
                  >
                    <option value="">Personalizado / Sem número fixo</option>
                    {ARSENAL_200_ITEMS.map((it) => (
                      <option key={it.cardNumber} value={it.cardNumber}>
                        #{String(it.cardNumber).padStart(3, '0')} — {it.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Ícone (grade do inventário)
                  <input
                    value={draft.icon ?? ''}
                    onChange={(e) => edit({ icon: e.target.value || undefined })}
                    placeholder="/assets/itens/icons/item_001.webp"
                  />
                </label>

                <label>
                  Imagem Grande (descrição do item)
                  <input
                    value={draft.image ?? ''}
                    onChange={(e) => edit({ image: e.target.value || undefined })}
                    placeholder="/assets/itens/cards/item_001.webp"
                  />
                </label>
              </div>

              <div className="row" style={{ marginTop: 8, alignItems: 'center' }}>
                <label className="upload">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) void uploadImageFile(f);
                    }}
                  />
                  Enviar Imagem Grande (Carta)
                </label>

                <label className="upload">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) void uploadIconFile(f);
                    }}
                  />
                  Enviar Ícone Separado
                </label>

                <button type="button" className="ghost" disabled={busy || !previewCard} onClick={() => void recropFromCurrentImage()}>
                  Recortar ícone do canto da imagem
                </button>

                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={autoCropIcon} onChange={(e) => setAutoCropIcon(e.target.checked)} />
                  Extrair ícone do canto automaticamente ao enviar carta
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend>Propriedades adicionais</legend>
              <div className="row-3">
                <label>
                  Peso (kg)
                  <input
                    type="number"
                    min={0}
                    max={500}
                    step={0.05}
                    value={draft.weight}
                    onChange={(e) => edit({ weight: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Essência / Elemento
                  <select value={draft.essence ?? ''} onChange={(e) => edit({ essence: (e.target.value || null) as Element | null })}>
                    <option value="">Nenhuma</option>
                    {ESS.map((e) => <option key={e} value={e}>{ELEMENTS[e].label}</option>)}
                  </select>
                </label>
                <label>
                  Origem / Como conseguir
                  <input
                    value={draft.obtain}
                    onChange={(e) => edit({ obtain: e.target.value })}
                    maxLength={80}
                    placeholder="Ex.: Coleta no Vale, Drop de monstro…"
                  />
                </label>
              </div>
              {isWearable(draft.type) && (
                <small className="hint">
                  Este item também pode ser vestido/empunhado; para ajustar modelo 3D (.GLB) e pegada no osso, você também pode abri-lo na aba Arsenal.
                </small>
              )}
            </fieldset>

            <StudioActions
              name={draft.name}
              status={status}
              dirty={dirty}
              busy={busy}
              msg={msg}
              onSave={() => void run(async () => { await cat.save(draft, status); setDirty(false); }, status === 'published' ? 'Salvo: já vale no jogo.' : 'Rascunho salvo.')}
              onPublish={() => void run(async () => { await cat.save(draft, 'published'); setStatus('published'); setDirty(false); }, 'Publicado: já está no jogo.')}
              onUnpublish={() => void run(async () => { await cat.save(draft, 'draft'); setStatus('draft'); setDirty(false); }, 'Despublicado: ficou como rascunho.')}
              onDelete={() => void run(async () => { await cat.remove(draft.slug); setSel(null); setDraft(null); setDirty(false); }, 'Item apagado do banco.')}
              menu={[
                {
                  label: 'Pôr na minha bolsa (teste)',
                  title: 'Adiciona 1 unidade na bolsa do seu Companion',
                  onClick: () => void run(grant, `${draft.name} foi enviado para a bolsa do seu Companion.`),
                },
              ]}
            />
          </div>
        </section>
      )}
    </div>
  );
}
