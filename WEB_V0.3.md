# Mayuna Web v0.3 — entrada, reconhecimento e HUD Astral

Esta versão continua a v0.2. O Core, formatos de dados, identidade, eventos,
snapshots e memórias recebidos foram preservados. Não execute a antiga demo
CLI para testar a interface: ela simula eventos e rollback. Use os comandos abaixo.

## Abrir no computador de Didi

Com Node.js instalado, extraia o projeto e, na pasta `mayuna`, execute:

```sh
npm run web:start
```

Abra `http://127.0.0.1:4173`. O build está incluído. Para desenvolver:

```sh
npm install
npm run build
npm test
```

No primeiro acesso, crie um usuário e senha locais. Não há senha padrão.
O usuário do login não renomeia Didi nem a Mayuna. A tela seguinte mostra a
identidade existente antes de entrar no santuário. Sair bloqueia o HUD e limpa
as mensagens visíveis. Reiniciar o servidor exige login novamente.

A conta fica em `data/.access/account.json`, separada da identidade Ed25519.
A senha usa scrypt com salt; a sessão usa cookie HttpOnly/SameSite Strict,
expira em 12 horas e fica apenas na memória do servidor. Há limite de tentativas.
É uma conta local única, não um sistema de contas online, MFA ou criptografia
portátil. O login não protege os arquivos de alguém que já tem acesso ao disco.

Para atualizar uma instalação que já continuou a história, **preserve a pasta
`data/` mais recente inteira**, incluindo `secure/` e `.access/`. Faça uma cópia
antes da atualização e não substitua esses dados pela cópia antiga do pacote.
Nunca envie `data/secure/` à hospedagem ou ao navegador.

## Reconhecimento de Didi

O perfil real já registrava Didi. A resposta do modelo podia negar essa
informação e interpretar o nível de vínculo STRANGER como desconhecimento de
identidade. A camada de expressão agora recebe explicitamente a pessoa atual
e distingue identidade de vínculo.

Perguntas diretas como “Estou bem, qual é o meu nome?” são resolvidas pelo
perfil, sem depender do Ollama. O guard também corrige a negação observada na
captura. Não foram criadas memórias para esconder o problema. O nome completo
não é inventado. A proteção é delimitada: não é um verificador universal de fatos.

As demais respostas continuam no Ollama local, `http://localhost:11434`, com
`gemma3:4b`. Latência e qualidade dessas respostas ainda precisam ser avaliadas
no PC de Didi; este ambiente não acessa o Ollama dele.

## Interface

- Entrada e reencontro com a Companion, sem gerar outra identidade ao entrar.
- Tema Astral: bordas luminosas, cantos angulares, hover e painéis de vidro.
- Alma com filamentos, órbitas e partículas em Canvas, substituindo a gota.
- Pequena fala no mundo após a resposta; conversa completa continua opcional.
- Painéis minimizáveis, fecháveis, restauráveis e móveis no desktop.
- Mobile com dock, hotbar e sheets próprios; nenhum scroll global.
- Temas CSS e estilos anteriores mantidos; estrutura do renderer preservada.
- Canvas limitado a 30 fps/DPR 1,5, pausado na entrada, com movimento reduzido.

Inventário, skills e mundo seguem em preparação; não se tornaram um MMORPG
com combate funcional. O renderer continua desacoplado para futura integração
com Phaser. As imagens em `docs/previews/` usam Companion de teste isolada.

## Prévia online e offline

A publicação contém **somente a interface e dados sintéticos**. Não inclui
Core, chave privada, arquivos pessoais ou servidor Ollama. O transporte da
interface está separado em `web/modules/http.js`; a publicação utiliza o modo
`demo`, enquanto este pacote usa o modo `local` e a API existente.

O manifest e service worker guardam somente arquivos estáticos. Nenhuma rota
`/api/`, sessão ou resposta real da Companion entra nesse cache. A prévia
pode recarregar offline após a primeira carga completa. Na versão local, abrir
o shell offline não substitui a necessidade de executar o servidor do Core.

A entrada da prévia não pede senha: ela não conecta a Companion pessoal.
O login implementado neste pacote é local. Pareamento seguro do Site com o
Core do dispositivo ainda não está implementado. Veja `ARQUITETURA_PORTATIL.md`.

## Testes e limites

- Build TypeScript e 13 testes automatizados aprovados: integridade, não
  substituição de identidade, falhas do provider, serialização de chat,
  fronteiras HTTP, autenticação e regressão de reconhecimento.
- Teste de navegador: sete dimensões, desktop/mobile, controles dentro da
  viewport, sheets, preferências, painéis, chat, reconhecimento e logout/login.
- Teste de prévia: recarga offline, resposta demonstrativa, nenhuma chamada
  de API real e nenhum dado do Core no cache.
- Quinze arquivos protegidos do projeto original comparados byte a byte,
  sem alterações, incluindo todos os dados recebidos.

Os testes opcionais de navegador estão em `tests/ui-smoke.mjs` e
`tests/offline-demo.mjs`; precisam de Playwright e Chromium instalados. Não são
dependências do aplicativo. A integração opcional WebMCP foi preparada com
feature detection, mas não validada em um navegador que ofereça essa API.

O pacote inclui a identidade privada que já estava no projeto de Didi para
preservar a continuidade local. Trate o ZIP como backup pessoal; ele não é o
artefato publicado no Site e ainda não é um `.mayuna` criptografado.

Prévia hospedada (acesso restrito ao proprietário):
https://mayuna-companion-interface.diegozxcvbnm.chatgpt.site
