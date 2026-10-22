# Ecos da Terra — primeira entrega

O jogador sai para buscar um material, encontra oportunidades pelo caminho e volta com recursos, conhecimento e uma
história. A Companion ajuda a perceber e aproveitar essas oportunidades.

Lugar: **Vale dos Ecos**, logo ao norte do Portal do Refúgio no Companion World (centro em x 0, z 30, raio 21 m). Tem
bosque a oeste, riacho no meio (nasce no norte e desce para o sul) e afloramento a nordeste.

## O que está implementado e o que é simulado

| Parte | Situação |
|---|---|
| Regras (materiais, abordagens, ecologia, indícios, cadeia, jardim, receitas, obra, decisão da Companion) | **Implementado**: `shared/rules/ecos.ts` e `ecosPlay.ts`, com 26 testes em `shared/tests/ecos.test.ts` |
| Servidor (função `refuge`, ações `ecos.*`) e banco (tabelas + funções SQL atômicas) | **Implementado e testado no banco** (veja "Testes críticos") |
| Cena 3D do vale, interface de desktop e celular, Companion coletando por intenção, ordens no chat | **Implementado** |
| Modo offline | **Simulado neste aparelho** (`client/src/ecos/localEcos.ts`): mesmas regras, marcado como simulado na tela, nunca enviado ao servidor e sem valor online |
| Multiplayer em tempo real | **Não é MMORPG pronto.** A obra é compartilhada de verdade (uma linha no banco para todos, com transação), mas não há presença de outros jogadores na cena nem servidor de simulação. Os recursos do vale são **individuais** (cada pessoa tem o seu vale), então não há disputa de nó. |
| Caça | **Ainda não.** A categoria existe nas regras (material, conservação, aplicação), sem nós no vale |

## Ciclo

1. **Propósito.** Uma receita, a obra ou um pedido à Companion vira o **objetivo** no topo esquerdo, por exemplo "Madeira flexível para o arco — 2/3".
2. **Explorar.** Andar pelo vale; os recursos a até 14 m (ou já visitados) ficam conhecidos.
3. **Observar indícios.** "A casca brilha azul…" (observação), "a água vem de cima" (hipótese).
4. **Escolher a abordagem.** São 2 ou 3 por recurso, cada uma com tempo, resultado garantido e estimado, risco e efeito no ambiente.
5. **Coletar.** A Companion anda até o recurso e trabalha (animação e som). O servidor confirma e só então os materiais entram na mochila.
6. **Usar.** Fabricar (arco, cinzel, unguento), entregar na obra ou cuidar do jardim.

A coleta comum funciona sem descoberta nenhuma. Cancelar (Esc) antes da confirmação não gasta nada; o que já foi
confirmado nunca se perde.

## Categorias e propriedades

| Categoria | Propriedades | No vale |
|---|---|---|
| Pedra | composição, resistência | Granito Exposto, Cascalho do Riacho |
| Minério | composição, pureza | Veio de Cobre (e às vezes no cascalho) |
| Madeira | flexibilidade, resistência, afinidade | Salgueiro (flexível, água), Carvalho (resistente, terra) |
| Planta medicinal | parte colhida, potência, estabilidade | Erva-de-orvalho: folhas, flores ou raízes |
| Gema | integridade, afinidade | Geodo Rachado: inteira (precisa de cinzel) ou fragmentos |
| Material mágico | efeito, estabilização | Seiva Azul do salgueiro |
| Caça | material, conservação, aplicação | (próxima entrega) |

- **Raridade, qualidade e adequação são coisas separadas.**
  - Raridade: o quanto é difícil achar (comum, incomum, rara).
  - Qualidade: o lote ser comum, bom ou excelente, conforme as faixas das propriedades.
  - Adequação: o lote servir a uma receita (ideal, serve, não serve).
- **Exemplo:** a Madeira de Salgueiro é comum e é a **ideal** para o arco. O Carvalho é resistente e **não serve** para o arco, mas é o certo para o cinzel e para a ponte.
- **Lotes agrupados:** cada propriedade numérica vira uma faixa (baixa < 35, média < 70, alta). A mochila junta os lotes de mesma faixa, então não aparecem centenas de pilhas quase iguais.

## Abordagens (nenhuma domina)

| Recurso | Abordagens |
|---|---|
| Salgueiro | recolher galhos (5 s, preserva) · extrair seiva (8 s, faca, ingrediente mágico) · cortar (12 s, machado, muito volume, ~2 h para voltar) |
| Carvalho | galhos · cortar |
| Erva-de-orvalho | folhas (estáveis, rebrota rápido) · flores (potentes, instáveis) · raízes (potentes e estáveis, a planta some ~1,5 h) |
| Cascalho | peneirar (seixos + 25% de chance de cobre; é onde aparece a pista) · juntar em volume |
| Granito | lascas soltas (sem ferramenta, mais fracas) · quebrar em volume (picareta, rende menos por ~2 h) |
| Cobre | garimpar (pouco, impuro) · escavar o veio (picareta, mais e mais puro) |
| Geodo | fragmentos (picareta) · gema inteira (cinzel, esgota o geodo por ~12 h) |

Um teste confere que, entre as abordagens que dão o mesmo material, nenhuma é melhor em tudo ao mesmo tempo:
rendimento por segundo, rendimento por abundância gasta, dispensar ferramenta e rapidez.

## Ambiente e indícios

- **Ecologia regional sob demanda.**
  - Cada nó guarda só quanto tinha e quando.
  - A abundância de agora é a guardada mais a recuperação por hora, até a capacidade.
  - Nada é atualizado por quadro.
  - A chuva acelera plantas e riacho em 1,5×.
- **Relações que se aprendem:**
  - fragmentos no riacho apontam rio acima;
  - a seiva azul indica água mágica;
  - as flores luminosas da erva crescem perto da água.
- **Estados dos indícios:** Observação (confirmada), Hipótese (suposição) e Descoberta (concluída). Os testes conferem que todo indício aponta para um nó, etapa ou lugar que existe. A IA não cria recursos nem pistas.

## Cadeia de descoberta "A Seiva Azul" (3 etapas)

1. **Surgimento.** Chegar a até 10 m do Salgueiro da Nascente faz aparecer a observação da casca azul. **Observar** (ou coletar) nele confirma a etapa.
2. **Pistas na correnteza.** Peneirar o *Cascalho de Cima* mostra lascas com inclusões azuis. A hipótese passa a ser "há algo a montante", e um marcador "?" aparece no mapa.
3. **A Nascente.** Ao chegar lá, a escolha:
   - **Extrair os cristais:** 2 Quartzo Azul íntegro + 3 Seiva Azul agora; a nascente adormece.
   - **Preservar e cultivar:** cria o **Jardim da Nascente**; nenhum cristal agora.
4. **Registro.** A descoberta vai para o Diário, vira memória da Companion, dá XP de vínculo e ensina a técnica "leitura de inclusões".
5. **Opcional.** A cadeia acontece uma vez por Companion. Ignorar não muda nada no rendimento comum.

## Ponto de manejo: Jardim da Nascente

- **Produção:** capacidade de 10 raízes **excelentes** (potência e estabilidade altas), +1,5 por hora.
- **Cuidar (opcional, 1 vez a cada 20 h):** acelera em 1,5× por 24 h.
- **Ausência:** a produção só para no limite e nunca se perde.
- **Colheita:** até 5 por vez; o que não cabe na mochila fica no jardim.
- **Acesso:** pessoal.

## Receitas que valorizam propriedades

| Receita | Ingredientes | Resultado |
|---|---|---|
| **Arco de Salgueiro** | 3 madeiras com flexibilidade média ou mais (ideal: alta) + 1 Seiva Azul | Item no inventário |
| **Cinzel de Cobre** | 2 cobres com pureza média ou mais + 1 madeira com resistência média ou mais | Ferramenta que libera a "gema inteira" |
| **Unguento de Orvalho** | 2 plantas com estabilidade média ou mais (as folhas comuns são ideais) | Item no inventário |

A qualidade do resultado depende de quantos ingredientes estavam na faixa ideal.

## Obra comunitária: Ponte do Riacho

| Etapa | Pede | O que muda |
|---|---|---|
| Fundação | 20 pedras resistentes | Pilares nas duas margens |
| Tabuado | 14 madeiras resistentes + 4 flexíveis | Dá para atravessar; a Margem Leste abre 2 ervas novas |
| Lanternas | 6 cobres + 2 de brilho (seiva **ou** quartzo, para não travar) | Lanternas azuis à noite |

- **Visual:** a cena muda a cada etapa (estacas → pilares → tabuado → corrimão e lanternas).
- **Entrega atômica:** a mochila é descontada e a obra é somada na mesma transação, uma única vez. Só é aceito o que falta; o excesso volta para a mochila.
- **Anti-monopólio:** cada pessoa entrega no máximo 40% de uma etapa. Essa cota some depois de 2 h com a etapa aberta, para um servidor vazio não travar a obra.
- **Recompensa:** quem contribuiu na etapa recebe XP de vínculo e uma memória, não só quem entregou por último.
- **Metas:** escalam pela população do servidor (`projectScale`).

## Companion coletando por intenção

- **Abastecer** (quantidade), **Selecionar** (propriedades) e **Explorar** (descobertas).
- **Configuração:**
  - objetivo e quantidade;
  - risco aceitável (nenhum, leve ou qualquer);
  - espaço reservado na mochila;
  - ferramentas permitidas;
  - ambiente preferido;
  - "evitar o que esgota o lugar".
- **Decisão por pontuação de utilidade** (`suggestGather`). Ela considera distância, necessidade, perigo, disponibilidade, capacidade e conhecimento.
  - Só usa os nós que ela viu (até 14 m ou já visitados) e as propriedades dos materiais que já coletou.
  - Não enxerga a Margem Leste sem a ponte nem a nascente antes das pistas.
- **Explicação em uma frase:** "Recolher galhos no Salgueiro (6 m): costuma ter flexibilidade boa, sem estragar o lugar."
- **Controle:** dá para parar ou trocar a prioridade quando quiser. Clicar num recurso ou no chão devolve o controle para você.
- **Ordens no chat ou pela voz:** "Mayuna, colhe 12 folhas", "pega 10 pedras", "colete 5 cobres".
- **A IA só escreve falas.** Recompensa e inventário vêm só das regras, com confirmação do servidor.

## Interface

- **Desktop:**
  - objetivo no topo esquerdo;
  - minimapa do vale e indícios no topo direito;
  - painel do recurso à direita;
  - ação com barra e **Cancelar (Esc)** embaixo;
  - últimos materiais embaixo à esquerda;
  - aba **Expedição**, com Por perto, Mochila, Receitas, Obra, Diário e Jardim, e Pedir.
- **Celular:**
  - o painel vira uma bandeja de baixo, com até 3 abordagens e detalhes recolhíveis;
  - botões com 44 px ou mais;
  - Cancelar sempre visível.
- **Estados:** disponível, executando, interrompido, concluído, esgotado (com o tempo para voltar), mochila cheia, ferramenta incompatível e conexão perdida (tenta de novo sozinho, sem duplicar).
- **Acessibilidade:**
  - teclado: Tab, Enter e Esc;
  - lista "Por perto" como alternativa a clicar na cena;
  - foco visível;
  - estados sempre em texto, não só na cor;
  - respeita a redução de movimento.
- **Tema:** os tokens ficam em `:root` (`--ecos-moss`, `--ecos-silver`, `--ecos-glow`…), em `styles.css`.

## Arquitetura e segurança

| Camada | Onde |
|---|---|
| Regras de domínio | `shared/rules/ecos.ts` (ResourceDefinition, ResourceNode, MaterialBatch, GatheringAction, RegionalEcology) e `ecosPlay.ts` (EnvironmentalClue, DiscoveryChain, ManagedSite, receitas, CommunityProject, GatheringIntent) |
| Simulação ambiental | abundância e jardim sob demanda (`abundanceNow`, `siteStoredNow`, `ecos_site_now`) |
| Decisão da Companion | `suggestGather`, `perceivedNodes`; o autopiloto fica em `client/src/ecos/ecosStore.ts` |
| Persistência | migração `20261022120000_ecos_da_terra.sql`; ações `ecos.*` em `supabase/functions/refuge/ecos.ts` |
| Apresentação | `client/src/scene/Vale.tsx`, `client/src/ui/EcosHud.tsx`, `client/src/ui/EcosPanel.tsx`, `client/src/ecos/sounds.ts` |

- **O que o servidor valida:**
  - **Posição e alcance:** a posição enviada precisa estar a até 4,5 m do nó.
  - **Ferramenta:** consultada no perfil, no servidor.
  - **Tempo da ação:** duas fases, *começar* (marca o relógio do servidor) e *terminar*, que exige pelo menos 85% do tempo.
  - **Disponibilidade:** a abundância é recalculada sob trava de linha.
  - **Capacidade da mochila:** se não couber, a coleta é recusada antes de gastar o recurso.
  - **Elegibilidade:** a Companion precisa estar desperta; os nós da Margem Leste exigem a ponte.
- **Idempotência:** todo pedido leva um `request_id` (UUID). Repetir (reconexão, clique duplo) devolve o resultado guardado.
- **Concorrência:** as operações da mochila travam a linha do perfil; as da obra, a linha da obra. O lote é sorteado de forma determinística a partir do `request_id`, então reenviar não muda o resultado.
- **Acesso:** o cliente **não** grava nada nessas tabelas, só lê o que é seu (RLS). As funções SQL só podem ser executadas pelo `service_role`.
- **Offline:** é simulado e nunca entra na economia online. Para entrar, o progresso offline precisaria de regras de validação próprias (não implementado).

## Parâmetros de balanceamento

- **Ajustáveis em `game_config.values.ecos`** (lidos por `resolveEcos`):

  | Parâmetro | Padrão | O que faz |
  |---|---|---|
  | `bag` | 60 | Capacidade da mochila |
  | `projectScale` | 1 | Multiplica as metas da obra |
  | `capShare` | 0,4 | Cota pessoal por etapa |
  | `capHours` | 2 | Horas até a cota sumir |
  | `timeSlack` | 0,85 | Fração mínima do tempo da ação |
  | `reach` | 4,5 m | Alcance |

- **No código** (`NODE_KINDS`, `MATERIALS`, `JARDIM`, `PONTE`, `RECIPES`): capacidade e recuperação de cada nó, custo e tempo de cada abordagem, faixas das propriedades, produção do jardim e metas da obra.
- **Bônus de técnica nas propriedades:** limitado a +6 pontos, para proteger a economia.
- **XP de vínculo:** só em acontecimentos relevantes (descoberta concluída, etapa da obra), usando o `discoveryXp` do Admin. Coletar não dá XP de vínculo nem de combate.

## Testes críticos

- **Regras** (`npx vitest run shared/tests/ecos.test.ts`, 26 testes):
  - lote determinístico e garantia mínima;
  - faixas estimadas honestas;
  - nenhuma abordagem dominante;
  - recuperação e teto da abundância;
  - cadeia em ordem e indícios válidos;
  - jardim sem perda por ausência;
  - receitas com adequação e posse;
  - cota e alternativas da obra;
  - a Companion só usa o que conhece e respeita ferramenta, risco e reserva;
  - ordens do chat.
- **Banco** (rodado no projeto com um Companion de teste):

  | Situação | Resultado |
  |---|---|
  | Repetir a mesma coleta | Mochila igual (2 → 2), `repeat: true` |
  | Mochila cheia | Recusa, e a abundância do nó **não** muda (7 → 7) |
  | Recurso esgotado | Recusa |
  | Terminar cedo demais | Recusa com tempo de espera |
  | Pedido trocado (mesmo id, outro nó) | Recusado |
  | Contribuição repetida | Contada uma vez (12 entregues = 12 contados) |
  | Acima da cota pessoal | Recusada |
  | Cota liberada | Aceita só o que tem |
  | Excesso na etapa | Volta para a mochila |
  | Etapa concluída | A próxima abre; uma entrega para a etapa antiga é recusada ("etapa-mudou") |
  | Cadeia | Não pula etapa; uma segunda escolha, mesmo com outro pedido, é recusada |
  | Jardim | Colheita repetida não duplica; cuidar duas vezes é recusado |

## Como rodar

- `npm run dev` e depois `Jogar offline` (simulado), ou entrar com uma conta (servidor).
- A Companion precisa estar desperta. No Companion World, ande para o norte do Portal até o Vale dos Ecos.
- Função: `npm run sync:rules && node scripts/bundle-refuge.mjs`, depois publicar (veja "Operação" em ARQUITETURA.md).

## Limitações conhecidas

- **Posição informada pelo cliente:** o servidor confere o alcance com a posição que o cliente manda; ainda não há simulação de movimento no servidor. Um cliente adulterado pode mentir a posição, mas não o tempo nem a abundância.
- **Recursos individuais:** os nós são por jogador; não existe recurso público disputado.
- **Jardim pessoal:** os espaços de manejo públicos, com cotas, ficam para depois. A obra já tem cota.
- **Caça e minigames:** não há caça nem minigames (a coleta é sempre ação curta, sem reflexo).
- **Um vale só:** um vale e uma cadeia de descoberta.
- **Visual e som:** modelos simples feitos por código; sons sintetizados.
- **Celular:** a bandeja do recurso pode cobrir parte dos botões de toque de movimento. Feche o painel para andar.

## Avaliar com jogadores

Pergunte depois de 20–30 min no vale:

1. A coleta comum é gostosa sem descobrir nada?
2. Dá para entender o que cada escolha muda?
3. Deu vontade de seguir a pista da seiva?
4. Entregar na ponte deu sensação de contribuir?

**O que medir:**
- uso de cada abordagem (alguma nunca é escolhida? então ajustar tempo ou custo);
- quem conclui a cadeia e quem ignora;
- tempo até a primeira entrega na obra;
- tentativas com a mochila cheia;
- cancelamentos.

Ajuste pelos parâmetros acima.
