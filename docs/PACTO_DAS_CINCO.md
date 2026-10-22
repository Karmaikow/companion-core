# Pacto das Cinco — Ofícios da Criação (primeira entrega)

Ninguém faz tudo sozinho. Cada classe tem um **Ofício de Origem**. Só a **Taurina** conclui equipamentos, na **Forja Primordial**. Nenhum equipamento vem de drop, baú ou recompensa.

Código:

| Parte | Arquivos |
|---|---|
| Regras (cliente, servidor e testes) | `shared/rules/pacto.ts`, integração em `shared/rules/ecos.ts` |
| Servidor | `supabase/functions/refuge/pacto.ts` (ações `pacto.*`); `ecos.ts` (ferramentas, bloqueio superior, Lumes) |
| Banco | `supabase/migrations/20261022150000_pacto_das_cinco.sql`, `20261022170000_pacto_cancel_fee.sql` |
| Cliente | `client/src/pacto/*` (estado e simulação offline), `client/src/ui/PactoPanel.tsx` (Oficina), Barreira Breve em `scene/vitals.ts` |

## Classes e ofícios

As classes, atributos, velocidades, habilidades de forma, vocações e afinidades continuam como estavam. A afinidade de +10% fica só no combate.

| Classe | Ofício | Produz nesta entrega | Coleta superior (tipo de fonte) |
|---|---|---|---|
| Dracônica (serpente) | Confluência | Agente de Têmpera Aquática | aquática, sob pressão, elemental (Remanso Profundo) |
| Alada (pássaro) | Harmonização | Trama de Distribuição | altitude, correntes, fibras aéreas (Líquen dos Ventos) |
| Feral (felino) | Manejo Primordial | Cerne Preservado | flora terrestre, caça, depósitos (Salgueiro Antigo) |
| Taurina (touro) | Forja Primordial | todas as peças, ferramentas e kits | **só básica**; localiza e anuncia oportunidades |
| Feérica (mística) | Inscrição Vital | Matriz de Barreira Breve | encantada, espiritual, inscrições (Pedra Inscrita) |

Regras do ofício:

- Cada transformação tem uma **decisão com troca**: ganha numa propriedade e perde noutra.
- A **essência** do Companion pode subir uma propriedade em uma faixa. Ela modifica a técnica e não transfere exclusividade.
- O Cerne Preservado tem uma **alternativa** sem a fonte superior: 4 madeiras de flexibilidade alta. Assim o progresso nunca trava.
- O componente leva a procedência no próprio lote: quem fez e as faixas, por exemplo `cmp:matriz-barreira|duracao:alta,recarga:baixa~<autor>`. Lotes iguais se juntam; autores diferentes não.

## Forja: Corpo, Trama e Marca

As etapas são **Leitura → Montagem → Condução → Têmpera → Assinatura**.

- **Modo assistido:** monta o plano com o melhor da mochila.
- **Modo manual:** você escolhe cada lote, e a procedência aparece no nome.

A previsão é **determinística**: `forgePreview` é a mesma função no cliente e no servidor, então o que aparece é o que sai. As decisões são escolhas entre propriedades, sem bônus infinito:

- Condução: resistência × leveza.
- Têmpera: estável (dura mais) × reativa (Marca mais forte, gasta mais SP).

**Risco:** a forja consome os materiais.

- Cancelar antes de terminar devolve tudo, inclusive os Lumes dos núcleos.
- Depois de pronta, a peça só muda por **reforja limitada** ou **reciclagem com perda**.
  - Reforja: a Taurina troca condução e têmpera e gasta 1 material do corpo.

**Núcleos de Fogo e Terra:** cada Companion tem uma só essência. A oficina pública cobra os dois núcleos, `coreFee` de cada um. Uma Taurina de Fogo ou de Terra traz a própria metade e não paga essa parte. A essência do Companion nunca muda.

**Capacidade da oficina pública:**

- `workshopSlots` forjas simultâneas no servidor.
- `perArtisan` forjas por artesã.
- Até `perArtisan × 2` encomendas ativas por artesã.

## Projetos desta entrega

| Projeto | Camadas / componentes |
|---|---|
| Faca de Colheita, Machado, Picareta, Cinzel (ferramentas) | Corpo |
| Arco de Salgueiro | Corpo + Marca opcional (Seiva Azul → Afinidade de Água) |
| Escudo de Tábuas | Corpo |
| Kit de Reparo (consumível; qualquer pessoa usa) | Corpo |
| **Guardião da Nascente** (escudo avançado, as 5 classes) | Corpo: Cerne Preservado (Feral) + 2 cobres de pureza média ou alta. Trama: Trama de Distribuição (Alada). Marca: Matriz de Barreira (Feérica). Têmpera: Agente Aquático (Dracônica). Conclusão: Taurina. |

**Barreira Breve**, a Marca do Guardião:

- **Gatilho:** uma defesa válida, ou seja, bloquear com E no instante em que leva o golpe.
- **Condições:** a Marca não pode estar em recarga e é preciso ter SP para o custo.
- **Efeito:** absorve até `absorb` de dano por `duration` segundos.
- **Recarga:** começa na **ativação** e é sempre maior que a duração. Por isso não existe ciclo infinito.
- **Valores:** duração, absorção, recarga e custo vêm da config (`pacto.barrier`) e das faixas da matriz e do agente.

## Ferramentas e coleta

- **Kit inicial vazio** (decisão de 22/10): ninguém ganha ferramenta.
  - As coletas que pedem ferramenta ficam bloqueadas até alguém ter uma ferramenta forjada.
  - Coletas à mão continuam livres, e o começo do jogo funciona sem equipamento.
- Cada ferramenta é uma **peça forjada** (`pacto_equipment`) com durabilidade. Ela gasta 1 por coleta e, quebrada, não serve até ser reparada.
- **Primeira peça para quem está começando:** os projetos básicos usam só material comum que se coleta à mão (madeira, cobre, pedra), e o quadro de encomendas liga quem precisa a quem forja.
- **Fontes superiores:** só a classe daquele tipo de fonte extrai, e o servidor confere.
  - A Taurina vê o bloqueio com o botão **📣 Anunciar oportunidade**.
  - A Companion automática pula as fontes que não pode extrair.

## Encomendas (quadro)

**Ciclo:**

1. A pessoa cria a encomenda: projeto, requisitos (atributo mínimo, peso, Marca), prazo e se aceita substituições.
2. Os materiais depositados e o pagamento em Lumes ficam **reservados** (escrow).
3. Uma Taurina aceita a encomenda.
4. Ela forja na bancada com o depósito. Se a encomenda aceitar substituições, também pode usar a própria mochila.
5. Na entrega, a peça precisa cumprir os requisitos, conferidos no servidor.
6. A peça vai para o cliente, a sobra do depósito volta, e a artesã recebe o pagamento menos a taxa.

**Cancelamento e expiração** (`cancelSettlement`):

| Situação | Lumes | Materiais |
|---|---|---|
| Antes de aceitar, ou aceita sem forja | tudo volta ao cliente | tudo volta ao cliente |
| Na forja (cliente cancela) | `cancelCompensation` vai para a artesã; o resto volta ao cliente | o que não foi usado volta |
| A artesã some (`artisanIdleHours`), o prazo vence ou a artesã desiste | tudo volta ao cliente, sem compensação | tudo volta ao cliente |

Uma forja em andamento numa encomenda cancelada é interrompida: a mochila e os núcleos voltam à artesã.

**Sem duplicação:**

- Toda escrita é uma função SQL com trava por linha e `request_id` idempotente.
- Repetir um pedido (reconexão) devolve o resultado guardado.
- Duas entregas, ou entrega e cancelamento ao mesmo tempo, não duplicam nada: só a primeira muda o estado.

**Cooperação assíncrona:** cada pessoa faz a sua parte quando pode. O componente fica na mochila, com procedência, até alguém usar.

## Lumes (moeda nova)

Origem declarada e finita:

| Entrada (fonte) | Saída (sumidouro) |
|---|---|
| Bolsa única de `starterLumes` no primeiro acesso | Núcleos da oficina (`coreFee` × 2 por forja) |
| `discoveryLumes` por descoberta concluída | Taxa do quadro (`orderFee` do pagamento, arredondada para cima) |
| `projectStageLumes` por etapa de obra, para cada contribuinte | |

Pagamentos entre pessoas só **transferem** Lumes, não criam. Os valores estão marcados **a balancear** (`DEFAULT_PACTO`); dá para ajustar pela config do servidor (`config.values.pacto`).

## Ciclo de vida

- **Durabilidade.**
- **Kit de Reparo:** devolve 30 e não passa do máximo.
- **Reforja:** só a Taurina, e só em peça dela; a de outra pessoa passa por encomenda.
- **Reciclagem:** devolve 40% arredondado para baixo, só dos materiais básicos; componentes se perdem. Por isso **nunca dá lucro**, e não dá para reciclar a peça equipada.
- **Assinatura e histórico:**
  - Assinatura: a artesã, quem fez cada componente e a data.
  - Histórico: forja, entrega, reforja.

## Teste das cinco classes (só homologação)

O admin vê **🧪 testar como**, só fora de `companion-core-two.vercel.app`. A troca muda **só as permissões do Pacto** (`pacto_profile.test_class`). Identidade, modelo e combate continuam os reais. O servidor ignora `test_class` de quem não é admin.

## Decisões e conflitos registrados

- **Baús:** a ideia de dar ferramentas por baús conflita com a regra "nenhum equipamento de drop/baú/recompensa". Proposta:
  - os baús dão **partes ou componentes** que a Taurina conclui; ou
  - um **estoque finito declarado** (evento) com origem registrada.
  - Nada disso foi implementado.
- **Linhagem:** ver a seção Linhagem (restrita).

## Linhagem

Mecânica restrita (segredo de lore). O desenho fica só no documento privado do projeto.

## Testes críticos

`shared/tests/pacto.test.ts`, com 21 testes:

- exclusividade da Taurina;
- bloqueio superior por fonte (Taurina nunca extrai);
- as receitas livres são só consumíveis;
- transformações com troca e essência;
- previsão determinística;
- Guardião só com as 5 classes;
- a Barreira sem ciclo infinito;
- requisitos de encomenda;
- cancelamento e pagamento somando o total;
- reciclagem nunca lucrativa;
- reparo sem passar do máximo;
- kit inicial vazio.

Contra o servidor real (sandbox): concorrência e idempotência de forja, entrega e cancelamento. O resultado está no relatório da entrega.

## Limitações conhecidas

- Uma transformação por ofício. A Taurina tem os projetos básicos e o Guardião.
- Não há mercado aberto: a troca entre pessoas acontece só por encomenda. Componentes passam de mão em mão por depósito numa encomenda.
- Peças forjadas usam o visual do item do arsenal do mesmo tipo. Ainda não há modelo próprio por projeto.
- Offline: ofícios, forja e ciclo de vida são simulados neste aparelho. Encomendas e quadro só funcionam online.
- O cliente cancelar depois da peça pronta (antes da entrega) deixa a peça com a artesã, que recebe a compensação. Ela pode entregar antes, já que a entrega é o fluxo normal.
