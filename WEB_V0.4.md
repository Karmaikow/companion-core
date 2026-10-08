# Mayuna Web v0.4 — núcleo holográfico e conversa na tela

Esta etapa continua a v0.3. O Core, os formatos de dados, a identidade, os
contratos de eventos, os snapshots e as memórias não mudaram.

## O que mudou

- O santuário de pedra, as montanhas e a lua deram lugar a uma câmara azul
  tecnológica: anéis holográficos, trilhas de circuito e piso em grade.
- A alma manteve filamentos, órbitas e partículas. A posição se adapta ao
  enquadramento de celular e abre espaço para o chat.
- O chat fica sempre visível dentro do GameViewport, com vidro translúcido,
  histórico rolável e campo de envio. Os atalhos de conversa focam o campo sem
  abrir modal. No celular, o chat compacto fica acima da hotbar.
- Azul-safira é o tema inicial. A cor violeta usada como padrão antigo migra
  para safira; outras cores personalizadas permanecem salvas.
- Perguntas sobre o que Mayuna fez durante uma pausa recebem uma resposta
  fundamentada nos limites da sessão. O prompt também proíbe inventar ações,
  pensamentos ou conversas fora das interações.

## Usar

Execute `npm run web:start` dentro da pasta do projeto e abra
`http://127.0.0.1:4173`. O Core decide as consequências da conversa; a UI apenas
mostra a resposta e o estado recebido. Ollama segue no endereço local
`http://localhost:11434`.

## Conexão e capacidade

A instalação local é a conexão mais direta, pois UI e API usam a mesma origem.
A versão hospedada permanece como prévia sintética: não acessa Core, Ollama,
identidade, memórias ou chave do computador. A publicação da v0.4 ficou
bloqueada porque o ambiente Work não conseguiu abrir o proxy de Git; o link
online continua servindo a publicação anterior até novo push/deploy. Uma
interface online precisa de pareamento autorizado e revogável com o runtime.
A proposta está em
`ARQUITETURA_PORTATIL.md`.

Cada processo local serializa as conversas daquela Companion para proteger a
ordem do histórico de eventos. Um processo único compartilhado por muitos
usuários causaria contenção e não é como a prévia hospedada funciona. O plano de
filas isoladas por Companion, limite de inferência e medição também está em
`ARQUITETURA_PORTATIL.md`.

## Verificação

- Build TypeScript passou.
- Testes de autenticação, identidade/continuidade e fila/Core passaram: 3
  arquivos de suíte, incluindo a pergunta real “oq fez nesse tempo?” e a
  variante “nesse tempo” com o perfil de outro companheiro.
- Verificação sintática dos módulos JavaScript passou.
- Os testes HTTP e visuais não puderam abrir servidor no Work Mode: o sandbox
  bloqueou `listen()` em loopback com `EPERM`. No PC local, rode `npm test` e
  `tests/ui-smoke.mjs` para exercitar API e sete tamanhos de tela.
- CSS e desenho do GameViewport foram alterados sem novas dependências.

Preserve a pasta `data/` mais recente ao atualizar uma instalação existente.
