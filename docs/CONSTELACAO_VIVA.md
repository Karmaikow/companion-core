# Constelação Viva — primeira entrega

O jogador distribui seis atributos, escolhe até uma Ressonância, salva perfis e muda de estilo de graça.
A build define **como o Companion luta**. Ela não muda:

- classe e habilidade de forma;
- essência e afinidades;
- ofício (Pacto das Cinco);
- aparência, memórias, histórico e Vínculo.

Código:

| Parte | Arquivos |
|---|---|
| Regras puras (cliente, servidor e testes) | `shared/rules/constellation.ts` |
| Testes | `shared/tests/constellation.test.ts` (26 testes) |
| Servidor | `supabase/functions/refuge/build.ts` (ações `build.*`) |
| Banco | `supabase/migrations/20261023010000_constelacao_viva.sql` |
| Cliente | `client/src/build/*` (estado, simulação offline, números de combate), `client/src/ui/ConstellationPanel.tsx` |

## Separação

| Camada | O que decide | Muda com a build? |
|---|---|---|
| Classe | identidade, habilidade de forma, ofício, afinidades, visual | não |
| Essência | manifestação e relações elementais | não |
| Atributos | estilo de combate | **sim** (de graça) |
| Equipamentos | % leves por cima | não (perfis não mexem em itens) |
| Ofício / coleta | qualidade de produção (ofício, técnica, ferramenta, materiais, decisões) | não: `ecos.ts` e `pacto.ts` não leem a build |
| Vínculo | relação; define o **estágio** (orçamento) | não; não é distribuível |

## Os seis atributos e os resultados

Fórmulas em `deriveStats`. Os valores entre parênteses são o padrão de `DEFAULT_BALANCE`.

`soft(p, cap, k) = cap·p/(p+k)` é uma curva com retorno decrescente: cresce rápido no começo e nunca passa de `cap`.

| Resultado | Unidade | Fórmula | Vem de |
|---|---|---|---|
| HP máximo | pontos | (100 + 5·(estágio−1) + 10·VIT) × (1 + %equip + %árvore) | Vitalidade |
| SP máximo | pontos | (60 + 3·(estágio−1) + 5·ESP) × (1 + %) | Espírito |
| Stamina máxima | pontos | 100 (base própria) | — |
| Potência física | % | (100 + soft(FOR, 160, 60)) × (1 + %) | Força |
| Potência mágica | % | (100 + soft(MAG, 160, 60)) × (1 + %) | Magia (também cura e barreiras) |
| Defesa física | armadura | (20 + 5·VIT) × (1 + %) → redução v/(v+100), teto 70% | Vitalidade |
| Resistência mágica | armadura | (20 + 5·ESP) × (1 + %) → redução v/(v+100), teto 70% | Espírito |
| Velocidade de ataque | × frequência | (1 + soft(AGI, 0,5, 50)) × (1 + %) | Agilidade |
| Tempo de conjuração | × duração | 1 − soft(AGI, 0,35, 50), mínimo 0,4 | Agilidade |
| Movimento | × passo | classe × (1 + soft(AGI, 0,08, 40)) | classe + um pouco de Agilidade |
| Precisão | 0..0,6 | soft(DES, 0,6, 40) | Destreza |
| Recuperação de SP | SP/s | 3 × (1 + soft(ESP, 1, 50)) × (1 + %) | Espírito |
| Guarda (E) | corte | 75% (física e mágica); o Bastião soma contra magia | — |

**Frequência × duração.** Velocidade de ataque é frequência: ×1,2 dá 20% mais golpes, e o intervalo vira 1/1,2.
Tempo de conjuração é duração: ×0,8 deixa a preparação com 80% do tempo. Os dois números não são equivalentes.

**Zero pontos funciona.** Com zero pontos, o Companion tem 100 de HP, 60 de SP, 100% de potência e acerta normalmente. A Destreza não é exigida para acertar.

**Destreza.** Faz duas coisas:

- estreita a variação de ±15% do dano;
- dá até +25% nas fraquezas, isto é, quando a essência do golpe é forte contra a do alvo.

**Ordem de aplicação:**

1. base do estágio;
2. pontos (curva);
3. × (1 + % de equipamento e árvore);
4. × Ressonância;
5. × efeitos temporários.

A tela mostra a origem de cada parte em "Valores exatos e origem" (`sources`).

## Pontos e progressão

- **Orçamento:** `budget(estágio) = 10 + 3·(estágio − 1)`. O estágio é o nível de Vínculo, igual para todas as classes. Exemplos: estágio 1 = 10 pontos, 5 = 22, 10 = 37, 20 = 67.
- **Validação:** pontos são inteiros ≥ 0, a soma vai até o orçamento, só valem as 6 chaves e nada é inventado (`parseAllocation`, `checkAllocation`).
- **Sem teto de nível:** velocidade, redução de dano, conjuração, movimento, precisão e recuperação usam curva com teto, então não crescem para sempre. HP e SP crescem de forma linear, sem invulnerabilidade, porque a redução tem teto de 70%.
- **Separação:** não existe uma terceira barra de nível. O Vínculo continua sendo a única progressão; a árvore de habilidades continua como estava (desbloqueios horizontais).

## Classes: sugestões no lugar de bônus

Os bônus e penalidades fixos (`SPECIES.attrs`, ±10% por ponto) **deixaram de valer**. Viraram só a distribuição inicial sugerida (`CLASS_SUGGESTION`), que o jogador edita à vontade:

| Classe | Sugestão (pesos) |
|---|---|
| Dracônica | Magia 4, Espírito 3, Vitalidade 2, Agilidade 1 |
| Alada | Agilidade 4, Espírito 3, Destreza 2, Vitalidade 1 |
| Feral | Agilidade 4, Destreza 3, Força 2, Vitalidade 1 |
| Taurina | Vitalidade 4, Força 3, Espírito 2, Destreza 1 |
| Feérica | Magia 4, Espírito 3, Agilidade 2, Vitalidade 1 |

**Continuam exclusivos:**

- habilidades de forma: Chicote de Cauda, Rasante, Bote, Investida, Guarda;
- ofícios: Confluência, Harmonização, Manejo Primordial, Forja Primordial, Inscrição Vital;
- visual e afinidades.

Só a Taurina conclui equipamentos, e ela só extrai materiais básicos. A build não dá ofício a ninguém.

**Movimento normal: diferenças moderadas.** A mobilidade forte fica nas habilidades de forma.

| Classe | Antes | Agora | Efeito |
|---|---|---|---|
| Feral | 1,25× | 1,10× | ainda a mais rápida; o Bote segue como arrancada |
| Alada | 1,15× | 1,06× | o Rasante continua sendo a mobilidade |
| Feérica | 1,05× | 1,03× | quase igual |
| Dracônica | 1,00× | 1,00× | sem mudança |
| Taurina | 0,88× | 0,95× | acompanha o grupo; a Investida segue como avanço |

A Agilidade soma no máximo +8% no movimento.

## Essências, modalidade e defesas

- **Componentes separados:** modalidade (física ou mágica), atributo de escala (Força ou Magia), essência e defesa aplicável.
- **Modalidade de cada habilidade:** campo opcional `modality` na Forja. Sem o campo, vale `inferModality`:
  - básico corpo a corpo e forma = física;
  - Guarda = mágica;
  - essência à distância ou em área = mágica;
  - essência corpo a corpo, investida ou salto (ex.: Garra Sombria) = física;
  - Suprema = **híbrida 50/50**.
- **Defesa de cada componente** (`resolveHit`): o físico passa só pela defesa e o mágico só pela resistência. A híbrida divide explicitamente e não soma Força e Magia inteiras.
- **Afinidade elemental:** multiplica depois da defesa. O anel, Luz/Sombra e Veneno continuam como em `affinity()`: 1,25× / 0,8×. O Veneno é forte contra Natureza e Água e fraco contra Terra e Luz.
- **Ataque básico:** armas mágicas (cajado, varinha, orbe, grimório) escalam com Magia; as outras, com Força.
- **Dano recebido** (`incomingDamage`): o golpe físico das criaturas passa pela defesa física do Companion; o mágico, pela resistência. Antes o Companion não tinha defesa nenhuma; agora a base (20 de armadura) corta ≈17%.
- **Pendência:** as criaturas ainda não têm resistência mágica própria e usam a defesa nos dois componentes. Os multiplicadores do Veneno continuam os que já existiam.

## Afinidade racial: nova interpretação

| | Antes | Agora |
|---|---|---|
| Afinidade da classe | "+10%" de dano/cura com as duas essências afins (nunca aplicado no combate do mundo) | **−10% no custo de SP** das habilidades da essência afim |
| Linhagem (nó c5 da árvore) | +20% | −20% de SP |

Regras do custo (`skillCost`):

- As reduções se somam (afinidade + Canal Profundo) e têm teto de 40%.
- O custo arredonda para o inteiro mais próximo; o mínimo é 1 SP se a habilidade custava algo.
- A afinidade não mexe em dano, defesa, velocidade nem produção, e não dá acesso a habilidades.

## Ressonâncias

- **Uma só, opcional.** A força é gradual: `s = m/(m+15)`, onde `m` é o menor dos dois atributos ligados. Benefício e contrapartida aparecem antes de escolher.

| Ressonância | Ligação | Benefício (máx.) | Contrapartida (máx.) | Vale para | Situação |
|---|---|---|---|---|---|
| Fluxo Arcano | Magia + Agilidade | −25% de preparação | −15% de potência por lançamento | magias com preparação > 0 | **funcional** |
| Canal Profundo | Magia + Espírito | −20% de SP | +30% de preparação | magias que custam SP | **funcional** |
| Bastião | Vitalidade + Espírito | +30% do que sobra de proteção mágica na guarda | −25% de movimento defendendo | só segurando E | **funcional** |
| Impacto | Força + Vitalidade | pressão na guarda | recuperação mais longa | golpes carregados | definida; os inimigos ainda não têm guarda |
| Precisão | Destreza + (Força ou Magia, o maior) | mais nas fraquezas | menos fora delas | todos os acertos, pela modalidade | definida; vem com as fraquezas das criaturas |
| Passo Leve | Agilidade + Destreza | esquiva mais barata | menos proteção no deslocamento | só a esquiva | definida; a esquiva própria ainda não existe |

- **Onde não vale:** golpes instantâneos e habilidades físicas não ganham bônus de conjuração.
- **Sem acúmulo:** a build tem um campo `resonance` só, e um perfil guarda uma só.

## Troca de build

Aplicar só acontece **fora de combate, sem coleta e sem trabalho na oficina** (`applyBlockers`). Pedida num desses momentos, a troca fica **pendente**:

- entra sozinha quando der (o cliente tenta de novo a cada 2,5 s);
- pode ser cancelada.

**Combate, para o servidor:**

- há um evento `combat.kill` nos últimos 8 s; ou
- o cliente informa que está em combate. O cliente marca combate em qualquer golpe dado ou recebido e não sai do combate só porque perdeu o alvo.

**Trocar não muda o estado atual** (`applyBuildToResources`):

- Não cura, não recupera SP nem Stamina: `novo = min(atual, novoMáx × atual / máxAnterior)`, arredondado para baixo, e zero continua zero.
- Desmaiado continua desmaiado.
- Não limpa efeitos nem reinicia recargas: as recargas ficam no cliente e não são tocadas.
- Não renova a Barreira, cujos parâmetros são gravados na ativação.

**Lançamento congelado:** dano, cura, custo e preparação de cada habilidade são calculados no lançamento (`castSkill` → `frozen`). Trocar depois não altera projéteis nem habilidades já lançadas.

**Perfis:**

- criar, nomear, atualizar com o rascunho, duplicar e excluir;
- até 8 por Companion;
- guardam atributos e Ressonância, e não mexem em itens.

**Segurança:**

- **O servidor valida:** orçamento, valores, Ressonância disponível e o momento.
- **Idempotência:** `build_write` trava a linha, confere a `version` (para concorrência) e o `request_id` (para repetição).
- **Acesso:** o cliente só lê a própria build (RLS) e não grava nada direto. O total de pontos vem do estágio no servidor.

## Migração

**Campos antigos e para onde foram:**

| Antes | Era | Agora |
|---|---|---|
| `SPECIES.attrs` (vida, energia, poder, defesa, agilidade, sintonia) | tendência ±10%/ponto nos máximos | só a sugestão inicial; fica registrada em `companion_build.migrated` |
| Máximos de HP/SP/Stamina (`setMaxima`) | classe × árvore + vínculo; a Stamina vinha da agilidade | `deriveStats`; a Stamina tem base própria |
| `%` da árvore e do equipamento | vida, energia, poder, defesa, agilidade, sintonia | `LEGACY_MAP`: vida → HP; energia → SP; poder → as duas potências; defesa → defesa física; agilidade → velocidade de ataque; sintonia → resistência mágica e recuperação de SP |
| "Sintonia" do design de batalha | barra de chamados do vínculo | continua do Vínculo, não distribuível |

**Recurso × máximo × atributo:**

- o recurso atual (HP, SP, ST) fica em `vitals`;
- o máximo vem de `DerivedStats`;
- o atributo distribuído fica em `alloc`.

**Primeira leitura** (`build_init`): cria a build com a distribuição sugerida da classe e o registro da tendência antiga. Nada é apagado: a árvore (`companion_skill_alloc`) e os itens não mudam, e o bônus antigo não é somado de novo.

## Perfis de demonstração (Dracônico, estágio 10, 37 pontos)

Proporções em `DEMO_PROFILES`. **Não é balanceamento final.**

| Perfil | VIT FOR MAG AGI DES ESP | Ressonância | HP | SP | Física | Mágica | Defesa/Resist. | HP efetivo fís./mág. | Golpe/s | Magia/s |
|---|---|---|---|---|---|---|---|---|---|---|
| Conjurador | 3 0 16 9 0 9 | Fluxo Arcano | 175 | 132 | 100% | 134% | 26% / 39% | 236 / 289 | 33,6 | 10,9 |
| Guardião | 16 3 6 0 0 12 | Bastião | 305 | 147 | 108% | 115% | 50% / 44% | 610 / 549 | 33,6 | 10,2 |
| Combatente físico | 9 16 0 6 6 0 | — | 235 | 87 | 134% | 100% | 39% / 17% | 388 / 282 | 44,0 | 7,5 |

O conjurador conjura 14% mais rápido e bate de longe, mas tem o menor HP efetivo físico. O guardião aguenta 2,6× mais e
segura magia na guarda. O físico tem o melhor golpe e pouco SP.

Como gerar: "+ perfis de demonstração" na tela, que só aparece para Dracônicos, ou a ação `build.demo`.

## Interface

**Onde fica:** aba **Habilidades → Constelação** (resumo e "Abrir a Constelação"); a **Árvore** fica ao lado.

**No PC:**

- **esquerda:** pontos livres e usados, os seis atributos com −/+ e campo numérico, "era X", Sugestão da classe e Zerar;
- **centro:** a constelação, com as estrelas, a ligação da Ressonância e o corpo do Companion, mais a fala dele (`explainBuild`, a partir dos números, sem IA);
- **direita:** comparação atual → prévia, com "▲ melhor / ▼ pior" em texto, HP efetivo, dano sustentado e os valores exatos com a origem;
- **abaixo:** as Ressonâncias com benefício, contrapartida, onde valem e a força atual;
- **rodapé:** perfis, Desfazer, Descartar, Aplicar (ou "Aplicar quando der"), os motivos de bloqueio e "Alterações ainda não aplicadas".

**No celular:**

- tudo em coluna, com a constelação no topo;
- botões de 44 px e campo numérico;
- a comparação começa recolhida.

**Acessibilidade:**

- Esc fecha a tela e o foco vai para ela ao abrir;
- foco visível;
- os estados aparecem em texto, não só na cor;
- respeita a redução de movimento;
- a constelação é só complemento: clicar numa estrela põe 1 ponto, mas tudo tem botão.

## Configuração (`game_config.values.constellation`)

Lida por `resolveBalance`, que limita valores absurdos (redução máxima ≤ 90%, corte de custo ≤ 80%). Os padrões ficam em `DEFAULT_BALANCE`:

| Grupo | Parâmetros |
|---|---|
| Orçamento | `basePoints` 10, `pointsPerStage` 3 |
| Recursos | `hp` {100, 5, 10}, `sp` {60, 3, 5}, `stamina` {100, regen 28, atraso 0,7} |
| Potência e defesas | `power` {160, 60}, `armor` {20, 5, 0,7} |
| Velocidades | `attackSpeed` {0,5, 50}, `castTime` {0,35, 50}, `move` {0,08, 40} |
| Precisão e SP | `precision` {0,6, 40}, `spRegen` {3, 1, 50} |
| Variação | `variance` 0,15, `weakBonus` 0,25 |
| Ressonância e custos | `resonanceK` 15, `classAffinity` 0,1, `lineageAffinity` 0,2, `maxCostReduction` 0,4 |
| Guarda, esquiva e combate | `guard` {0,75, 14, 0,4}, `dodgeCost` 15, `combatCooldown` 8 |

## Sorte, Reputação e Expressão

Ficam para depois e não foram implementadas nesta entrega.

- **Sorte:** não é atributo. No futuro, só em efeitos temporários ou equipamentos, com limite e escopo de descobertas secundárias.
- **Carisma:** é substituído por Reputação e Expressão, que crescem por ações e escolhas, sem obrigar ninguém.

## Testes críticos

`npx vitest run shared/tests/constellation.test.ts`:

- **orçamento e validação:**
  - mesmo orçamento por estágio em todas as classes;
  - valores inválidos recusados;
  - zero pontos funciona;
  - distribuição soma certo;
- **efeitos dos atributos:**
  - cada atributo só mexe no que promete;
  - sem invulnerabilidade nem velocidade ilimitada com pontos absurdos;
  - retorno decrescente;
  - frequência ≠ duração;
  - a origem de cada número é registrada;
- **dano e custo:**
  - física só na defesa e mágica só na resistência; a híbrida divide;
  - técnica física de fogo escala com Força e magia de fogo com Magia;
  - afinidade só no custo, com composição, teto e arredondamento;
  - anel, Luz/Sombra e Veneno preservados;
  - a precisão estreita a variação e rende nas fraquezas;
- **Ressonâncias e troca:**
  - só uma Ressonância, gradual, sem efeito onde não se aplica;
  - Fluxo Arcano, Canal Profundo e Bastião funcionando;
  - a troca não cura e quem está desmaiado continua desmaiado;
  - migração válida sem somar bônus antigo;
  - configuração limitada;
- **builds:**
  - os três perfis têm o mesmo orçamento, são diferentes e nenhum vence em tudo;
  - builds física e mágica viáveis em todas as classes;
  - a explicação do Companion vem dos números.

**Banco:** testado no projeto. A mesma escrita repetida devolve `repeat` e a versão antiga é recusada (`versao`).

## Limitações reais

- **Combate no servidor:** ainda não há simulação de combate no servidor (`battle.resolve`). O servidor só sabe de combate pelos abates recentes e pelo aviso do cliente. Um cliente adulterado consegue trocar de build no meio de uma luta, mas nunca com mais pontos do que o orçamento.
- **Ressonâncias:** Impacto, Precisão e Passo Leve estão definidas, mas desligadas.
- **Criaturas:** não têm resistência mágica própria nem fraquezas declaradas (a fraqueza vem da essência).
- **`buildReport`:** é uma comparação aproximada, não uma simulação de luta. Encontros variados (grupo, chefe) entram quando houver `sim.ts`.
- **Destreza:** ainda não existe evasão nas criaturas; por enquanto a Destreza só afeta a variação e as fraquezas.
- **Sorte, Reputação e Expressão:** não implementadas.
