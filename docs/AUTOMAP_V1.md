# AutoMap v1 (local e revisável)

Branch dependente de `feature/mayuna-mega-spritesheet`, commit
`af43b269b52a9cbe479e4a8a487566a0d6a0db32` do PR #19. Não altera a branch base.

## Uso

1. Abra o Sprite Studio, importe a mega folha e confira a grade. O preset
   Mayuna continua com 12 × 20 células e espaçamento de 5 px.
2. Recortar inicia a análise local, em FPS 10. Consulte confiança e continuidade
   por quadro. Células transparentes ficam vazias/incertas.
3. Pause ou use o controle de quadro. Confirme exemplos visuais nas direções
   S/SW/W/NW/N/NE/E/SE que conseguir reconhecer. O sistema compara os demais
   quadros com esses exemplos; não supõe a ordem da rotação nem divide a folha
   em oito partes iguais. Confirmar um quadro em outra direção substitui sua
   referência anterior. Reanalisar substitui os intervalos editados; desfazer mapa
   recupera o estado anterior.
4. Revise os intervalos, as sugestões de ciclo e a emenda. Usar uma sugestão
   altera o intervalo; repetir continua sendo uma confirmação explícita.
5. Envie ao Studio. Edite sequências nos campos existentes ou use os controles
   de posição para reordenar, remover e transferir quadros entre direções.
   Os índices começam em zero. Remover não apaga o desenho da folha.
6. Pause a prévia e selecione um quadro para deslocar seu desenho em pixels.
   O deslocamento fica restrito à célula; partes fora dela são cortadas.
   O pivô global continua editável. Desfazer/refazer inclui PNG, sequências e pivô
   (até 50 estados, durante a sessão). Restaurar importação recupera o resultado
   enviado ao Studio, incluindo as correções já feitas no importador.
7. Aplicar persiste PNG, atlas, relatório e cópia inicial no IndexedDB, isolados
   por companion e geração. Reabrir recupera o projeto e a cópia inicial.
   Exportar PNG + JSON preserva o atlas e os dados de revisão. A exportação não
   inclui o histórico de desfazer nem uma segunda cópia dos pixels originais;
   depois de reimportar um PNG deslocado, só o mapa/pivô inicial pode ser restaurado.
   Guarde o PNG original para recuperar esses pixels entre dispositivos.

## Algoritmo e limites

Cada célula vira uma miniatura local de 32 × 32 e um descritor de 8 × 8 regiões
RGBA com cores ponderadas pelo alpha. A classificação compara distância L1 ao
exemplo confirmado mais próximo de cada direção. A diferença entre os dois
melhores resultados e a distância absoluta produzem um escore heurístico de
confiança, **não uma probabilidade calibrada**. Referências confirmadas têm escore
1. Só um exemplo, empates e diferenças insuficientes mantêm os outros quadros
incertos. Não há modelo semântico, download de pesos, API ou cobrança.

A continuidade compara quadros vizinhos na ordem original. Ela pode separar
trechos com saltos visuais, mas nunca atribui uma direção. Ciclos são sugestões
de retorno visual dentro de um trecho contínuo da mesma direção, com movimento
intermediário; uma pose estática não vira ciclo automaticamente. Uma emenda
parecida não comprova biomecânica, periodicidade ou caminhada em vista fixa.

**Não é reconhecimento semântico autônomo das oito vistas.** Sem exemplos
confirmados, todos os rótulos ficam incertos. Cores, oclusão e poses semelhantes
podem confundir frente/costas e diagonais. O fallback manual permanece necessário.
Direções sem quadros não entram no atlas; Canvas/WebGL continuam sinalizando o
fallback existente, sem duplicar ou sintetizar frames.

## Validação

- Testes unitários: incerteza sem referências, semelhança com referências,
  direções ausentes, alpha, empates, referências inválidas, continuidade,
  ciclos estáticos/positivos e histórico.
- Teste real do Studio em `tests/sprite-sheet-browser.mjs`: folha sintética
  de 240 células, FPS 10, referência e desfazer mapa, edição e histórico de
  sequências/pivô, persistência, restauração após recarregar, Canvas/WebGL,
  atualizações ao aplicar e isolamento de gerações.
- A imagem `/mnt/data/mayuna_spritesheet_240_frames.png` não está disponível
  neste host Windows. A qualidade artística da classificação da Mayuna não foi
  validada. O teste sintético não substitui essa revisão visual.

Executar: `npm run build`, `node scripts/run-tests.mjs`,
`node tests/sprite-sheet-browser.mjs` (Chrome e Playwright instalados).
