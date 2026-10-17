# Geração automática de sprites

No Estúdio de Sprites, a seção "Geração automática" recebe uma referência PNG/JPEG/WebP e permite escolher ações, direções, 2–8 quadros por sequência e células finais de 128 ou 256 px.

## Fluxo
1. Preparar lote sem cobrar: a referência é normalizada para PNG até 850 KB; o plano verifica o limite de 512 quadros e 16 milhões de pixels.
2. Conferir o número de chamadas e autorizar a cobrança do lote. O padrão é idle/walk/attack/sleep/happy/defend nas oito direções: 48 chamadas, quatro quadros cada, 192 quadros.
3. Gerar sequencialmente, mantendo a mesma referência original para cada pedido. Não utiliza Tripo nem seus créditos: usa a API de imagens já configurada.
4. Pausar após a chamada atual; retomar envia somente pedidos pending. O checkpoint IndexedDB é confirmado antes de enviar cada chamada e depois de salvar o resultado.
5. Montar o atlas: as células são recortadas por alpha, alinhadas pela base com uma escala global e associadas à ação/direção. Só sequências recebidas entram na cobertura, com espelhamento desabilitado.
6. Revisar no editor, guardar na biblioteca e selecionar a folha na Oficina do mundo. Não aplica ao Core ou ao mundo automaticamente.

sleep, happy e defend foram adicionados ao contrato do atlas, aos seletores e às ações de teste do mundo. Os estados anteriores continuam válidos.

## Execução e recuperação
- Navegador precisa de Web Locks (HTTPS/localhost), IndexedDB e Canvas. O bloqueio impede duas abas de executarem o mesmo lote ao mesmo tempo. Não é um orçamento global entre dispositivos.
- Mantenha a página aberta. Não é fila de servidor nem execução em background garantida.
- Recarregar ou falhar deixa a chamada em uncertain. Ela não é enviada novamente automaticamente. Retomar ignora chamadas incertas e continua apenas as não enviadas; o atlas parcial preserva a cobertura faltante.
- Na web, cada pedido possui UUID e usa a reserva/deduplicação existente em /api/studio. A referência é registrada como character-reference e o resultado como sprite-strip privado. Para uma chamada incerta, confira seu UUID na biblioteca e no provedor antes de qualquer novo lote.
- No Core local, usa /api/companion/art/sprite e suas exigências existentes de sessão/provedor. O endpoint local não ganhou deduplicação no servidor; o checkpoint cliente evita repetição automática.
- Checkpoints pertencem a este navegador/origem; não contêm tokens ou chaves de provedor. Preparar novo lote substitui o anterior somente após confirmação explícita.
- PNG opaco ou célula vazia bloqueia a montagem. Poses, anatomia, ordem e identidade não podem ser certificadas por esse teste: dependem do gerador e de revisão humana. Não há garantia de todas as sequências geradas serem utilizáveis.

## Provedor e custos
Preserva COMPANION_IMAGE_API_KEY e COMPANION_IMAGE_MODEL no servidor. Na web, mantém login, verificação ADM, bucket privado e políticas existentes, sem schema ou permissões novos. O modo sprite usa o prompt de animação diretamente, sem as instruções incompatíveis de "sem personagem/sem sprite sheet" usadas para objetos de cenário.
O custo depende do modelo e de cada chamada. Nenhuma geração paga faz parte dos testes.

## Validação
- npm run build
- node --test tests/sprite-batch.test.mjs tests/sprite-batch-cloud.test.mjs
- node tests/sprite-batch-browser.mjs (Chromium Playwright instalado; SPRITE_CHROMIUM_EXECUTABLE opcional)
Os testes de navegador usam respostas simuladas, Canvas/IndexedDB reais, montagem/reabertura e rejeição de folha opaca. Não verificam o serviço pago real nem a qualidade artística de uma animação gerada.
