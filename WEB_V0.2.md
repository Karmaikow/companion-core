# Mayuna Web v0.2 — Santuário

Esta atualização continua o projeto recebido. CompanionCore, InteractionEngine,
regras de progressão, criptografia, memória, modelos e formato de dados permanecem
iguais. Não há migração de estado nem nova identidade no modo normal.

## Abrir no computador de Didi

Requisito: Node.js 20 ou superior. Extraia o projeto em uma pasta separada para
inspecionar a atualização. O ZIP inclui os dados recebidos e o build atualizado.

```sh
npm run web:start
```

Abra http://127.0.0.1:4173. Para recompilar o código:

```sh
npm ci
npm run build
npm run web:start
```

Ollama continua em `http://localhost:11434`, com `gemma3:4b`. A interface nunca
chama esse endpoint diretamente: Web → API local → InteractionEngine → Core/provider.
Não deixe dois processos gravarem a mesma pasta de dados ao mesmo tempo.
Se a Mayuna do computador tiver experiências posteriores ao ZIP enviado, use essa
pasta `data/` mais recente **inteira**, incluindo `secure/` e `active-companion.json`.
Não substitua uma história mais recente pelos dados antigos deste pacote.

## Testar sem Ollama e sem alterar Mayuna

```sh
npm run web:mock
```

Este comando usa o MockAIProvider existente e cria uma identidade de demonstração
separada em `.mayuna-preview/`. A UI identifica claramente a IA simulada. Não há
fallback silencioso: o modo normal nunca muda de Ollama para mock.
O modo mock exige uma pasta de dados explícita quando iniciado manualmente.

## O que mudou

- Santuário procedural com Mayuna em forma SOUL, pedestal, cristais e presença visual.
- GameViewport com renderer substituível, ciclo de vida, resize e limite de DPR.
- HUD contido em `100dvh`; skills, passivas e hotbar com espaço reservado.
- Janelas laterais: minimizar, fechar, reabrir, mover e restaurar disposição.
- Arraste pelo título ou use Alt + setas com o título focado. Posições ficam no navegador.
- Botão ⛶ no viewport expande o mundo; clique novamente para restaurar o HUD lateral.
- Mobile com status compacto, cinco slots, dock e sheets próprios; adaptação em paisagem.
- Temas de cor existentes preservados; acabamentos Santuário, Obsidiana e Essencial.
- Memórias e diário lidos do Core; XP de Core e combate apresentados separadamente.
- Persistência das preferências tolerante a armazenamento indisponível.
- API desacoplada, chat serializado e inicialização que protege a identidade ativa.

Equipamentos, skills e passivas ainda são apresentações conceituais, não mecânicas
implementadas. Clicar nos slots abre a inspeção; isso não concede habilidades,
XP, equipamentos ou evolução. O mapa é uma representação visual do santuário.

## Módulos web

| Arquivo | Responsabilidade |
| --- | --- |
| `web/app.js` | Liga estado público, conteúdo, chat e eventos da UI |
| `web/modules/api.js` | Única fronteira HTTP do frontend |
| `web/modules/game-viewport.js` | GameViewport e renderer procedural |
| `web/modules/panel-manager.js` | Estado e posição das cinco janelas laterais |
| `web/modules/preferences.js` | Preferências locais, sem dados de autoridade |
| `web/styles.css` | Base visual anterior preservada |
| `web/sanctuary.css` | Layout contido e refinamento v0.2 por tokens |

Não foi introduzido React, bundler, Phaser ou dependência de produção.
A passagem para React pode ser discutida depois; não é necessária para polir o HUD.

## Contrato para Phaser

`new GameViewport(host, renderer)` aceita um renderer com:

```js
mount(host)
resize(width, height, dpr)
setTheme(rgb)
setState(readOnlyDTO)
setPresence(status)
render(time)
destroy()
```

O adapter futuro deve receber apenas o estado público. Inputs do mundo devem
virar solicitações para a API; a UI e o renderer não aplicam recompensas.
Caso Phaser assuma o próprio loop, o adapter deve pausar/resumir de forma coordenada
com o ciclo de vida do viewport. A integração real com Phaser ainda não foi feita.

## Performance

A arquitetura do cenário fica em um canvas auxiliar e é recalculada somente no
resize ou na mudança de tema. Apenas a alma e partículas animam. A animação tem
limite de 30 FPS e DPR de 1,5, para durante aba oculta e respeita movimento reduzido.
Não há consultas a `getComputedStyle` a cada quadro, polling de estado nem assets
externos no carregamento normal. Não medimos o consumo no notebook de Didi.

### Diagnóstico do Ollama no computador de Didi

Linux/macOS:

```sh
MAYUNA_DIAGNOSTICS=1 npm run web:start
```

PowerShell:

```powershell
$env:MAYUNA_DIAGNOSTICS="1"
npm run web:start
```

Os logs exibem tempos de request, carregamento do modelo, avaliação do prompt,
geração, InteractionEngine e gravação. Não imprimem prompts, memórias ou chaves.
Isso permite distinguir o custo de contexto, carregamento e persistência antes
de atribuir lentidão ao hardware. A serialização torna conversas simultâneas
sequenciais; o tempo na fila não é o tempo de geração. Há timeout de 120 s no
provider e 130 s no cliente. O modelo e seus parâmetros originais foram mantidos.

## Verificação

```sh
npm test
```

Os testes copiam os dados para diretórios temporários. Nunca conversam com a
Mayuna real nem chamam Ollama. O pacote também inclui `tests/ui-smoke.mjs` para
verificação opcional com Playwright:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node tests/ui-smoke.mjs
```

Veja `AUDITORIA_V0.2.md` para resultados, limites e próximos passos.
