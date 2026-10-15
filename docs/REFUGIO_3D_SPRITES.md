# Refúgio 3D e Estúdio de Sprites

## Executar

```sh
npm ci
npm run build
npm run web:mock
```

Abra o endereço informado pelo servidor. A tela principal usa o novo renderer;
`/refuge-lab.html` permite experimentar sem alterar a Companion ou seu progresso.
`/sprite-studio.html` abre o editor. O link na tela principal inclui o ID e o
número da forma ativa; o laboratório usa uma identidade visual independente.

O mesmo diretório `web/` é utilizado pelo navegador, build estático Vercel e
empacotamento Android existente. Three.js 0.180.0 é empacotado localmente,
sem CDN. O APK precisa ser recompilado e assinado com a chave já adotada pelo
projeto; nenhuma nova chave foi criada. A validação em navegador móvel emulado
não substitui testes de desempenho em aparelho Android real.

## Cenário e movimentação

- Templo, árvore, lago e caminho são os GLBs fornecidos pelo usuário, em
  `web/assets/refuge/`. Árvores e caminhos compartilham os recursos carregados.
- Chão, céu, iluminação ambiente e sombra de contato são gerados no renderer.
- Clique/toque calcula o destino no plano do mundo. A* evita templo, lago e
  troncos, incluindo margem para o personagem. Arrastar não ordena caminhada.
- A velocidade é medida no mundo e o ciclo de passos acompanha a distância.
- A alma permanece parada; a movimentação exige corpo ou prévia de corpo.
- Os sprites participam do teste de profundidade e podem ficar atrás dos modelos.
- WebGL indisponível ou contexto perdido retorna ao renderer Canvas 2D anterior.
- A preferência por movimento reduzido congela os quadros decorativos, mantendo
  o deslocamento necessário à navegação. A renderização pausa em aba oculta.
- O service worker mantém o shell e armazena modelos/atlas sob demanda após
  carregamento. Offline exige uma visita anterior com os recursos carregados.

## Animação inicial

`mayuna-reference.png` é a referência enviada. `mayuna-walk.png` é um estudo
gerado a partir dela, com 8 quadros (4 colunas × 2 linhas), normalizado para
1792 × 896. `mayuna-walk.json` descreve o atlas. Há uma direção SE de caminhada
e uma pose parada; espelhamento cobre SW. As demais direções usam uma pose
disponível e são explicitamente apresentadas como incompletas no editor.
Voo e ataque ainda não têm arte produzida. Não confundir suporte do sistema a
8 direções e quatro ações com a existência de todos esses desenhos.

O desenho inicial é usado para Mayuna na primeira forma quando não há outra
arte aplicada. Outras Companions preservam sua própria arte. Um projeto salvo
no Estúdio tem prioridade, somente para o ID e a forma indicados.

## Estúdio

Importe PNG/WebP, informe a grade e cadastre sequências por ação e direção.
É possível pausar, percorrer os quadros, ajustar o apoio dos pés, alinhar as
bases pela transparência e permitir espelhamento. O alinhamento preserva uma
escala global e precisa ser revisado visualmente em personagens assimétricos.
Marque “Acrescentar quadros à folha atual” para reunir várias folhas de ações
ou direções em um atlas, preservando as sequências anteriores. Os quadros novos
recebem índices contínuos. Gerações por IA também são acrescentadas para revisão.

Exporte `atlas.png` e `atlas.json` juntos. Para importar um projeto, carregue o
PNG e em seguida o JSON. Aplicar salva em IndexedDB e notifica o renderer;
não altera XP, memórias, identidade assinada ou registros do Core. A configuração
é local ao navegador/origem; exporte o par para levar a outro dispositivo.

O formato versionado usa `frameWidth`, `frameHeight`, `columns`, `rows`, `pivot`
normalizado e `clips[action][direction] = {frames: [...], fps}`. Índices começam
em zero. Ações: idle, walk, fly, attack. Direções: S, SW, W, NW, N, NE, E, SE.

Geração por IA é opcional e manual. O editor prepara o prompt e recebe PNG de
referência. O endpoint autenticado `/api/companion/art/sprite` reutiliza o
provedor de imagens já configurado no Core local, exige consentimento de cobrança,
verifica a Companion/forma ativa e devolve a imagem apenas para revisão.
Não há geração automática no carregamento, na evolução ou no clique de movimento.
Na versão estática, copie o prompt e importe o PNG gerado externamente.

Documentação do provedor: https://developers.openai.com/api/reference/resources/images/methods/edit

## Verificar

```sh
npm run build
node --test tests/refuge-3d.test.mjs tests/refuge-motion.test.mjs
node tests/refuge-browser.mjs
```

O teste de navegador usa Playwright; configure `MAYUNA_TEST_BROWSER` para um
Chrome instalado, ou instale o Chromium do Playwright. Ele cobre carregamento
dos GLBs, movimento, persistência/exportação do atlas e layout móvel, além da
integração com a tela principal e a separação entre alma e corpo.
