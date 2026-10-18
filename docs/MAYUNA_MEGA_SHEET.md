# Importar a mega folha da Mayuna

O importador agora inicia o **AutoMap v1 local**, com FPS padrão 10 e
classificação revisável por referências confirmadas. Consulte
[AutoMap v1](AUTOMAP_V1.md) para edição, confiança, histórico e limitações.

No Sprite Studio, abra **Importar mega spritesheet com espaçamento**.

1. Use a grade Mayuna e selecione o PNG original. O manifesto informa 240 quadros, 12 colunas, 20 linhas, células de 256 × 256 e intervalos de 5 px; dimensão total 3127 × 5215.
2. Se o arquivo for uma cópia reduzida proporcionalmente, marque essa opção explicitamente. Ela permite recortar a cópia, mas não recupera os detalhes da resolução original.
3. Clique em **Recortar e visualizar**. A prévia permite reproduzir, pausar, escolher um quadro e ajustar FPS entre 1 e 30.
4. Examine a orientação do personagem e marque os quadros para S, SW, W, NW, N, NE, E e SE. Use início/fim e **Usar trecho**, ou escreva intervalos como `0-15,20,22-25`. **Ver N**, por exemplo, reproduz apenas o trecho associado a N.
5. Escolha a ação e habilite repetição somente se a emenda formar um ciclo adequado. Envie os recortes ao Studio.
6. Revise as direções, a escala e o ponto de apoio no Studio. Os recursos existentes de alinhamento e edição continuam disponíveis. Exporte PNG + JSON para guardar o projeto ou use **Aplicar neste dispositivo** para carregá-lo no GameViewport do mesmo companion e geração, no mesmo navegador/origem.

O recorte preserva a transparência, o tamanho das células e a posição do desenho dentro delas; remove apenas margens/intervalos configurados. A grade original resulta em PNG de 3072 × 5120. O ponto de apoio inicial é `(0.5, 0.95)`, editável no Studio. Movimentação do personagem dentro das células do vídeo ainda requer revisão/alinhamento.

## O que o vídeo fornece

O manifesto descreve dez segundos de caminhada com rotação. Isso não garante oito ciclos completos de caminhada em vista fixa. O sistema exige seleção explícita dos trechos: não divide arbitrariamente os 240 quadros em oito partes nem cria vistas novas. Direções ausentes continuam indicadas como ausentes pelo Studio; o mundo usa o fallback existente. Importação começa como rascunho e não ativa espelhamento automaticamente.

A importação é local e não chama APIs de geração. Não altera identidade, evolução nem dados do Core. A folha aplicada é isolada pela chave de companion e geração. Canvas e WebGL recebem atualizações ao salvar e respeitam FPS, repetição e pausa no último quadro. Um novo movimento/direção reinicia a sequência.

## Validação deste PR

- `node --test tests/sprite-sheet-import.test.mjs tests/refuge-3d.test.mjs tests/refuge-motion.test.mjs tests/sprite-batch.test.mjs`: 15 testes passaram.
- Bundles dos dois renderizadores compilados com esbuild.
- `node tests/sprite-sheet-browser.mjs`, após gerar os bundles: Chrome/Playwright testa a página real do Studio, recorte de 240 células, preservação de alpha, oito direções explicitamente marcadas, FPS, aplicação no IndexedDB, reprodução Canvas/WebGL, atualização ao salvar e isolamento entre gerações. O teste usa uma folha sintética com a mesma grade e não chama serviços externos. Requer Chrome instalado; `BROWSER_CHANNEL` permite escolher outro canal disponível.
- Não foi executada a suíte completa de backend. O PNG anexado não pôde ser baixado neste ambiente; portanto a fidelidade visual da Mayuna e o mapeamento artístico dos trechos continuam pendentes. O arquivo real não foi substituído nem incluído como se tivesse sido validado.

O PR se apoia em `feature/sprite-factory-prototype`, que já contém `feature/modular-world-studio`. Nenhum merge ou deploy é necessário para revisar o código.
