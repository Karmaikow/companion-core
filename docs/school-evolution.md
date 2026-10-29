# Escolas e evolução — etapa 1

Esta etapa é aditiva: não altera DEFAULT_SKILLS, inventário, kit, combate, salvamentos ou acesso às habilidades publicadas. A escolha de VFX continua estritamente visual. Não há migração automática por aparência.

## Disponível

- Catálogo visual organizado em dez essências e cinco escolas, mantendo IDs originais. Hive corresponde a Veneno; a recoloração dos shaders ainda é uma etapa separada.
- Painel recolhível na Forja e galeria: requisitos, materiais e simulador de prioridades. Não grava estado de jogador.
- Regras puras em shared/rules/combat/schools.ts: afinidade, disponibilidade, curva de potência, classificação e contagem de memórias por Companion, evento e conquista.
- Dano, cura, escudo e duração de controle recebem o multiplicador uma vez. Movimento não muda. O helper é uma base para integração futura; não está conectado ao combate atual.
- Cinco escolas planejadas e fechadas, sem localização definida. Quantidades e níveis são configuração inicial de design. Marcos numéricos de vínculo ainda não definidos.

## Próximas entregas

1. Revisar cada efeito e criar novas SkillDefs optativas, sem sobrescrever habilidades existentes; adaptar paleta de Hive para Veneno. A aparência não define dano ou aquisição.
2. Persistência versionada de estudo, prioridade e conquistas. Gerar memórias qualificadas exclusivamente de eventos autoritativos. Narrativas da IA e dados enviados pelo cliente não concedem conquistas. Migração de memórias antigas exige evidência de origem; sem classificação inventada.
3. Inventário e entregas transacionais: verificar escola aberta, grau anterior, nível, vínculo, memórias, missão, título e itens; debitar e promover na mesma transação, com chave idempotente. Nunca debitar apenas no cliente. Itens e missões acima ainda são propostas, não drops disponíveis.
4. Aprendizado individual de técnicas, loadout fora de combate, persistência de conhecimento ao desativar escola, multiplicadores aplicados uma única vez a valores-base e duração real refletida nos VFX. Tratar proteção, invulnerabilidade, empurrão e reversão temporal conforme seus mecanismos reais.
5. Abrir escolas e graus conforme expansão do mundo, preservando conquistas anteriores. Localização configurável; progresso independente do mapa.
6. Convergente: cinco maestrias, técnicas das trilhas exigidas, títulos e memórias de maestria, cinco relíquias e missão final. O servidor concede a classe; o checkbox do simulador não é concessão. Com cinco escolas ativas, 70% em todas; especialistas conservam 100%. Fabricação de equipamentos exclusiva dos Taurinos não é requisito da trilha de combate.

As memórias não são consumidas. Relevância extraordinária conta também como marcante. Conquistas repetidas não multiplicam contagem. Esta primeira versão pressupõe registro canônico único por conquista/evento, proveniente do Core; não é um validador de payloads externos.

## Validação

Testes cobrem classificação completa do catálogo, curva e prioridade, preservação de movimento, isolamento por Companion, repetição de conquistas e requisitos de memórias. Testes anteriores de catálogo e VFX verificam compatibilidade. Nenhuma escola é habilitada por este módulo.

## Etapa 2 — diário factual por Companion

A aba Habilidades → Escolas consulta `schools.state`. O servidor resolve o Companion pelo usuário autenticado antes de ler os eventos. A consulta é paginada por ID e fixa o último ID no início, sem o limite de 60 registros da timeline visual. Erros de leitura são exibidos; não viram progresso vazio bem-sucedido.

As conquistas são uma projeção determinística do log persistido `companion_events`. Não há nova tabela nem regravação de memórias narrativas. O classificador v1 reconhece pistas/conclusão da Seiva Azul, Unguento de Orvalho, etapas da Ponte do Riacho, peças efetivamente forjadas e análises de criaturas concluídas. A mesma conquista conta uma vez, com ID do evento e data de origem. Chat, receitas apenas sugeridas pela IA, mortes comuns e tags fornecidas pelo cliente não concedem conquistas. Tempo ainda não tem eventos qualificáveis nesta seleção: requer conteúdo futuro.

O modo local consulta os eventos do save do próprio Companion, marcado como simulado e sem sincronização econômica. Os sistemas Ecos/Pacto offline anteriores possuem saves separados e não registram esses eventos no log do Companion; suas ações não são importadas nem atribuídas retroativamente. Análises de combate registradas no save local já podem aparecer.

Publicação exige atualizar a Edge Function refuge com `schools.ts`, `schoolJournal.ts` e `schools.ts` das regras compartilhadas, além do frontend. O painel apresenta falha explícita quando a versão antiga do servidor ainda não oferece `schools.state`. Não há migração SQL nesta etapa. O deploy da função não é realizado pelo build Vite.

Este diário ainda não é o estado de aprendizado de técnicas: todas as escolas seguem no grau zero e planejadas. Persistência de matrículas, técnicas aprendidas, entregas atômicas e loadout dependem da próxima etapa. Não interpretar contagem de memórias como autorização para conjurar.
