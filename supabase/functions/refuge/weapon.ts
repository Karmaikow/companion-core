// A arma na mão direita do Companion, como o servidor a vê (para escolas e missões que pedem arma e tier): o espaço
// salvo em companion_equipment, resolvido no catálogo publicado (Arsenal) ou na peça forjada (pacto_equipment).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { DEFAULT_ITEMS, ITEM_TYPES, instanceSlug, sanitizeItem, type ItemType } from './rules/index.ts';

export interface HeldWeapon { type: ItemType; tier?: number; twoHanded: boolean }

export async function heldWeapon(db: SupabaseClient, cid: string): Promise<HeldWeapon | null> {
  const { data: eq } = await db.from('companion_equipment').select('equipped').eq('companion_id', cid).maybeSingle();
  const slug = ((eq?.equipped ?? {}) as Record<string, unknown>).mainhand;
  if (typeof slug !== 'string' || !slug) return null;
  let type: ItemType | null = null, tier: number | undefined;
  if (slug.startsWith('inst-')) {
    const { data } = await db.from('pacto_equipment').select('id,data').eq('owner', cid).eq('status', 'ativo');
    const row = (data ?? []).find((r) => instanceSlug(r.id as string) === slug);
    const d = (row?.data ?? {}) as { itemType?: string; tier?: number };
    if (d.itemType && d.itemType in ITEM_TYPES) { type = d.itemType as ItemType; tier = d.tier; }
  } else {
    const { data: it } = await db.from('items').select('slug,name,data').eq('slug', slug).eq('status', 'published').maybeSingle();
    const item = it ? sanitizeItem({ ...(it.data as object), slug: it.slug, name: it.name }) : DEFAULT_ITEMS.find((x) => x.slug === slug) ?? null;
    if (item) { type = item.type; tier = item.tier; }
  }
  const w = type ? ITEM_TYPES[type].weapon : undefined;
  return type && w ? { type, tier, twoHanded: w.twoHanded } : null;
}
