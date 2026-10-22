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
Dia e noite seguem o relógio do jogo (noite azul-lavanda). Sem desfoque nas bordas (o tilt-shift saiu em 21/10). Materiais originais dos modelos (o filtro anime ficou só no lab).
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
- `shared/rules/creatures.ts`: corpo (.GLB + animações, imagem/sprite ou slime procedural na cor dela), aparência,
  essência, tipo de corpo, arquétipo, temperamento, estilo, níveis, atributos (crescem 8%/nível), altura, velocidade,
  percepção, habilidades da Forja com **peso** (frequência; `pickCreatureSkill`), regiões com peso, horário, grupo,
  raridade e **drops** (`rollDrops`). "Sugerir pela essência e corpo" usa o `kitFor`.
- `chunkSpawns`: aparições determinísticas por chunk (~1 grupo a cada 9 chunks, longe das trilhas, portal e marcos).
- No Companion World (`WorldCreatures.tsx`) elas já andam conforme o temperamento: passivo passeia e olha, medroso
  foge, territorial defende o canto, agressivo vem até o Companion (com "!" e animação de ataque). Sem luta ainda.
  Sem criaturas publicadas, entram 3 de reserva (Bruma de Musgo, Fagulha — só à noite, Lobinho de Geada).
- **Slime procedural** (`client/src/scene/Slime.tsx`), para criaturas sem modelo: domo de gelatina (perfil de gota de
  goma), material com verniz e borda luminosa (fresnel), contorno translúcido, reflexos pintados, núcleo e bolhinhas por
  dentro, rosto desenhado em canvas e colado na superfície (DecalGeometry). Rosto pelo temperamento (calmo, tímido com
  bochechas, sério) e pela ação (bravo com marca de raiva ao atacar, feliz, ferido, dormindo; pisca). Corpo em mola:
  pula ao andar, achata ao pousar, estica no ataque. Enfeite no topo pela essência (broto, chama, cristal, gota, auréola,
  chifrinhos, faísca, pedrinha, redemoinho).
- Lab sem login (dev): `client/forge-lab.html` (`?slimes` mostra os rostos e enfeites) com o Vite em `--port 5199` (prévias de habilidades e criaturas).

## Companions humanoides: Classes/Espécies (v1.9)

Decisão (21/10): **todo Companion é humanoide**. Um rig só (o humanoide do Tripo/Mixamo) e todas as animações prontas
de humanoide servem para todos. Rig de ave e de quadrúpede, que davam muito trabalho, ficam para os monstros (e para um
futuro sistema de pets).

- As famílias descobertas na conversa viram **Classes** (`shared/rules/species.ts`), mantendo as chaves antigas nos
  contratos: serpente → **Dracônica**, passaro → **Alada**, felino → **Feral**, touro → **Taurina**, mistica → **Feérica**.
  Cada uma tem traços que vão no modelo (chifres, orelhas, escamas, penas no cabelo, orelhas pontudas), duas essências
  afins (+10%), habilidade de forma (Chicote de Cauda, Rasante, Bote, Investida, Guarda) e tendências de atributo.
- **Cauda e asas não vão no modelo 3D**: o jogo desenha e anima por código (`client/src/scene/Appendages.tsx`),
  presas ao osso do quadril/peito. Cauda = corrente com física de mola (balança, arrasta, enrola a ponta, não atravessa
  o chão): escamosa com barbatana (dracônica), peluda (feral), fina com tufo (taurina), de penas, de luz. Asas de pena,
  de dragão ou de fada batem devagar paradas e mais rápido andando. A descrição do jogador ajusta ("dragão com asas"
  ganha asas de dragão; "sem cauda" tira). Lab: `client/forge-lab.html?cauda`. Teste no jogo: `?cauda=scaly&asas=dragon`.
- **Velocidade por classe** (`speed`, `speciesSpeed`): Feral 1,25× · Alada 1,15× · Feérica 1,05× · Dracônica 1× ·
  Taurina 0,88×. O Companion anda no dobro do passo natural da animação × a classe; a animação acelera junto
  (`timeScale`), então os pés não patinam. A Agilidade da árvore pode somar aqui quando os atributos existirem.
- **Ficha do personagem** (`characterSheet`): o JSON que a Fábrica mostra — humanoide, classe, traços, cauda/asas.
  Dois prompts: **referência do modelo 3D** (A-pose, roupa justa, sem cauda e sem asas; a folha de vistas sai dela) e
  **arte do retrato** (com cauda e asas). O prompt do modelo não descreve a cauda/asas nem para negar: geradores de
  imagem tendem a desenhar o que é citado.
- Forja: habilidades têm **classes** (Companions) e **corpos** (monstros). Botão "Atualizar com o catálogo novo" põe as
  classes nas habilidades já publicadas e cria o Chicote de Cauda.

**Atributos (rascunho, a evoluir com a batalha):** Vida, Energia, Poder, Defesa, Agilidade, Sintonia. As classes já
anotam tendências (ex.: Dracônica +Sintonia +Defesa −Agilidade; Taurina +Vida +Defesa −Agilidade) e a árvore dá bônus em
%; os números base vêm quando a simulação de luta existir.

## Pontos e árvore de habilidades (v1.9)

Aba **Habilidades** no jogo (`client/src/ui/SkillTreePanel.tsx`; regras em `shared/rules/combat/tree.ts`).
- **Pontos:** 1 por nível de vínculo (o nível de combate vai somar). Redistribuir é de graça.
- **Árvore** montada do catálogo publicado na Forja, da essência e da classe: três galhos (Essência, Classe, Vínculo),
  5 fileiras cada (vínculo 1, 2, 3, 5, 8). Nós de habilidade (abrem), de melhoria (até 3 níveis: +15% de efeito e
  –8% de recarga por nível) e passivas (% em atributos). No fim: segunda habilidade da essência, "Linhagem" (afinidade da
  classe de +10% para +20%) e a Sintonia suprema.
- `canSpend` explica por que um ponto não entra; `validateAllocation` refaz a distribuição na ordem das fileiras (ao
  carregar e, no futuro, no servidor antes da luta); `treeEffects` dá habilidades com nível e bônus.
- Guardado em `companion_skill_alloc` (dono grava; ainda sem validação no servidor — entra com `battle.resolve`);
  offline, no navegador. A árvore abre quando a forma (classe) é descoberta.

## Armas, equipamentos e a Forja (v1.10)

- Regras em `shared/rules/equipment.ts`. Só peças rígidas presas a ossos do rig humanoide (mão direita/esquerda,
  cabeça, peito): espada, faca, maça, lança, cajado, varinha, arco, escudo, grimório, orbe, chapéu, tiara, laço, coroa,
  mochila, aljava, amuleto, anel. Roupa fica de fora (o corpo é uma peça só).
- Atributos leves (% × raridade: comum 1, incomum 1,5, rara 2,2, lendária 3,2). O tipo da arma escolhe a animação e o
  golpe básico (`basicAttack`: alcance, cadência, dano, duas mãos); armas afins da classe dão +5%.
- **Arco com tiro carregado** (`bowShot`): segurar carrega em 1,6 s (curva suave); alcance 30% → 100%, dano 0,5× → 2×,
  flecha mais rápida; carga ≥ 95% = "perfeita" (+0,25× e flecha dourada). Efeito: faíscas girando para a flecha, traço
  no chão até onde vai, anel que cresce, corda que estica; ao soltar, flecha em arco com rastro. Mira pela câmera com
  ajuda para o alvo mais perto.
- **Obtenção (decisão de 21/10):** itens são super raros e só nascem na **Forja**, e só a classe **Taurina** forja
  (`canForge`, `forgeCheck`), com receita (ingredientes = drops dos monstros, ex.: Fragmento de Bruma, Pelo gelado) e
  vínculo mínimo. Por enquanto ninguém tem ingredientes (a coleta chega com a batalha); `?arsenal` libera tudo para teste.
- Modelos gerados por código (`ItemModel.tsx`) ou .GLB; presos por `Equipment.tsx` (posição do osso; orientação do corpo
  + o quanto o osso girou desde o descanso). O rig Mixamo do Tripo (`mixamorig:RightHand`, `Head`, `Spine2`) é encontrado
  pelo nome. Pegada (posição/giro/tamanho) ajustável no Arsenal; vale para todos (mesmo rig).
- Ataque: botão redondo (ou F/Espaço; segurar no arco). Golpes, magia e flechas acertam alvos registrados (boneco de
  treino no Refúgio, criaturas no mundo — reagem e mostram o número; ainda sem vida/luta).
- Tabelas `items` (catálogo, RLS de ADM) e `companion_equipment` (dono grava). Painel: **Arsenal**.

## Animações num arquivo só (v1.10)

O Tripo exporta várias animações num .GLB com o modelo (deixe "Animação no Lugar" desligado: o jogo trava a posição e
mede o passo). O tipo vem do nome de cada clipe (`animKind`, palavras em pt e en; palavras longas valem mesmo grudadas,
como "cruzadasblocking"). Golpes por arma (`attackVariant`: "sword slash" → espada, "dagger stab" → faca) e o jogo usa o
da arma equipada. Tipos novos: magia, arco/tiro, esquiva, defender, levantando, sentado, pegando do chão, acenando,
conversando. A Mayuna humana (17 animações, rig Mixamo, 18 mil triângulos) foi de 8,6 MB para 1,6 MB com
`gltf-transform optimize --texture-compress webp --texture-size 1024 --compress meshopt`.

## Clima (v1.10)

`shared/rules/weather.ts`: limpo, sol forte, chuva, tempestade, névoa, neve, areia. Automático por janelas de tempo
(sorteio pelo peso global × peso do bioma; mesma região, mesmo clima para todos) ou fixo pelo ADM
(`game_config.values.weather`). Cena: `Weather.tsx` (partículas em volta do Companion, névoa e céu puxados para o clima,
relâmpago) + `WeatherOverlay` (tinta de tela). Transição suave. Teste: `?clima=chuva`.

## O Administrador (v1.10)

O painel passou a se chamar **O Administrador**: Companions (Fábrica), Biomas, Forja de Batalha, Invocador de Monstros,
Arsenal e **Servidor** — XP (multiplicador sobre os valores base, limites, curva de níveis com prévia) e clima. O
servidor lê `game_config.values` a cada mensagem: muda na hora.

## Efeitos das habilidades (v1.11)

Os efeitos deixaram de ser pontos com textura e passaram a usar um motor próprio em `client/src/scene/vfx/`, com visual cartoon:

- **engine.ts**: `VfxStore` (partículas, fitas, `after`, `every`) por cena. O jogo usa `gameVfx`; a prévia da Forja cria a
  sua.
- **VfxLayer.tsx** desenha a cena:
  - Cada partícula é um quadrado instanciado com a forma desenhada no shader: brilho, fumaça em camadas (duas cores, contorno, se desfaz por ruído), faísca esticada pela velocidade, estrela, onda de choque, explosão estrelada, cristal, folha, gota e orbe.
  - Duas malhas: uma normal (formas sólidas) e uma aditiva (brilho e ondas, sem teste de profundidade para não serem cortadas pelo chão).
  - As fitas (rastros, raios e cortes) são tiras viradas para a câmera, com núcleo branco.
- **recipes.ts** monta os efeitos em camadas:
  - `burst`: clarão, estrela, ondas no ar e no chão, faíscas e os detritos do estilo.
  - `Missile`/`missile`: orbe, auréola, rastro e partículas pelo caminho.
  - Também `area`, `cone`, `beam`, `slash` (meia-lua que varre), `aura`, `bolt` e `Charge` (carga do arco).
  - Cada um dos 11 estilos tem sua paleta e seus detritos: fumaça de fogo que vira fumaça cinza, cristais de gelo, pedras, folhas, gotas, raios recortados, estrelas de luz, fumaça de sombra.
- **Onde é usado:**
  - Prévia da Forja (cada forma dispara a sua receita).
  - Combate no Refúgio e no mundo: corte, magia com o estilo da essência da arma, flecha com rastro, acerto e carga.
- **Lab:** `forge-lab.html?vfx=missil|area|cone|corte|aura|feixe&so=chamas,gelo`, com `&congela=0.15` para parar num instante exato (útil para capturas).

## Barra de habilidades 1–9 (v1.12)

- **Espaços e teclas:** 9 espaços para as habilidades abertas na árvore. Lança com as teclas 1–9 ou tocando no espaço.
- **Montar a barra:**
  - Espaço vazio: abre a escolha. Botão direito ou segurar: tira da barra.
  - Habilidade nova entra sozinha no primeiro espaço livre. Uma que foi tirada não volta sozinha.
  - A barra fica salva neste navegador, por Companion.
- **Recarga:** vale a recarga da habilidade com o desconto dos níveis da árvore, mais a preparação. Aparece como um relógio escurecendo o ícone.
- **Estado compartilhado:** `client/src/ui/skillState.ts` guarda o catálogo, a distribuição de pontos e a barra. A árvore e a barra leem o mesmo estado, e `useSkillSync` roda uma vez no App.
- **No jogo:**
  - O pedido vai por `requestSkill`. O Companion vira para o alvo mais perto, usa a animação da habilidade (ou "lançando magia" quando existe e a habilidade é à distância) e espera um pouco antes de voltar a passear.
  - Investida e salto deslocam o corpo.
  - `runSkill`, em Combat.tsx, mostra o aviso no chão para área, salto e aura, roda a receita de efeito do formato e acerta os alvos dentro da forma: corpo a corpo, cone, linha, círculo, aura e o primeiro alvo no caminho do projétil.
  - Dano: `expectedDamage` × (1 + 15% por nível). A cura aparece em verde.
- **Ainda não tem:** gasto de energia e efeitos de status. Vêm com a batalha.

## Mira pelo mouse e ritmo do ataque (v1.12)

- **Mira no PC:** quando a última interação foi com o mouse (`aim.mouse`, em Combat.tsx), o golpe, a magia, o arco e as habilidades miram no ponto do chão sob o cursor. Área e salto caem nesse ponto, até o alcance. No celular, continua a mira automática no alvo mais perto.
- **Animação do golpe:** acelera para caber no ritmo da arma (`timeScale` = duração × cadência × 1,15, entre 1,3 e 3). O corpo fica preso só até o golpe sair, no máximo 0,75 s.
- **Pedido guardado:** o aperto fica guardado por 0,35 s, então o clique no fim do golpe anterior não se perde.
- **Segurar F ou Espaço:** continua atacando no ritmo da arma.

## Controles, barras, vida dos monstros e campos de treino (v1.13)

- **Controles no PC:**
  - O Companion corre por padrão; Shift faz andar. Vale para teclado e para clique no chão.
  - Espaço pula: custa 15 de stamina e funciona andando.
  - C senta e levanta. Mexer também levanta.
  - Segurar E defende: escudo de luz na frente, anda devagar, corta 75% do dano e gasta 14 de stamina por segundo.
  - F ataca. O botão de ataque só aparece em telas de toque; no celular também há botões de pular, defender e sentar.
- **Barras** (`scene/vitals.ts` e `ui/VitalsHud.tsx`), sob o nome do Companion:
  - **HP:** cai com os golpes das criaturas. Zerou, o Companion desmaia por 4 s e volta com metade.
  - **SP:** gasto pela energia das habilidades da barra 1–9; volta 3 por segundo.
  - **Stamina:** gasta pelo pulo, pelo golpe (6) e pela defesa; volta 28 por segundo depois de 0,7 s.
  - **Vínculo:** % até o próximo nível.
  - Os máximos vêm da tendência de atributos da classe, dos bônus da árvore e do vínculo.
- **Monstros no mundo** (`WorldCreatures.tsx`):
  - Vida no nível deles. O dano passa pela defesa (`mitigate`: 100 de defesa = metade).
  - A barra de vida aparece sobre o nome depois do primeiro golpe. Provocados, vêm brigar (o passivo também).
  - Zerou: explosão no estilo da essência mais uma nuvem de névoa, os itens sorteados aparecem flutuando e o monstro volta em 45 s.
  - Agressivos e territoriais golpeiam o Companion no ritmo da velocidade de ataque.
- **Invocador:**
  - Campos de atributos: vida, ataque, defesa, agilidade, velocidade de movimento e velocidade de ataque (`stats.atkSpeed`).
  - **Árvore de habilidades:** cada habilidade abre num nível e pode depender de outra (`level`, `after`; `creatureSkillsAt`, `pickCreatureSkill(c, r, nível)`).
- **Animações:**
  - `play()` apagava as outras animações pelo nome. "attack" e "attack:faca" são o mesmo clipe, então o próprio golpe se apagava (braços abertos) e às vezes a corrida também (deslizava parado). Agora compara o objeto da animação.
  - A cauda acompanha o deslocamento do quadril (só o balanço fica na física) e tem peso; antes boiava ao correr.
- **Administrador:**
  - **Companions:**
    - Cada pedido mostra "Habilidades e animações": o ataque básico e as habilidades da árvore daquele Companion.
    - Para cada um, escolhe-se qualquer clipe do .GLB, com prévia 3D.
    - Grava em `companion_skill_anims` (o ADM grava, o dono lê). O jogo toca o clipe escolhido (`clip:<nome>` vira uma animação própria, tocada uma vez).
    - Corrigido: os dados dos Companions apareciam em todas as abas.
  - **Forja:** "Campo de treino" escolhe o modelo de qualquer Companion enviado. Ele lança cada habilidade com a animação dele enquanto os números são editados.
  - **Arsenal:**
    - "Campo de treino" mostra o Companion escolhido segurando o item e golpeando em loop (corte, magia ou tiro com carga).
    - A pegada pode ser ajustada só para aquele modelo (`gripByModel[id do Companion]`, `gripFor`); os outros usam a pegada padrão.
    - No envio de .GLB dá para reaproveitar os modelos já enviados para o mesmo tipo de arma.
  - Componente comum: `scene/TrainingModel.tsx`. Lista de modelos: `ui/companionModels.ts` (via `admin.jobs`).
- **Câmera dos campos de treino** (Forja e Arsenal): arrastar gira, roda ou pinça aproxima (OrbitControls, sem deslocar).
- **Pegada no Arsenal:** fica logo abaixo do campo de treino, para ajustar vendo a arma na mão.
- **Tempo de volta do monstro:** no Invocador, em "Onde e quando aparece", `respawn` em segundos (5 s a 1 h; padrão 45 s).
- **Lab:** `forge-lab.html?treino=/arquivo.glb` mostra os dois campos de treino com um modelo local.

## Movimento por código para monstros .GLB sem rig (v1.16)

- **O que é:** `CreatureDef.motion` vale `auto` (pelo corpo: ave flutua, serpente ou aquático rasteja, o resto ginga) ou um estilo fixo:
  - saltitar: pulinhos que amassam ao cair;
  - gingar: balança de um lado para o outro;
  - flutuar: paira e inclina ao voar;
  - rastejar: serpenteia.
- **Como funciona** (`Creature.tsx → proceduralMotion`):
  - O modelo fica num pivô no pé, e cada ação tem um movimento próprio: andar, correr, atacar (recua e avança), levar dano (recua e treme), comemorar (pula girando) e dormir (deitado, respirando).
  - Sem animações, o corpo inteiro se mexe assim e respira parado. Com animações, só as ações que faltam no modelo usam o movimento por código.
- **No Invocador:** o campo "Movimento por código" aparece na seção do modelo. A prévia mostra o resultado trocando a ação.
- **Lab:** `forge-lab.html?semrig=/arquivo.glb&acao=walk|attack|hurt|happy|sleep` mostra os 4 estilos.

## Companion que desliza sem animar (v1.15)

- **Causa:** o objeto do modelo (`snap.visualJob.model`) é recriado a cada atualização vinda do servidor. O `CompanionModel` recarregava por identidade, e o modelo novo começava parado enquanto o estado continuava marcando "run". Então `play('run')` saía cedo e ele deslizava pelo mapa.
- **Correção, em três camadas:**
  - recarrega só quando os endereços dos arquivos mudam (`filesKey`, sem o token da URL);
  - modelo novo zera `act`;
  - `play()` só pula se a animação estiver tocando de verdade (`isRunning`).

## Desmaio, cura e monstros sem coleira (v1.15)

- **Desmaio:** com o HP zerado, a stamina zera e enche em 10 s (`DOWN_SECONDS`). O Companion só levanta com a stamina cheia, com pelo menos metade da vida. No centro da tela aparece "Desmaiou", a contagem e a barra de stamina (`FaintCounter`).
- **Cura:** as habilidades de cura (Bolha, Pólen Curativo…) agora somam no HP (`healCompanion`); antes só mostravam o número.
- **Monstros sem coleira:** quem começou a brigar persegue o Companion para onde for, inclusive para fora do bioma. Só desiste quando ele se afasta 2,5× o alcance de percepção; aí volta para casa mais rápido, recuperando 25% da vida por segundo. Antes ficavam presos a 14 m de casa, parados apanhando no limite. Fugindo, vão no máximo a 20 m.

## Colisão pela base real e sem cauda (v1.15)

- **Colisão dos modelos GLB do bioma:** o raio vem da base de verdade do modelo, pelos vértices perto do chão (90º percentil da distância ao centro).
  - Pedras, marcos e objetos: a base até meia altura, com 92% desse raio.
  - Árvores: só o tronco, abaixo de 15% da altura.
  - Antes era 42% da metade da largura e o Companion entrava nas pedras grandes.
  - O centro do círculo é a média dos vértices da base, e não o meio da caixa (troncos fora do centro), e gira junto com cada cópia.
  - Cada monstro colide com o próprio tamanho (`resolveCollisions(p, raio)`) e é empurrado para fora dos obstáculos em todo quadro, inclusive parado ou recém-nascido.
- **Cauda e asas:** as desenhadas por código ficam desligadas no jogo; só o modelo 3D aparece. O código continua, para testes (`?cauda=`, `?asas=`) e para uma versão futura, como cauda no próprio rig.

## Memórias de Combate, ordens, falas e voz (v1.15)

- **Ela sabe que tem corpo:** depois do despertar, o prompt (`PromptContext.body`) diz que ela não é mais uma esfera de luz e descreve a forma dela. A regra de "não pode sair do Refúgio" deixa de valer.
- **Memórias de Combate / Análise de Partículas** (`shared/rules/bestiary.ts`, tabela `companion_bestiary`, ação `combat.kill`):
  - Cada criatura derrotada solta de 1 a 3 partículas, conforme o nível. Com 3 partículas de uma espécie (`ANALYSIS_TARGET`), a análise fica completa.
  - A ficha se revela em camadas: 1) temperamento e descrição; 2) jeito de lutar e habilidades; 3) fraquezas, resistências, atributos e o que solta.
  - Os marcos 1, 3, 5, 10 e 20 de espécies analisadas formam a quest "Análise de Partículas".
  - O primeiro encontro e a análise completa viram memórias de origem `combat`, que entram no prompt na seção MEMÓRIAS DE COMBATE.
  - A ação tem limite de 40 abates por minuto.
- **Ordens pelo chat ou pela voz** (`shared/rules/commands.ts` → `client/src/scene/brain.ts`):
  - atacar, fugir, parar, ficar em paz;
  - caçar ("mate 10 monstros na Floresta Densa");
  - ir até um lugar ("vá até X e me chame quando chegar"; avisa com notificação do navegador se a aba estiver em segundo plano);
  - coletar (ainda responde que não sabe).
  - A ordem vira ação na hora e, se o ajuste permitir, também vai para a conversa com a IA.
- **Falas** (`shared/rules/barks.ts`): frases curtas, sem IA, para ver uma criatura nova ou conhecida, atacar, apanhar, ficar com pouca vida ("Socorro, me ajuda!"), fugir, derrotar, analisar, responder a ordens e passear. O tom muda com os traços (brincalhona, corajosa, serena) e a frequência segue o ajuste "Quanto ela comenta".
- **IA no mundo** (`CompanionModel`, bloco "cérebro"): a postura vem dos Ajustes (só passeia / se defende / caça). Ela escolhe a ameaça ou a presa, se aproxima, ataca e usa habilidades (`aiCast`), e foge quando a vida cai abaixo do limite.
- **Ajustes** (`client/src/settings.ts`, salvo no navegador):
  - clique esquerdo anda ou ataca (no modo ataque, o clique direito anda);
  - mira do ataque e das habilidades pelo mouse ou no monstro mais perto;
  - postura, limite de fuga, frequência das falas;
  - voz das respostas, envio automático do microfone, números de dano.
- **Voz** (`client/src/ui/voice.ts`): usa o navegador, sem custo. A leitura em voz alta usa SpeechSynthesis pt-BR; o microfone usa SpeechRecognition (botão 🎙 na conversa ou segurar V). Funciona no Chrome e no Edge; o Firefox não reconhece fala.

## Veneno (v1.14)

- **Essência:** `veneno` (violeta `#b45cff`, sombra roxa escura e brilhos lilás). Fica fora do anel de afinidades: forte contra Natureza e Água, fraca contra Terra e Luz. Recebe mais dano de Terra e Luz e menos de Natureza e Água.
- **Estado e efeito:** estado `envenenado` (dano por segundo que acumula até 3 doses) e estilo de efeito `veneno`. O efeito tem nuvem tóxica em duas cores, gotas que pingam e bolhas que sobem e estouram; o rastro do projétil é de bolhas.
- **Habilidades:** Cuspe Tóxico (projétil) e Névoa Venenosa (área, abre no vínculo 3).
- **Outros visuais:** enfeite de bolhas nas gosmas de veneno, ícone 🧪 na barra e acento no prompt de arte.
- **No mundo:** os estados com dano por segundo (`envenenado` e `queimando`) agora funcionam nos monstros (`Target.afflict`). Cada segundo mostra o número na cor do estado e uma nuvem saindo do corpo, e o dano passa pela defesa.
- **Pendência:** para um Companion *descobrir* a essência veneno na conversa, a função `refuge` precisa ser publicada de novo. Ela reconhece as essências pelas palavras (veneno, tóxico, peçonha, ácido…).

## Escala e frente do modelo 3D (v1.12)

- **Medida pelos ossos:** o tamanho do modelo é medido com os ossos aplicados (`Box3.setFromObject(model, true)`). Alguns rigs do Tripo trazem a malha "crua" em outra escala: a Mayuna humana media 2 m crua e 0,98 m de verdade, e ficava com metade do tamanho.
- **Frente do humanoide:** humanoide em pé usa a frente em +Z (convenção do glTF, Tripo e Mixamo). De braços abertos ele é mais largo que fundo, e a regra antiga de quadrúpede o girava 90°, fazendo-o andar de lado.

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
- Publicar a função: `npm run sync:rules && node scripts/bundle-refuge.mjs`. O script gera dois formatos:
  - `dist-fn/refuge/index.js`: um arquivo só, em ASCII.
  - Publicação leve: o módulo vai em `client/public/fn/refuge.<hash>.js` (servido pelo site em produção) e o stub em `dist-fn/refuge-stub/` (`index.js` + `deps.js`) o importa. O Supabase embute o módulo remoto no deploy, então a função fica congelada naquela versão. Ordem: commit, merge na `main`, esperar o deploy da Vercel e então publicar o stub.
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
