# Auditoria e validação — Mayuna Web v0.2

## Base inspecionada

Fonte: arquivo `mayuna-web-v0.1(1).zip` anexado por Didi. Os documentos internos
se identificam como v0.1. O handoff cita v0.1.1, mas não presumimos mudanças que
não estejam nesse arquivo. A atualização foi feita sobre o conteúdo real recebido.

A inspeção de estrutura e o build precederam as alterações. O build inicial
compilou com o executável TypeScript chamado via Node. `npm run build` falhava
porque o ZIP incluía executáveis de `node_modules` preparados no Windows.
O comando agora invoca o compilador pelo Node e o pacote entregue não inclui
`node_modules`. O build compilado está incluído para abertura imediata.

A inspeção visual original ficou inicialmente bloqueada pela ausência de browser.
Após instalar um Chromium de teste, examinamos o original e o resultado. No
original, em 390×844, o documento media 898 px de altura, apesar do overflow oculto.
A v0.2 mede exatamente 844 px. No desktop original 1440×900 a altura já cabia;
o risco vinha do shell com min-height e dos mínimos intrínsecos dos controles.

## Achados e intervenções

| Achado | Intervenção |
| --- | --- |
| Falha ao recuperar identidade ativa criava outra Companion | Inicialização interrompe sem sobrescrever a identidade |
| Ponteiro ausente podia abandonar dados existentes | Detecta identidades sem ponteiro e solicita restauração do arquivo |
| Chave carregada sem verificar correspondência | Desafio Ed25519 local antes de operar a identidade |
| API não serializava interações concorrentes | Fila no runtime, mantendo InteractionEngine e regras intactos |
| Canvas monolítico em app.js e consulta de CSS por quadro | Renderer separado, cenário em cache e loop limitado |
| Min-height não garantia contenção da UI | Shell com height:100dvh e linhas minmax(0,1fr) |
| Painéis só minimizavam | Gerenciador de cinco janelas, posição, fechamento e restauração |
| Fronteira de API concentrada na UI | Módulo HTTP dedicado, sem import de Core no navegador |
| Item do inventário interpolado sem escape | Escapado antes de compor HTML |
| Fallback estático retornava HTML para qualquer caminho | 404 para arquivos ausentes e limite de diretório com separador |
| Origem da requisição não era validada | Restrição de Host/Origin, CSP e cabeçalhos básicos |
| Ollama sem limite de espera e sem diagnóstico de tempo | Timeout e métricas opcionais no servidor, sem alterar modelo |

## Continuidade

Comparação byte a byte: **15 arquivos protegidos, nenhuma alteração**.
Inclui `src/core/`, `src/crypto/`, `src/models/`, `src/memory/`, `src/interaction/`,
`src/storage/`, `src/companions/` e os três arquivos de `data/` presentes no ZIP.
Não houve migração, mudança de formato, recriação de Mayuna, alteração de memórias,
eventos ou snapshots. `core.ts`, `interaction-engine.ts`, BondEngine, MemoryRetriever
e ResponseGuard foram preservados. Os ajustes de segurança ocorreram na API/runtime.

O runtime não implementa recuperação automática nova: diante de corrupção,
interrompe em vez de resetar. O mecanismo de recuperação do Core permanece intacto.
Uma ferramenta assistida de recuperação para o último estado confiável deve ser
planejada e testada separadamente. A verificação atual mantém o alcance original;
não se afirma que ela valide toda semântica de gameplay futuro.

## Resultados executados

- `npm run build`: passou.
- Verificação de sintaxe dos módulos web: passou.
- Sete testes de runtime/HTTP: passaram.
- Inicialização com dados reais copiados: mesma identidade, sem regravação.
- Falta de chave, chave incompatível e ponteiro ausente/corrompido: bloqueados.
- Três chats simultâneos: serializados; cadeia válida e histórico anterior intacto.
- Provider indisponível: sem XP/memórias extras; fila recupera na próxima chamada.
- DTO e rotas estáticas: chave privada ausente; caminhos de dados/source indisponíveis.
- Origem estrangeira: requisição recusada.
- Browser em 1440×900, 1366×768, 1024×640, 1920×1080, 390×844, 360×640 e 844×390:
  documento contido na viewport, canvas presente, estado carregado e zero erros JS.
- Interações: minimizar/restaurar, mover, persistir posição, fechar/reabrir,
  restaurar layout, trocar tema/estilo, expandir mundo, conversar, Escape e movimento reduzido.
- Teste UI completo confirmou que sheets não cobrem a hotbar nos sete tamanhos.
- Screenshots em `docs/previews/` mostram dados isolados de demonstração,
  identificados como IA simulada. Não são uma nova Mayuna de produção.

## Limites e próximos passos

1. **Ollama real:** não é acessível a partir deste ambiente. Medir no computador
   de Didi com MAYUNA_DIAGNOSTICS antes de otimizar contexto ou trocar parâmetros.
2. **Persistência:** LocalStore permanece original, com gravação direta em JSON.
   O runtime serializa uma instância; isso não oferece lock entre processos nem
   transação em vários arquivos. Escrita atômica e backups pedem uma próxima etapa.
3. **Janelas:** cinco painéis laterais são móveis; sheets de conteúdo têm fechamento.
   Resize manual, múltiplas sheets simultâneas e modos de combate/exploração ficam
   para evolução posterior. Layouts extremos podem usar scroll interno nos painéis.
4. **Mobile:** browser emulado foi validado; teclado virtual, recortes e gestos
   devem ser conferidos em aparelho real. Há safe-area e dvh, sem promessa de QA
   em todos os navegadores móveis.
5. **Mundo:** cena procedural de apresentação. Phaser, movimento, colisão, combate,
   quests reais e multiplayer ainda não existem. Skills/passivas não estão ativas.
6. **Segurança local:** loopback é o padrão. Isto não é autenticação multiusuário
   nem autorização para expor o servidor na internet. A chave segue somente no
   backend e no pacote privado original de dados.
7. **História:** separação formal de fato, memória, inferência, imaginação e narrativa
   é uma evolução futura. Não foram inventados acontecimentos ou memórias nesta UI.
8. **Portabilidade:** pacote `.mayuna` criptografado, sincronização de eventos,
   artefatos físicos NFC/coins 3D e temas desbloqueados por história continuam no
   roadmap. Nenhum desses recursos é anunciado como implementado.

## Próxima decisão sugerida

Validar visual e tempos do Ollama no PC de Didi. Depois escolher entre integrar
Phaser ao contrato do GameViewport ou fortalecer salvamento/backup e recuperação.
Qualquer mudança de formato do Core deve ser discutida antes da implementação.
