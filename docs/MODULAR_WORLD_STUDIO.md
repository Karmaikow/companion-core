# Oficina modular: modelos, sprites e mundo

Esta ampliação depende do PR #13 (`feature/asset-studio-web`). A prévia usa
Three.js 0.180.0 já instalado; não é uma exportação Godot. Não altera Core,
identidade, memórias, progressão, refúgio anterior ou tabelas/políticas Supabase.

## Entrar e escolher onde guardar

1. Abra `/asset-studio.html` ou `/world-studio.html` no endereço de revisão.
2. **Minha conta online** exige a conta Companion Core nesse mesmo domínio.
   Use **Entrar na conta**, informe e-mail/senha em `/studio-login.html` e volte
   automaticamente à oficina. Também pode entrar no Core da mesma origem e
   usar **Já entrei · conferir acesso**. O login Vercel protege o deployment,
   mas não autentica na conta Companion Core. Sessões de produção e de outras
   prévias não atravessam domínios. Nenhum token é transportado em links.
3. Uma conta sem ADM continua em leitura do catálogo publicado. Não se concede
   ADM automaticamente. **Neste navegador** permite criar sem login: IndexedDB
   na origem atual; exporte um pacote para outro computador/endereço. Não há
   sincronização automática ou salvamento local disfarçado de online.

## GLB e variantes

Em **Modelos e mundo**, importe GLB 2 autocontido (até 20 MB / 600 mil vértices)
ou abra a árvore existente do repositório. Ajuste cor multiplicada e saturação,
clique **Ver ajustes**, compare **Ver original**, dê um nome e guarde.

A biblioteca guarda original + parâmetros. Variantes online reabertas podem
reutilizar o mesmo objeto GLB privado, com ficha própria. Nenhum material do
original é sobrescrito. Cor multiplica `baseColor`; saturação ajusta pixels RGB
da textura de cor e saturação da cor base. Alpha, normal, rugosidade, metal,
emissão e demais mapas continuam separados. A edição admite texturas de cor
até 4096 px e 16 MP no total. O export GLB incorpora os ajustes de cor; extensão
ou material incomum pode apresentar diferenças entre motores. Não há conversão
automática de malha/material arbitrário ao estilo pintado das referências.

Não suporta buffers/texturas externos nem Draco/Meshopt/KTX2 nesta versão.
Malhas animadas aparecem na pose base; o export inclui clips importados,
sem editor de rig/animação 3D. Não há retopologia/LOD automático. Importe peças
leves e confira desempenho real no dispositivo alvo.

## Folhas de sprites reais

A oficina existente `/sprite-studio.html` agora trabalha com parada, caminhada,
voo, ataque, receber golpe, desmaio e carinho/interação em oito direções. Use-a
para companions ou monstros. Importe PNG/WebP, escolha uma grade divisível
(até 512 células / 16 MP), associe índices de quadros a ação e direção e defina
FPS e repetição por sequência. Pode acrescentar faixas reais à folha e alinhar
bases. A matriz de cobertura mostra o que realmente existe; remover sequência
não apaga os desenhos da folha.

Oito quadros não significa oito FPS: 8 quadros a 8 FPS duram um segundo; a
12 FPS duram 2/3 de segundo. Nenhuma interpolação cria poses ou perspectivas.
Espelhamento é fallback explícito opcional; não completa a matriz. A câmera do
pedido é ortográfica elevada em 35°, com o mesmo apoio/escala por célula.
Monstros não precisam da anatomia de pássaro. Geração paga não é automática;
a geração de poses da oficina anterior continua restrita ao Core configurado.

Guarde na biblioteca selecionada para usar no mundo. **Aplicar neste dispositivo**
continua sendo o fluxo anterior do refúgio, específico do ID/forma e separado
da biblioteca modular. Para Godot 4, baixe `atlas.png`, `atlas.json` e
`companion_frames.tres`. Coloque o PNG na raiz (`res://atlas.png`), atribua o
`.tres` a `AnimatedSprite3D`, ligue billboard e ajuste `pixel_size`/offset a
partir do pivot do JSON. Só são exportadas sequências existentes.

## Receita → mundo jogável

1. Guarde uma variante ou imagem na biblioteca. Na receita, selecione um bioma,
   dê nome/cor de chão/densidade e acrescente regras. Cada regra escolhe peça,
   peso relativo, altura e raio de colisão do tronco/base. Modelos e imagens
   PNG podem compor o cenário (imagens são billboards); folhas de personagens
   são selecionadas separadamente. Até 6 biomas, 12 regras por bioma e 12 peças
   de cenário distintas carregadas por receita.
2. Escolha personagem e, opcionalmente, monstro de estudo. Ambos usam a mesma
   convenção de atlas; sem folha, Mayuna aparece como referência estática,
   explicitamente sem quadros de animação. O monstro nesta etapa é uma entidade
   de estudo parada; não há combate/IA/recompensas. Botões mostram as ações do
   personagem usando os quadros existentes; desmaio mantém a pose final.
3. Defina seed e raio (1 = 9 chunks, 2 = 25) e **Aplicar e explorar**. Chunks
   têm 16×16 unidades, bioma determinístico por coordenadas/seed e células
   espaçadas com corredores conectados. Peso escolhe a peça; densidade escolhe
   ocupação. A distribuição não depende da ordem de visita. Mudanças na receita
   geram outro resultado; não se promete a mesma distribuição entre versões.
4. Clique/toque no chão para rota A* (até 24 unidades por pedido); WASD/setas
   movem com verificação de colisão por segmento. Novas áreas entram ao cruzar
   chunks e áreas antigas saem. Geometrias/texturas de templates são
   compartilhadas, chão descartado e colisores reconstruídos. O limite não é
   um mapa estático: o centro acompanha a posição. Não existe mundo autoritativo
   online, expansão coletiva por recursos, multiplayer ou persistência de
   construções/itens nesta primeira integração.
5. Receita aplicada e posição ficam neste navegador; **Guardar receita** cria
   ficha de projeto local ou privada online. A posição é específica da receita;
   não é progresso verificável do Core. Se um colisor ocupar a posição antiga,
   a prévia volta ao início. Perda de storage local impede persistência e não
   deve ser confundida com sincronização em conta.
6. **Exportar pacote portátil** inclui receita e arquivos usados (até 16 peças /
   48 MB), sem sessão, referências privadas ou memórias. Importar valida as
   peças antes de criar versões e remapeia IDs. Em erro de quota/rede, peças
   já escritas permanecem identificadas; importação não é transação atômica
   entre ficheiros online. Guarde a receita após importar. Peças excluídas ou
   inacessíveis são informadas e omitidas, nunca apresentadas como geradas.

A receita JSON é exportável para um futuro gerador Godot, mas ainda não há
importador de biomas/chunks Godot. GLB de variante e SpriteFrames são exports
utilizáveis agora no editor Godot; o runtime procedural entregue é Three.js.

## Direção e limites da arte

Luz quente superior esquerda, preenchimento frio, sombra de contato e câmera
ortográfica harmonizam a prévia. A árvore GLB existente e pedras geométricas
são peças de estudo, não novas artes finais no estilo das três referências.
Copas pintadas/volumosas e pedras orgânicas exigem modelos/texturas ou imagens
reais apropriados. As referências não foram publicadas como assets. Ajustes de
paleta e saturação sozinhos não substituem essa produção artística.

## Testar

```sh
npm ci
npm run build
npm run dev
# No computador que executou o servidor:
# http://127.0.0.1:4173/world-studio.html?storage=local
node --test tests/world-modular.test.mjs
npx playwright install chromium
node tests/world-studio-browser.mjs
node tests/asset-studio-browser.mjs
node tests/asset-studio-cloud-browser.mjs
npm run vercel:build
```

Os testes de navegador exercitam WebGL/GLB, variantes, export/reabertura,
montagem de quadros reais de teste, biblioteca → mundo, movimento, pacote e
mobile. Serviços de conta/storage são interceptados nos testes cloud, sem
chamada paga ou escrita de produção. Godot não executado nesta validação.
