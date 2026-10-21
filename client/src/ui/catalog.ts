/** Leitura e escrita dos catálogos do ADM (habilidades da Forja e criaturas do Invocador): slug, nome, data, status. */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../backend/online';

export interface CatalogRow<T> { slug: string; name: string; data: T; status: 'draft' | 'published'; updated_at?: string }

export function useCatalog<T extends { slug: string; name: string }>(table: 'skills' | 'creatures', clean: (x: unknown) => T | null) {
  const [rows, setRows] = useState<CatalogRow<T>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await supabase().from(table).select('slug,name,data,status,updated_at').order('name');
    if (error) { setError(error.message); return null; }
    const list: CatalogRow<T>[] = [];
    for (const r of data ?? []) {
      const d = clean({ ...(r.data as object), slug: r.slug, name: r.name });
      if (d) list.push({ slug: r.slug as string, name: r.name as string, data: d, status: r.status === 'published' ? 'published' : 'draft', updated_at: r.updated_at as string | undefined });
    }
    setRows(list); setError(null);
    return list;
  }, [table, clean]);
  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async (item: T, status: 'draft' | 'published') => {
    const d = clean(item);
    if (!d) throw new Error('Dados inválidos (confira o nome curto/slug).');
    const uid = (await supabase().auth.getUser()).data.user?.id;
    const { error } = await supabase().from(table).upsert({ slug: d.slug, name: d.name, data: d, status, updated_at: new Date().toISOString(), updated_by: uid });
    if (error) throw new Error(error.message);
    return load();
  }, [table, clean, load]);

  const saveMany = useCallback(async (items: T[], status: 'draft' | 'published') => {
    const uid = (await supabase().auth.getUser()).data.user?.id;
    const now = new Date().toISOString();
    const { error } = await supabase().from(table).upsert(items.map((d) => ({ slug: d.slug, name: d.name, data: d, status, updated_at: now, updated_by: uid })), { onConflict: 'slug', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return load();
  }, [table, load]);

  const remove = useCallback(async (slug: string) => {
    const { error } = await supabase().from(table).delete().eq('slug', slug);
    if (error) throw new Error(error.message);
    return load();
  }, [table, load]);

  return { rows, error, load, save, saveMany, remove };
}

/** Envia um arquivo para o bucket público world-assets e devolve a URL pública. */
export async function uploadWorldAsset(path: string, file: File): Promise<{ url: string; path: string }> {
  const type = /\.glb$/i.test(file.name) ? 'model/gltf-binary' : file.type || 'application/octet-stream';
  const { error } = await supabase().storage.from('world-assets').upload(path, new Blob([file], { type }), { contentType: type, upsert: false });
  if (error) throw new Error(`${file.name}: ${error.message}`);
  return { url: supabase().storage.from('world-assets').getPublicUrl(path).data.publicUrl, path };
}

export const safeName = (name: string) => name.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[^\w-]+/g, '_').slice(0, 40);
