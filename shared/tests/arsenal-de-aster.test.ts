import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { bagEntries, bagSellPrice, categoryOf, isWearable, sanitizeItem, type ItemDef } from '../rules/index.ts';

const sql = readFileSync(new URL('../../supabase/migrations/20261106000000_arsenal_de_aster.sql', import.meta.url), 'utf8');
const rows: ItemDef[] = JSON.parse(sql.split('$arsenal$')[1]);

it('mantém a correspondência das 200 cartas com os itens da bolsa e da Forja', () => {
  expect(rows.map(row => row.cardNumber)).toEqual(Array.from({ length: 200 }, (_, i) => i + 1));
  expect(new Set(rows.map(row => row.slug)).size).toBe(200);
  expect(new Set(rows.map(row => row.rarity)).size).toBe(6);
  const names = new Set(rows.map(row => row.name));
  for (const row of rows) {
    const item = sanitizeItem(row)!;
    expect(item).toMatchObject(row);
    const [entry] = bagEntries([{ item_key: item.slug, qty: 1, meta: {} }], [item]);
    expect(entry).toMatchObject({ category: categoryOf(item.type), rarity: row.rarity });
    if (entry.category === 'material') expect(bagSellPrice(item.slug, {}, [item])).toBeGreaterThan(0);
    if (isWearable(item.type)) {
      expect(item.recipe.ingredients.length).toBeGreaterThan(0);
      for (const ingredient of item.recipe.ingredients) expect(names.has(ingredient.item)).toBe(true);
    }
  }
});
