# Atualização de conexão e chat flutuante — Mayuna v0.5

Este pacote contém código completo atualizado. Não contém data/, identidade, memórias ou chaves. Extraia seu conteúdo na pasta do projeto existente; a pasta data/ da sua Companion deve permanecer no lugar.

## No computador do Core

1. Instale as dependências: `npm install`.
2. Compile: `npm run build`.
3. Com o Ollama aberto, execute no terminal Linux:

```sh
MAYUNA_REMOTE_ORIGIN=https://mayuna-companion-interface.diegozxcvbnm.chatgpt.site npm run web:start
```

4. Abra http://127.0.0.1:4173 e entre com o acesso local.
5. Abra Configurações → Conexão online → Gerar código.
6. No mesmo computador, abra https://mayuna-companion-interface.diegozxcvbnm.chatgpt.site e digite o código. Permita acesso à rede local se o navegador solicitar.

O código vale por 2 minutos e uma utilização. A sessão fica em memória por até 2 horas. Atualizar a aba exige outro pareamento. Ollama permanece no endpoint original; a chave privada permanece no Core.

## Chat flutuante

O chat agora é filho do mundo e fica limitado à sua área. Arraste pelo cabeçalho, minimize no botão — e restaure pelo botão + ou por Falar com Mayuna. Com o cabeçalho focado, Alt + setas move a janela. Desktop e mobile guardam preferências de posição separadas.

## Verificações

Build e 18 testes passaram, incluindo o fluxo HTTP completo de login local, geração do código, pareamento, interação, identidade, verificação e revogação. Os testes usam IA simulada e cópias isoladas dos dados. O Ollama real e a revisão visual de desktop/mobile ainda precisam ser conferidos no computador do usuário.

Esta versão conecta a interface online ao Core do mesmo computador. Acesso pelo celular a um Core no PC e transferência entre dispositivos ainda são etapas futuras.
