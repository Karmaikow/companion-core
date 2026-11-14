import type { ItemDef } from '@rules';

// O lote pode chegar depois do catálogo. Sem arquivo, a interface usa a prévia normal.
const cards = import.meta.glob<string>('../assets/arsenal-de-aster/item_*.png', {
  eager: true, query: '?url&no-inline', import: 'default',
});

export function arsenalCard(item: ItemDef | null): string | undefined {
  if (!item?.cardNumber) return undefined;
  const number = String(item.cardNumber).padStart(3, '0');
  return cards[`../assets/arsenal-de-aster/item_${number}.png`];
}
