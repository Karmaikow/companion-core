/** Normalização para comparação (sem acentos, minúsculas, só letras/números). */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/(.)\1{2,}/g, '$1$1') // "muuuuito" -> "muuito"
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shingles(text: string): Set<string> {
  const words = normalize(text).split(' ').filter(Boolean);
  const out = new Set<string>();
  if (words.length < 3) {
    for (const w of words) out.add(w);
    return out;
  }
  for (let i = 0; i < words.length - 1; i++) out.add(words[i] + ' ' + words[i + 1]);
  return out;
}

/** Similaridade de Jaccard sobre bigramas de palavras (0–1). */
export function similarity(a: string, b: string): number {
  const A = shingles(a);
  const B = shingles(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export function clampText(text: unknown, max: number): string {
  if (typeof text !== 'string') return '';
  // remove caracteres de controle, preserva quebras de linha
  return text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max);
}
