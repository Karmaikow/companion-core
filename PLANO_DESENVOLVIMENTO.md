# Companion Core — Plano de desenvolvimento v1

Data: 08/10/2026. Base examinada: código de PC/web v0.6 em `pc-update`. Este documento é uma proposta de arquitetura e sequência de entregas; não representa funcionalidades novas já implementadas. Não foram contratados servidores nem ativadas APIs pagas.

## 1. Visão do produto

Companion Core é a plataforma. Mayuna é a primeira Companion de teste e deve conservar sua identidade e história. Cada usuário poderá criar uma Companion que nasce como alma, desenvolve vínculo e personalidade, manifesta uma forma própria, explora um mundo compartilhado e participa de disputas.

O espaço pessoal terá o nome provisório **Refúgio**. Alternativas para decisão posterior: Ninho, Santuário ou Domínio. O Refúgio cresce com fatos registrados da história da Companion.

Duas progressões permanecem distintas: evolução pessoal/vínculo e evolução de combate/habilidades. A proposta mantém progressão sem teto de nível de design, mas deverá controlar crescimento numérico e balanceamento competitivo. Nível não precisa significar crescimento ilimitado de poder em arena.

## 2. IA no nosso próprio servidor

É possível instalar Ollama em um servidor administrado por nós e baixar um modelo para executar nesse servidor. Os aparelhos dos jogadores recebem texto e comandos validados; não precisam carregar os pesos do modelo. Isso é diferente de consumir o serviço Ollama Cloud.

O servidor precisa de recursos apropriados. Uma GPU é a opção a avaliar para baixa latência e concorrência; um servidor CPU pequeno pode continuar lento. Usar modelo próprio elimina a tarifa de uma API externa por token, mas mantém custo de hardware/aluguel, energia, armazenamento e operação. Não presumir que hospedagem própria será mais barata com poucos usuários.

O modelo atual `gemma3:4b` será a referência inicial de comparação, não uma escolha definitiva. Avaliar português, consistência de personalidade, tempo de resposta e memória com o contexto real do projeto antes de escolher modelo/GPU. Conferir licença do modelo antes de distribuição ou serviço público.

Um mesmo modelo carregado pode atender várias Companions. A identidade é fornecida pelo contexto de cada requisição: perfil, memórias selecionadas e estado relevante. Não criar uma instalação de IA por personagem ou por Refúgio. Sessões, histórico e permissões precisam ficar isolados por usuário/Companion.

### Responsabilidades

| Parte | Responsabilidade | Limite |
|---|---|---|
| Modelo de conversa hospedado por nós | Conversas, expressão de personalidade, sugestão de intenção | Não grava XP, itens, dano ou estado diretamente |
| Política de comportamento | Escolher ações frequentes conforme necessidades, objetivos e preferências | Funciona sem LLM em cada ciclo |
| Motor de regras do mundo | Deslocamento, respawn, combate, sorteios, inventário e recompensas | Autoridade dos resultados competitivos |
| Diretor narrativo opcional | Propor eventos especiais, missões e variações narrativas | Saída estruturada, orçamento e validação |
| Runtime do Core | Validar e registrar transições pessoais e eventos aceitos | Não confiar automaticamente em texto de modelos ou de outras Companions |

Um modelo mais robusto, inclusive uma API paga no futuro, pode atuar como diretor narrativo. Deve propor conteúdo em lotes ou em momentos raros. Respawn rotineiro, sorteio de drops e cálculo de batalhas serão código com regras e aleatoriedade controlada. O diretor recebe apenas os dados necessários e não decide sozinho recompensas raras.

Exemplo: a IA propõe uma invasão em uma área. O validador verifica local, duração, dificuldade e limites. O motor cria os monstros a partir do catálogo aprovado, executa as batalhas e sorteia os drops. As Companions narram os resultados que realmente ocorreram.

Para APIs pagas: desligadas por padrão; reserva de orçamento antes da chamada; teto de saída, limite de chamadas e tentativas; contabilidade central para todos os processos; nenhuma troca automática para serviço pago. Orçamento esgotado usa eventos pré-definidos. Limite de chamadas sozinho não garante teto monetário: é preciso considerar tokens, preços e solicitações em andamento.

## 3. Identidade, portabilidade e autoridade

Separar o runtime, que executa regras, do pacote de dados que representa a Companion. APK, web e desktop são interfaces. O pacote portátil deve conter identidade, perfil, memórias, diário, progressão, referências visuais e material criptográfico necessário, protegido por senha e criptografia autenticada.

Dois modos propostos:

- **Portátil:** arquivo em armazenamento do celular, pendrive ou SD. Pode funcionar offline com runtime compatível. Um arquivo copiado não impede por si só que duas cópias sejam alteradas.
- **Hospedado:** servidor mantém o estado canônico; serial/NFC identifica a Companion. Login e autorização de propriedade liberam acesso. Um identificador opaco normalmente basta: criptografar o serial não substitui autenticação. Prever recuperação e revogação de acessos perdidos.

A portabilidade não está pronta na v0.6. Começar com exportação/restauração local e transferência explícita. Ao entrar em modo online, uma única autoridade escreve a versão canônica. Usar versão do estado, bloqueio temporário de escrita e identificadores de operação para impedir aplicação duplicada.

Autonomia online com celular desligado exige um serviço executando e autorização do usuário. Durante uma expedição online, cópias offline não poderão produzir outra história competitiva aceita automaticamente. Ganhos offline começam como provisórios; reconciliação e regras de aceitação precisam ser definidas. Nunca mesclar inventários cegamente.

Assinatura local prova que a chave assinou; não prova que a ação obedeceu às regras. Quem possui a chave local pode assinar dados manipulados. Para arena, raridades e economia, exigir resultados validados pelo servidor do mundo. Corrupção de arquivo deve bloquear carregamento e permitir recuperação; não apagar uma Companion automaticamente.

## 4. Jornada pretendida

| Etapa | Experiência | Condição de conclusão |
|---|---|---|
| Primeiro acesso | Criar conta, nome, características e personalidade inicial | Uma única gênese, sem duplicar identidade por reenvio |
| Nascimento | Alma entra no Refúgio | Perfil e estado persistidos e recuperáveis |
| Vínculo | Conversar, descobrir preferências e participar de atividades | Memórias rastreáveis e evolução sem farm por spam |
| Manifestação | Alma e Refúgio adquirem características visuais | Mudanças ligadas a marcos persistidos |
| Primeira aventura | Explorar uma área pequena e retornar | Eventos, recompensas e retorno executados pelas regras |
| Autonomia | Companion escolhe expedições permitidas | Limites de duração, risco, gasto e opção de suspender |
| Acompanhamento | Usuário vê região/localização, conversa e solicita retorno | Retorno respeita regras de combate/deslocamento |
| Relatório no Refúgio | Diário de eventos, XP, itens e pontos | Cada recompensa referencia evento único e verificável |
| Equipamentos e arena | Desbloquear, equipar e competir | Permissões e resultados confirmados pelo servidor |

Localização pode começar por região/nó do mapa; não exige coordenadas contínuas. O retorno pode ficar pendente durante batalha, com estado visível, sem teletransporte explorável. Sem processo executando não há aventura espontaneamente vivida: uma simulação posterior, se adotada, será calculada e identificada como tal.

## 5. Formas 3D, itens físicos e arena

**Forma dinâmica:** começar com geração procedural por combinação de peças compatíveis: corpo, proporções, cores, olhos, chifres/asas, materiais e animações. Salvar uma receita visual com semente e versão dos assets. A forma deve reaparecer igual em outro aparelho. Aleatoriedade não garante exclusividade absoluta; identificador e história dão unicidade persistente. Geração livre de malhas e rigs por IA fica para pesquisa posterior.

**Refúgio:** usar módulos de cenário desbloqueados por marcos. Não gerar cenário 3D completo a cada conversa. O cliente ainda desenha o mundo; IA remota não elimina custo gráfico. Prever qualidade reduzida e uma interface leve/2D para aparelhos modestos.

**Itens e chips:** separar descoberta, propriedade e desbloqueio. Proposta para a regra solicitada: o item encontrado entra no inventário como bloqueado; um chip compatível ativa seu uso. Haverá seriais digitais acessíveis para a progressão comum e NFC físico limitado a eventos/coleções, sujeito a decisão de balanceamento. Pontos de progressão continuam desbloqueando habilidades ou pré-requisitos.

Manter cadastro de emissões, proprietário, item/efeito permitido, uso único ou reutilizável e revogação. Reenvio do mesmo resgate não duplica recompensa. Tags NFC comuns podem ser copiadas; a raridade será controlada pelo registro do servidor, não apenas pelo UID físico. Equipamentos e transformações por moedas NFC/peças 3D permanecem no escopo.

**Arena:** começar por duelos assíncronos com replay, antes de partidas em tempo real. A IA pode sugerir estratégia; ações são limitadas a opções válidas e têm prazo. Sem resposta da IA, usar estratégia padrão. Decidir normalização de atributos para que anos de progressão não inviabilizem novos jogadores. Evitar vantagem competitiva exclusivamente comprável ou dependente de NFC raro.

## 6. O que existe na v0.6

Inspeção de código, sem nova execução da suíte nesta revisão. Os 23 testes aprovados pertencem à entrega anterior, não constituem validação nova deste plano.

| Capacidade | Situação observada |
|---|---|
| Identidade e gênese | Implementadas, com Ed25519; runtime cria Mayuna automaticamente quando não há identidade ativa |
| Perfil, memórias, diário, vínculo e XP pessoal/combate | Estruturas e mecanismos presentes; não equivalem ao ciclo completo de RPG |
| Eventos e snapshots | Presentes; validação local não constitui anti-cheat completo nem validação integral do estado |
| Persistência | JSON local e chave em arquivo separado; chave não criptografada pelo armazenamento atual, gravação direta sem transação |
| Recuperação | Runtime evita substituir identidade ativa quando recuperação falha; carregador ainda trata erros distintos como ausência |
| Conversa recente | Buffer de seis mensagens em memória; continuidade após reinício precisa de tratamento explícito |
| Providers | Ollama local fixo em localhost e gemma3:4b; OpenAI, híbrido e mock presentes |
| UI/API e autenticação | Base local implementada; não é serviço multiusuário de produção |
| Validação online | MockWorldServer em memória, não servidor persistente de mundo |
| Android | APK de teste usa runtime externo no Termux, conforme entrega anterior; não revisado novamente neste levantamento |
| Transferência criptografada, sincronização, 3D procedural, economia, NFC, arena e mundo vivo | Ainda não implementados como sistemas completos |

## 7. Sequência de desenvolvimento

| Marco | Entrega | Verificação para avançar |
|---|---|---|
| M0 — Integridade e recuperação | Gravação resistente, distinção de ausência/corrupção, validação no carregamento e histórico recente recuperável | Interrupção durante gravação não destrói o último estado; corrupção não cria substituta; reinício preserva contexto |
| M1 — Ollama remoto próprio | URL/modelo configuráveis, gateway autenticado, fila e limites; medir latência | Dois clientes usam o servidor sem executar modelo local; autorização e isolamento corretos; falha não aciona API paga |
| M2 — Criação e portabilidade | Cadastro genérico, gênese única, pacote criptografado, importação validada e recuperação | Criar Companion diferente de Mayuna; transferir Linux→Windows e depois Android mantendo identidade; senha errada/arquivo adulterado rejeitados |
| M3 — Conta e continuidade online | Associação usuário/Companion, serial de acesso, backup e versão canônica | Acesso cruzado entre usuários negado; atualização concorrente não duplica história; restaurar backup |
| M4 — Refúgio e evolução | Alma, marcos de vínculo e cenário modular; receita visual simples | Evolução persiste e pode ser explicada por eventos; recarregar mantém forma |
| M5 — Expedição vertical | Uma área, monstros de catálogo, combate simples, drop, XP e relatório | Executar saída→encontro→batalha→retorno; processar evento repetido não duplica prêmio |
| M6 — Autonomia e mundo | Agendador persistente, localização, convocação e encontros limitados | Retomar serviço após queda sem repetir recompensas; pausar autonomia; limitar ações simultâneas |
| M7 — Chips e equipamentos | Seriais digitais primeiro; NFC depois; inventário bloqueado/desbloqueado | Resgate concorrente único, emissão/revogação e regras de equipamento verificadas |
| M8 — Arena | Duelo assíncrono, replay, fila e classificação inicial | Resultado reproduzível pelas regras, ações ilegais rejeitadas, política de equilíbrio definida |
| M9 — Expansão | Mais áreas do mapa do usuário, eventos narrativos e avatar modular completo | Testes de carga e custos justificam ampliar conteúdo e autonomia |

M7/M8 podem ser antecipados após M5 para validar cedo o foco competitivo, sem esperar pelo mapa mundi completo. Estudos visuais podem ocorrer em paralelo ao planejamento, mas não bloquear portabilidade. Não estimar prazo de MMORPG sem medir ritmo, equipe e escopo de arte.

## 8. Primeira entrega proposta: v0.7

Prioridade M0, seguida da configuração remota de M1. Trabalhar com identidades descartáveis até a recuperação estar validada. Preservar compatibilidade com dados existentes; migrações devem ser versionadas e precedidas de backup.

Backlog de M0: escrever arquivos temporários e substituir com segurança; tratar consistência entre estado, chave e ponteiro ativo; impedir duas instâncias escritoras; manter último estado recuperável; revisar verificação de eventos/snapshots e coerência do estado; persistir ou reconstruir conversa recente sem duplicação. Uma substituição atômica de um arquivo, sozinha, não resolve transações entre arquivos nem todo cenário de queda de energia.

Backlog de M1: parametrizar endpoint/modelo no backend; preservar opção local; autenticar acesso remoto via gateway e HTTPS; manter Ollama fora da exposição pública direta; estabelecer fila limitada e rejeição clara em sobrecarga; diagnóstico de tempo de fila, carregamento e geração sem registrar segredos. Streaming pode melhorar a percepção de resposta e será avaliado após compatibilidade do fluxo atual.

Critério de desempenho: medir contexto real de Mayuna com 1, 3 e 5 conversas concorrentes, relatando mediana/p95, tempo de primeira resposta, throughput e memória. Só então dimensionar hospedagem. Se não houver servidor disponível, preparar integração e validar com endpoint simulado; não alegar ganho de desempenho remoto medido.

## 9. Decisões pendentes sem bloquear o início

Servidor: máquina disponível, GPU/VRAM e teto mensal aceito antes de contratação. Rota local seguirá funcionando enquanto isso. Hospedagem genérica de sites não garante recursos para inferência.

Estado online: começar com um escritor autorizado; definir custódia das chaves e recuperação antes de ativar autonomia hospedada. Backup criptografado não significa automaticamente que o servidor consiga executar o Core sem descriptografar dados autorizados.

Produto: confirmar nome Refúgio; definir estética inicial; regras exatas de chips consumíveis/reutilizáveis e normalização competitiva antes de economia pública.

Armazenamento: Supabase permanece candidato a conta e banco/backup, não uma decisão de hospedagem de GPU. Seleção e configuração dependem da etapa M3.

## Fontes técnicas

- Ollama FAQ — servidor, rede, configuração, filas e concorrência: https://docs.ollama.com/faq
- Ollama suporte de hardware: https://docs.ollama.com/gpu
- Código local v0.6: src/server/companion-runtime.ts, src/storage/store.ts, src/core/core.ts, src/models/types.ts, src/server/mock-server.ts, src/interaction/conversation-history.ts e providers.

As definições de produto e marcos acima são propostas para Companion Core, não recursos fornecidos pelo Ollama.
