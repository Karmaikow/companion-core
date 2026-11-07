/**
 * Consulta periódica ao servidor que só roda com a aba à vista: em segundo plano não chama nada (cada chamada gasta
 * da cota da função) e, ao voltar, atualiza uma vez na hora. Devolve a função que para tudo.
 */
export function pollWhenVisible(fn: () => void, ms: number): () => void {
  let last = Date.now();
  const run = () => { last = Date.now(); fn(); };
  const t = window.setInterval(() => { if (!document.hidden) run(); }, ms);
  // voltou para a aba: só atualiza se já passou boa parte do intervalo (evita rajada ao alternar abas)
  const back = () => { if (!document.hidden && Date.now() - last > ms / 2) run(); };
  document.addEventListener('visibilitychange', back);
  return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', back); };
}
