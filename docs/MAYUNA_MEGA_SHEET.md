# Importar a mega folha da Mayuna

No Sprite Studio, abra **Importar mega spritesheet com espaçamento**.

1. Use a grade Mayuna e selecione o PNG original. O manifesto informa 240 quadros, 12 colunas, 20 linhas, células de 256 × 256 e intervalos de 5 px; dimensão total 3127 × 5215.
2. Se o arquivo for uma cópia reduzida proporcionalmente, marque essa opção explicitamente. Ela permite recortar a cópia, mas não recupera os detalhes da resolução original.
3. Clique em **Recortar e visualizar**. A prévia permite reproduzir, pausar e escolher um quadro. FPS inicia em 10 e pode ser ajustado de 1 a 30.
4. Clique em **AutoMap · classificar 8 direções**. Por padrão, o primeiro quadro ancora em S e a sequência segue S, SW, W, NW, N, NE, E, SE. Se a primeira pose apontar para outra direção ou o vídeo girar ao contrário, escolha a âncora e a ordem antes de rodar novamente.
5. Examine os intervalos resultantes. Cada campo continua editável; ajuste números, use início/fim e **Usar trecho**, ou escreva intervalos como `0-15,20,22-25`. A prévia da direção reproduz somente os quadros selecionados.
6. Escolha a ação e habilite repetição somente se a emenda formar um ciclo adequado. Envie os recortes ao Studio; o projeto guarda o método AutoMap e se os intervalos foram editados manualmente.
7. Revise as direções, a escala e o ponto de apoio no Studio. Os recursos existentes de alinhamento e edição continuam disponíveis. Exporte PNG + JSON para guardar o projeto ou use **Aplicar neste dispositivo** para carregá-lo no GameViewport do mesmo companion e geração, no mesmo navegador/origem.

O recorte preserva a transparência, o tamanho das células e a posição do desenho dentro delas; remove apenas margens/intervalos configurados. A grade original resulta em PNG de 3072 × 5120. O ponto de apoio inicial é `(0.5, 0.95)`, editável no Studio. Movimentação do personagem dentro das células do vídeo ainda requer revisão/alinhamento.

## O que o vídeo fornece

O manifesto descreve dez segundos de caminhada com rotação. Isso não garante oito ciclos completos de caminhada em vista fixa. AutoMap v1 distribui os quadros em oito setores contíguos pela ordem da folha; com 240 quadros, cada setor recebe 30. A âncora e o sentido da rotação podem ser escolhidos. Isso classifica a sequência sem criar ou interpolar desenhos, mas não verifica por visão computacional se cada rótulo combina com a pose real: a saída permanece um rascunho revisável e os limites podem ser corrigidos antes da aplicação. Se a folha não contiver uma volta ordenada, use os campos manuais. Direções sem quadros continuam ausentes; o mundo usa o fallback existente. Importação não ativa espelhamento automaticamente.

A importação é local e não chama APIs de geração. Não altera identidade, evolução nem dados do Core. A folha aplicada é isolada pela chave de companion e geração. Canvas e WebGL recebem atualizações ao salvar e respeitam FPS, repetição e pausa no último quadro. Um novo movimento/direção reinicia a sequência.

## Validação deste PR

- `node --test tests/sprite-sheet-import.test.mjs tests/refuge-3d.test.mjs tests/refuge-motion.test.mjs tests/sprite-batch.test.mjs`: 15 testes passaram.
- AutoMap acrescenta testes para oito setores, 240 quadros sem perda, FPS 10, âncora/sentido reverso, grades não divisíveis por oito e edição de intervalos.
- Bundles dos dois renderizadores compilados com esbuild.
- `node tests/sprite-sheet-browser.mjs`, após gerar os bundles: Chrome/Playwright testa a página real do Studio, recorte de 240 células, preservação de alpha, oito direções explicitamente marcadas, FPS, aplicação no IndexedDB, reprodução Canvas/WebGL, atualização ao salvar e isolamento entre gerações. O teste usa uma folha sintética com a mesma grade e não chama serviços externos. Requer Chrome instalado; `BROWSER_CHANNEL` permite escolher outro canal disponível.
- Não foi executada a suíte completa de backend. O PNG anexado não pôde ser baixado neste ambiente; portanto a fidelidade visual da Mayuna e o mapeamento artístico dos trechos continuam pendentes. O arquivo real não foi substituído nem incluído como se tivesse sido validado.

O PR se apoia em `feature/sprite-factory-prototype`, que já contém `feature/modular-world-studio`. Nenhum merge ou deploy é necessário para revisar o código.
