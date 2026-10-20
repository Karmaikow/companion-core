# Companion Core — Arquitetura (v2, baseada no GDD v0.2)

## Decisão de stack

| Camada | Escolha | Por quê |
|---|---|---|
| Cliente | **Three.js + React Three Fiber + TypeScript (Vite)** | HD-2D = sprites 2D em cena 3D com luz, bloom e tilt-shift. Roda leve no navegador e no celular (o GDD exige PC, web e mobile); empacota para lojas com Capacitor. |
| UI | React (DOM) sobre o canvas | Chat, diário, memórias e inventário são interfaces de texto — DOM é mais acessível e barato que UI dentro do canvas. |
| Regras | `shared/rules` — TypeScript puro, sem dependências | Mesmo código no cliente (modo local), na Edge Function e no futuro servidor de simulação. Testado com Vitest. |
| Back-end MVP 1 | **Supabase** (Postgres + RLS + Edge Functions + Auth) | Persistência, eventos imutáveis, proveniência de memórias; clientes só leem, toda escrita passa pela função `refuge`. |
| IA | Provedor plugável (Anthropic → Groq → offline) | A IA **propõe** (fala, descobertas, memórias em JSON); as regras **decidem**. Sem modelo, o respondedor offline mantém o jogo funcionando. |
| Hospedagem do cliente | Vercel | Estático; sem lógica de jogo. |
| MVP 2+ (mundo vivo) | Servidor de simulação persistente (Colyseus ou SpacetimeDB) em Fly.io/Railway | Vercel/Edge Functions não mantêm loop contínuo. O servidor roda o tick determinístico (navegação, dano, coleta) e chama a IA só para planejamento e reflexão (GDD 10). |

Alternativas avaliadas: **Godot 4** (ótimo editor, mas export web pesado, só renderizador Compatibility e desempenho fraco em navegador mobile); **Phaser** (2D puro, não entrega profundidade HD-2D); **Unity** (WebGL pesado no mobile).

## Mudanças em relação ao projeto anterior

- **Servidor autoritativo** no lugar do Core local com cristal criptografado: o GDD pede agentes que vivem com o jogador offline e um mundo compartilhado.
- **Extração estruturada** no lugar das regex de grounding: o modelo devolve JSON; `validateDiscovery` decide se a quest conclui.
- **Primeira forma procedural** gerada do contrato de identidade (determinística pelo seed). O despertar nunca depende da geração de imagem; a arte final do Studio entra pela fila `visual_jobs`.
- Reaproveitar depois: Studio de sprites (vira a Fábrica de Companions), Passagem do Vínculo (presentear/transferir), tom de voz da Mayuna.

## Fluxo de um turno de conversa

```
jogador ──► refuge(chat) ──► evento chat.player (imutável)
                     │
                     ├─► LLM: {reply, mood, meaningful, discoveries[], memories[]}
                     │        (falhou? respondedor offline)
                     ├─► applyTurn (shared/rules): valida descobertas, deduplica memórias,
                     │        calcula XP anti-farm, verifica despertar
                     ├─► eventos chat.companion, quest.completed, bond.xp, bond.level
                     ├─► memórias com source_event_ids = [fala do jogador, resposta]
                     └─► snapshot completo ao cliente
```

## Regras do MVP 1 (configuráveis em `game_config.values`)

- Despertar: 7 quests + vínculo nível 5.
- Curva de vínculo sem teto: `limiar(L) = 60 · (L-1)^1.6`.
- XP por mensagem: só se significativa, não repetida (similaridade < 0,8), não elogio genérico; retorno decrescente `8 / (1 + n/25)` no dia.
- Descoberta: +40 uma vez por quest. Memória nova: +4 (máx. 2 por turno).
- "Primeiro laço" exige vínculo ≥ 2.
- Relógio: 8 h reais = 1 dia de jogo.

## Estrutura

```
shared/rules/        regras puras + testes (shared/tests)
supabase/migrations/ schema do MVP 1
supabase/functions/refuge/  Edge Function (rules/ é cópia gerada por `npm run sync:rules`)
client/              Vite + R3F (cena do Refúgio, painéis, modo local)
scripts/e2e-local.mjs jornada completa no navegador (Playwright)
```

## Ritual de criação

Antes do primeiro encontro o jogador informa o próprio nome, o nome e o pronome (ela/ele) do Companion e de 2 a 5 traços
(catálogo portado do projeto antigo, `shared/rules/creation.ts`). Nome e traços concluem "Quem sou eu?" e "O que sinto?";
cor, forma, essência, laço e sonho continuam vindo da conversa. Os traços viram direção de atuação no prompt.
O nome pode ser trocado conversando (evento `identity.renamed`, sem XP).

## Descobertas assistidas

Modelos menores às vezes aceitam algo na fala ("vou ser Aurora!") sem propor a descoberta. `assistDiscoveries` roda o
detector determinístico na mensagem do jogador e só adiciona a proposta se a fala do Companion mencionar o mesmo valor.
`validateDiscovery` continua decidindo.

## Refúgio que cresce (v1.1)

O Refúgio nasce só com o altar e o círculo mágico. `refugeFeatures()` (shared/rules/refuge.ts) decide o que aparece:
lanternas por nível de vínculo, cristais na cor do Companion ("Minha cor"), estantes (vínculo 3/5 ou primeira página do diário),
a peça da essência (água → cachoeira, fogo → braseiro, luz/sombra → claraboia, vento → sinos, raio → orbe, gelo/terra → cristais,
natureza → flores e plantas), ninho com almofadas ("Primeiro laço"), janela para o mundo ("Primeiro sonho") e caldeirão (primeira receita).
Cada peça surge com animação de crescimento; conquistas grandes soltam uma onda de luz do altar.

## Quests secretas, impulso e livro de receitas (v1.1)

- 7 segredos invisíveis no livro de quests, detectados por sinais determinísticos (`shared/rules/secrets.ts`): conversa na madrugada,
  primeira receita, história longa, renomear, primeira página do diário, agradecer de coração, 5 perguntas sobre o Companion.
  Recompensa: +25 de vínculo, item raro e impulso (as próximas 5 mensagens significativas valem o dobro). Tabela `companion_secrets`.
- Receitas: o modelo devolve `recipes` quando a pessoa pede para anotar; `splitIngredient` separa "onde encontrar". Tabela `companion_recipes`.
- "Puxar assunto": após ~80 s de silêncio (até 3x por sessão), ação `muse` gera uma fala espontânea com um gancho de fantasia.

## Conversa (v1.1)

Prompt com o mundo de fantasia, regra explícita de pronomes ("mim" = a pessoa; "você" = o Companion), tratamento da pessoa
(ele/ela/neutro, escolhido na criação), limite de uso do nome/apelido, ganchos de assunto e memórias em terceira pessoa com nomes.
`fixMemorySubject` corrige o sujeito pelos nomes citados e `sameMemory` evita repetições. Groq: espera e tenta de novo em 429.

## Ideias registradas para depois

- Lugares lendários inventados nas conversas (ex.: "Lago da Névoa", "Montanha Lumina", "Floresta de Espelhos") viram pontos do mapa
  e eventos de busca quando o mundo abrir (MVP 2).
- Culinária de verdade: coletar os ingredientes das receitas no mundo e cozinhar no caldeirão (itens estranhos com efeitos).

## Operação

- Grants: este projeto Supabase não concede privilégios automáticos em tabelas novas; o `service_role` recebe grants
  explícitos (migração `20261020173000_mvp1_service_grants.sql`). Sem isso a função falha com 500.
- Publicar a função: `npm run sync:rules && node scripts/bundle-refuge.mjs` gera `dist-fn/refuge/index.js` (um arquivo, só ASCII).
- Formas do Companion: `node scripts/sprite-lab.mjs` com o Vite em `--port 5199` renderiza uma grade com várias espécies (client/sprite-lab.html).
- Teste contra o servidor real: `node scripts/e2e-refuge.mjs "oi" "..."` (cria um convidado descartável; `SETUP='{"name":...}'` usa o ritual).
- Teste no navegador (modo offline): `node scripts/e2e-local.mjs http://localhost:4173/ <pasta>`.

## Pendências

1. ~~Migrações~~, ~~função `refuge`~~, ~~login anônimo~~, ~~variáveis na Vercel~~ (20/10/2026).
2. Auth → URL Configuration: incluir as URLs da Vercel em *Redirect URLs* para os links de confirmação e de nova senha voltarem ao jogo.
3. E-mail: o SMTP padrão do Supabase envia poucos e-mails por hora; para lançar, configurar SMTP próprio.
4. Opcional: `ANTHROPIC_API_KEY` (modelo melhor para conversa e extração) — hoje usa `GROQ_API_KEY`.
5. Captcha no login anônimo antes de abrir ao público.
