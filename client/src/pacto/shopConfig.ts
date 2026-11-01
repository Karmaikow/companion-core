/**
 * Configuração das lojas (aba Lojas do Administrador) e o estoque do dia do Mercadão.
 * Lê game_config.values.shop (sem nada salvo: DEFAULT_SHOP) e, online, shop_stock do dia. O servidor confere tudo
 * de novo na compra — aqui é só para mostrar.
 */
import { create } from 'zustand';
import { DEFAULT_SHOP, resolveShop, shopDay, type ShopConfig } from '@rules';
import { supabase } from '../backend/online';
import { useGame } from '../store';

interface ShopCfgState { cfg: ShopConfig; sold: Record<string, number>; day: string; loaded: boolean; refresh: () => Promise<void> }

const LOCAL_SOLD = 'companion-core:shop-sold:v1';
/** Vendas do dia no modo offline (só neste aparelho). */
export const localSold = {
  get(day: string): Record<string, number> { try { const v = JSON.parse(localStorage.getItem(LOCAL_SOLD) ?? 'null'); return v?.day === day ? v.sold : {}; } catch { return {}; } },
  add(day: string, entry: string, qty: number) { const sold = localSold.get(day); sold[entry] = (sold[entry] ?? 0) + qty; try { localStorage.setItem(LOCAL_SOLD, JSON.stringify({ day, sold })); } catch { /* só nesta sessão */ } },
};

export const useShopConfig = create<ShopCfgState>((set) => ({
  cfg: DEFAULT_SHOP, sold: {}, day: shopDay(), loaded: false,
  refresh: async () => {
    const day = shopDay();
    let cfg = DEFAULT_SHOP, sold: Record<string, number> = {};
    try {
      const { data } = await supabase().from('game_config').select('values').eq('id', 1).maybeSingle();
      cfg = resolveShop((data?.values as Record<string, unknown> | undefined)?.shop);
    } catch { /* fica o padrão */ }
    if (useGame.getState().backend?.kind === 'online') {
      try { const { data } = await supabase().from('shop_stock').select('entry,sold').eq('day', day); sold = Object.fromEntries((data ?? []).map((r) => [r.entry as string, Number(r.sold)])); } catch { /* sem estoque lido */ }
    } else sold = localSold.get(day);
    set({ cfg, sold, day, loaded: true });
  },
}));
