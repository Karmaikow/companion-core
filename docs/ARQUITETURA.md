# Companion Core — Arquitetura (v2, baseada no GDD v0.2)

## Decisão de stack

| Camada | Escolha | Por quê |
|---|---|---|
| Cliente | **Three.js + React Three Fiber + TypeScript (Vite)** | Cenário e personagens 3D em visual anime (ver "Direção de arte"). Roda leve no navegador e no celular (o GDD exige PC, web e mobile); empacota para lojas com Capacitor. |
| UI | React (DOM) sobre o canvas | Chat, diário, memórias e inventário são interfaces de texto — DOM é mais acessível e barato que UI dentro do canvas. |
| Regras | `shared/rules` — TypeScript puro, sem dependências | Mesmo código no cliente (modo local), na Edge Function e no futuro servidor de simulação. Testado com Vitest. |
| Back-end MVP 1 | **Supabase** (Postgres + RLS + Edge Functions + Auth) | Persistência, eventos imutáveis, proveniência de memórias; clientes só leem, toda escrita passa pela função `refuge`. |
| IA | Provedor plugável (Anthropic → Groq → offline) | A IA **propõe** (fala, descobertas, memórias em JSON); as regras **decidem**. Sem modelo, o respondedor offline mantém o jogo funcionando. |
| Hospedagem do cliente | Vercel | Estático; sem lógica de jogo. |
| MVP 2+ (mundo vivo) | Servidor de simulação persistente (Colyseus ou SpacetimeDB) em Fly.io/Railway | Vercel/Edge Functions não mantêm loop contínuo. O servidor roda o tick determinístico (navegação, dano, coleta) e chama a IA só para planejamento e reflexão (GDD 10). |

Alternativas avaliadas: **Godot 4** (ótimo editor, mas export web pesado, só renderizador Compatibility e desempenho fraco em navegador mobile); **Phaser** (2D puro, não entrega a profundidade 3D); **Unity** (WebGL pesado no mobile); **Unreal 5** (sem export web).

## Direção de arte (v1.3)

Cenário 3D com personagens 3D em visual anime. Fantasia aconchegante e clara (substitui a referência Torchlight II da v1.2,
considerada escura demais): céu azul-claro, grama viva, pedras lavanda, cerejeiras e menta, noite azul-lavanda (nunca preta),
fogo e cristais com brilho suave.

**Render (testado no lab "Clareira do Refúgio")**
- Luz em tons (MeshToonMaterial com rampa de 3–4 degraus) em todo o cenário e nos .GLB importados; o estilo original do
  arquivo continua disponível para comparação.
- Personagens: contorno por casco invertido (funciona com esqueleto, compartilha os ossos) + brilho de borda (rim light) que
  muda de cor com o dia/noite.
- Vento no vertex shader para vegetação: base presa, topo solto, fase por cópia. Vale para a grama procedural e para .GLB
  (detectado pelo nome: grama/tufo/flor → forte; árvore/arbusto → suave; pedra e objetos → sem vento).
- Um .GLB de grama pode ser espalhado pela clareira como malha instanciada nos mesmos pontos da grama procedural.
- Objetos altos somem quando ficam entre a câmera e o Companion.
- Modelos de geradores (Tripo/Meshy) chegam com ~1 m: árvore é escalada para ~3 m e tufo para ~0,45 m.

**Orçamento**
- Tufo para espalhar: idealmente 100–400 triângulos (os tufos atuais têm ~4 mil e limitam a densidade).
- Companion: até ~8 mil triângulos e textura de 1024 px no celular (a Mayuna do Tripo tem ~38 mil e 2048 px; usar a opção
  de baixa contagem de polígonos do gerador ou decimar no pipeline).

**Mundo procedural por seed** (`shared/rules/worldgen`, PRNG semeado, nunca `Math.random`)
- Voronoi → biomas; Simplex → alturas e variação de cor; BSP + MST → rotas conectadas.
- WFC no nível de **chunks** pré-montados no Blender (bordas compatíveis), não peça a peça.
- Poisson Disc espalha props e vegetação dentro do chunk. Geração por chunks com bordas fixas para o mundo crescer.

**Assets (.GLB)**
- Escala em metros, Y para cima, pivô na base do objeto, normais corretas.
- Props: até ~3 mil triângulos; chunks: até ~20 mil; texturas 512–1024 px (atlas quando possível).
- Compressão no pipeline: `gltf-transform` (meshopt + KTX2).
- Cenário e props sem animação; criaturas com rig do gerador ou partes nomeadas (`body`, `head`, `wing_l`, `tail`...).

**Câmera e orçamento mobile**
- Perspectiva, FOV 30–40°, inclinação ~45–55°, afastada; o jogador gira a câmera.
- 2–4 luzes pontuais dinâmicas; sombra só da luz principal; níveis de qualidade (no baixo, sem sombra e sem bloom).

## Refúgio = Clareira (v1.4)

O Refúgio deixou de ser uma sala fechada: é uma clareira por seed (`client/src/scene/world.ts`, seed do Companion),
cercada de pedras lavanda e árvores. Nasce só com o altar e o círculo de runas; as peças de `refugeFeatures()` surgem nela:
fogueira e postes de lanterna (vínculo), cristais, recanto de leitura (no lugar da estante), plantas, peça da essência,
ninho, caldeirão. A "janela para o mundo" virou a **passagem na muralha**: só abre (com trilha) depois do primeiro sonho.
Dia e noite seguem o relógio do jogo (noite azul-lavanda). Materiais originais dos modelos (o filtro anime ficou só no lab).
- Assets do usuário (Tripo) otimizados com `gltf-transform` (meshopt + WebP, texturas 1024/512): de ~17 MB para ~670 KB,
  em `client/public/assets/refuge/`. Espalhados como malhas instanciadas; vegetação com vento no vertex shader.
- Árvores altas entre a câmera e o centro somem. Câmera gira arrastando, roda/pinça aproxima.
- Teste rápido de modelo: `/?modelo=corpo.glb,andando.glb` (arquivos servidos pelo próprio site).

**v1.5:** a clareira ficou limpa: só a base do altar (círculo de runas) e a fogueira. A imagem de referência aprovada vai
para o retrato da placa de nome (não substitui o núcleo). Conversa sem janela, só os balões; a fala aparece num balão sobre a
cabeça do Companion (drei `<Html>`). Com modelo 3D: WASD/setas conduzem o Companion pela clareira (Shift corre, se houver
animação "correndo"), a câmera segue e o passeio sozinho volta depois de um tempo parado.
Envio de .GLB na Fábrica: o navegador não dá tipo ao arquivo; o cliente reembala como `model/gltf-binary` (o bucket recusa
`application/octet-stream`).

## Estúdio de Biomas (v1.6)

Painel do ADM → aba **Biomas** (`/#/admin/biomas`). Cada bioma (tabela `biomes`, RLS: todos leem os publicados, só
administradores escrevem) tem paleta (grama, terra, pedra, céu e névoa de dia e de noite), densidade da grama leve,
muralha de pedras e a lista de modelos .GLB (papel: árvore, pedra, grama, planta, marco, objeto; zona: dentro, borda,
fora, em todo lugar; altura mín–máx; quantidade; vento). Os .GLB vão para o bucket público `world-assets`
(`biomes/<slug>/...`). A prévia 3D usa o mesmo código do jogo (`client/src/scene/Biome.tsx`). O bioma **refugio**
publicado vira o cenário do Refúgio (`App` busca ao abrir; sem ele, `REFUGE_BIOME` de fábrica). Regras e normalização
em `shared/rules/biome.ts` (`sanitizeBiome`). Os demais biomas entram no jogo quando o mundo abrir (MVP 2).

**Colisão (v1.6):** círculos no chão (`colliders` em `world.ts`): muralha, pedras, troncos, marcos, objetos e a fogueira
bloqueiam; grama, plantas e o que tem menos de ~45 cm não. O altar é plataforma (o Companion sobe). Destino bloqueado:
desiste depois de ~0,6 s encostado. Clique/toque no chão para andar até lá; WASD/setas continuam valendo.
"Parado" que na verdade anda (o Tripo às vezes exporta o rig do corpo já com a animação de andar) é descartado.

## Companion World (v1.7)

O mundo aberto além da passagem na muralha. Por enquanto roda no cliente (o servidor de simulação do MVP 2 vai usar
o mesmo gerador). Botão **Companion World** no topo do Refúgio quando o Companion tem modelo 3D e a passagem está aberta
(primeiro sonho). Para testar sem a quest: `?mundo`.

- Gerador puro `shared/rules/worldgen.ts` (`makeCompanionWorld(WORLD_SEED, biomas)`), seed única: todo mundo anda no
  mesmo mundo. Grade de 7×7 regiões de 90 m (~630 m), Voronoi com bordas tortas; o sítio (0, 0) é o **Portal do
  Refúgio** no bioma de casa, e os vizinhos dele são de outros biomas. Morros fecham a borda do mundo.
- Regiões: os biomas publicados com **"Aparece como região do Companion World"** ligado (Estúdio). Com menos de 3,
  entram as regiões de reserva `WORLD_FALLBACK_BIOMES` (Bosque Âmbar, Colinas Lavanda — os mesmos modelos com outra paleta).
  O controle **Relevo no mundo** (`settings.hills`) define plano, colinas ou morros; na borda entre regiões tudo se mistura.
- Trilhas ligando todas as regiões (testado), pedras-guia com nome em cada região (48 lugares). Chegar perto descobre o
  lugar (comemoração + mapa). As descobertas ficam neste navegador por enquanto (vão para o servidor no MVP 2).
- Vegetação por chunk de 16 m, densidade tirada do próprio bioma (a quantidade da clareira ÷ a área da zona × fração por
  papel em `WORLD_ROLE`); zonas viram campo aberto (dentro), mata (fora) e meio-termo (borda) por um ruído de floresta.
  Cada modelo vira uma malha instanciada só, com reserva que cresce; grama a 1 chunk, árvores e pedras a 3.
- Cena `client/src/scene/World.tsx`: chão em chunks com normais sem costura, luz e sombra seguindo o Companion, névoa
  escondendo a borda, câmera que sobe quando um morro fica na frente. Mapa no canto (toque amplia o mundo inteiro).
- **Explorar sozinho**: o Companion corre em trechos até a pedra-guia mais perto ainda não descoberta, contornando o que
  travar. Primeiro passo da autonomia (GDD: agentes como protagonistas).
- Voltar: botão ou pisar no portal depois de se afastar.

**Refúgio de cada Companion:** tabela `companion_biomes` (dono lê, ADM escolhe). Na Fábrica, cada Companion tem
"Refúgio deste Companion": padrão (`refugio`) ou qualquer bioma do Estúdio — de preferência um com "Aparece no mundo"
desligado, feito só para ele. O jogo usa: o próprio → o `refugio` publicado → o de fábrica.

## Refúgios × Regiões do mundo, aparência dos modelos (v1.8)

- Cada bioma tem um **tipo** (`settings.kind`): **Refúgio** (cenário em volta do altar: o `refugio` é o padrão de todos;
  os outros a Fábrica dá a um Companion) ou **Região do mundo** (vira várias regiões do Companion World). O Estúdio lista
  os dois grupos separados. Biomas antigos: `refugio` e os que tinham "aparece no mundo" desligado viram Refúgio.
- Regiões têm **Relevo**, **Névoa** (normal → densa) e **No ar** (vaga-lumes, brasas, neve, folhas, pétalas, esporos —
  `Ambient` em `Biome.tsx`, sempre em volta do Companion). Região nova já começa com os modelos do Refúgio.
- **Aparência por modelo** (`shared/rules/look.ts`, shader em `client/src/scene/look.ts`): matiz, saturação, luz,
  contraste, tinta e brilho próprio, sem editar o .GLB. Predefinições: Vulcânico, Cinzas, Gelo, Outono, Encantado,
  Sombrio, Deserto, Cristal. Fica em uniforms: mexer nos controles não recompila; encadeia com o vento. Vale para os
  modelos dos biomas e para as criaturas do Invocador. As regiões de reserva já usam (Bosque Âmbar com árvores de outono,
  Colinas Lavanda com pedras encantadas).

## Forja de Batalha (v1.8)

Painel do ADM → **Forja de Batalha** (`/#/admin/forja`, tabela `skills`). Segue `claude/batalha-v1.md`.
- Habilidades **genéricas** (`shared/rules/combat/skills.ts`): cada uma pede uma essência (ou nenhuma = neutra, na cor do
  Companion) e corpos (ou todos). Forma (golpe, cone, linha, área no alvo, projétil, aura, investida, salto), alcance,
  raio/abertura, dano, cura, energia, recarga, aviso no chão, estado aplicado (encharcado, queimando, enraizado, lento,
  ofuscado, sombreado, atordoado, protegido, acelerado), animação (só clipes que todo rig tem) e efeito visual.
- Catálogo inicial com 26: golpe básico, 5 de forma (Investida, Rasante, Bote, Guarda, Onda), 2 por essência e a
  Suprema (Ressonância). Botão "Carregar o catálogo inicial" publica tudo de uma vez.
- `kitFor(catálogo, {essência, corpo, vínculo})` monta o kit: básico, até 2 de essência, forma, suprema; o resto fica em
  "abre depois". Testado: qualquer essência × qualquer corpo recebe kit completo no vínculo 8.
- `affinity` (anel das sete + luz/sombra, ×1,25 / ×0,8) e `expectedDamage` (dano × atk/(atk+def)).
- Prévia (`client/src/scene/SkillFx.tsx`): aviso lavanda enchendo, efeito por estilo, bonecos de treino piscando, dano
  esperado contra um boneco com essência à escolha. "Kit de exemplo" mostra o kit por essência, corpo e vínculo.

## Invocador de Monstros (v1.8)

Painel do ADM → **Invocador de Monstros** (`/#/admin/invocador`, tabela `creatures`, arquivos em
`world-assets/creatures/<slug>/`). As criaturas são as Brumas do design de batalha (acalmadas, não mortas).
- `shared/rules/creatures.ts`: corpo (.GLB + animações, imagem/sprite ou corpo de névoa na cor dela), aparência,
  essência, tipo de corpo, arquétipo, temperamento, estilo, níveis, atributos (crescem 8%/nível), altura, velocidade,
  percepção, habilidades da Forja com **peso** (frequência; `pickCreatureSkill`), regiões com peso, horário, grupo,
  raridade e **drops** (`rollDrops`). "Sugerir pela essência e corpo" usa o `kitFor`.
- `chunkSpawns`: aparições determinísticas por chunk (~1 grupo a cada 9 chunks, longe das trilhas, portal e marcos).
- No Companion World (`WorldCreatures.tsx`) elas já andam conforme o temperamento: passivo passeia e olha, medroso
  foge, territorial defende o canto, agressivo vem até o Companion (com "!" e animação de ataque). Sem luta ainda.
  Sem criaturas publicadas, entram 3 de reserva (Bruma de Musgo, Fagulha — só à noite, Lobinho de Geada).
- Lab sem login (dev): `client/forge-lab.html` com o Vite em `--port 5199` (prévias de habilidades e criaturas).

## Companion 3D e animações (v1.4)

- A Fábrica recebe o **modelo .GLB** e **várias animações .GLB** do mesmo rig (o Tripo exporta uma por arquivo). O tipo vem
  do nome do arquivo (`shared/rules/anim.ts`): parado, andando, correndo, ataque, ferido, desmaiado, feliz, dormindo, pulo,
  comendo; dá para corrigir no painel. `visual_jobs.result = { art, model: {path}, anims: [{path, kind, name}] }`.
- Aprovado, o jogo recebe URLs assinadas e o `CompanionModel` junta os clipes no mesmo esqueleto (cópia com SkeletonUtils),
  descobre a frente pelo osso da cabeça e passeia pela clareira: anda, para, dorme na madrugada, comemora conquistas.
- **Passo sem patinar**: a animação de andar é tocada no lugar e a velocidade de andar vem do deslocamento da raiz por
  segundo (`strideSpeed`). Patas "arrastando" eram o Companion andando mais rápido que o passo da animação.
- Rigs com índice de osso inválido são saneados (não derrubam a cena).

## Criação do personagem (pipeline v1.3)

1. **Contrato de identidade (JSON)** gerado no despertar → fila `visual_jobs` (o jogador nunca vê o JSON).
2. **Imagem de referência**: prompt montado do contrato (`buildArtPrompt`), pose neutra, luz uniforme, fundo cinza-claro
   liso, o que os geradores de imagem→3D leem melhor. O visual anime vem do shader do jogo, não da imagem.
3. **Modelo 3D** a partir da imagem (Tripo ou Meshy), com textura.
4. **Rig + animação**: auto-rig do gerador pelo tipo de corpo. Tripo tem 7 tipos (bípede, quadrúpede, hexápode, octópode,
   ave, serpente, aquático) e presets de animação (andar, parado, correr…); Meshy cobre humanoide e quadrúpede. Mapa inicial:
   pássaro → ave, touro/felino → quadrúpede, serpente → serpente, mística → bípede.
   Sem clipes, o jogo anima por procedimento: respiração, quique, inclinação e ossos/partes nomeadas (cabeça, cauda em
   corrente, membros).
5. **Aprovação na Fábrica** e entrega ao jogo; enquanto isso o Companion aparece como corpo de partículas.

Custo: geração de modelo + rig + 2–3 animações por Companion; pode ser coberto por uma pequena contribuição do jogador.

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

- Grants: `studio_admins` também precisa de `select` para o `service_role` (migração `20261021001500`), senão a Fábrica
  responde "Esta conta não é administradora".
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
6. Direção de arte: kit do primeiro bioma (10–15 chunks, ~40 props). Tufo de grama com 100–400 triângulos para encher mais a clareira.
