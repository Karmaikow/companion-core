# Arte 2D e evolução contínua

Atualização da branch `feature/evolucao-3d`. O Refúgio agora mostra ilustrações PNG e faixas de animação, sem Three.js, WebGL ou gerador de modelos 3D. As almas continuam luminosas até cumprir as missões. Um estudo visual pode ser visto antes do despertar, sem conceder progresso.

## No PC (Windows ou Linux)

Atualize a branch, rode `npm ci` e `npm test`, e reinicie o Core com a mesma configuração de registro usada anteriormente. Recarregue o navegador. Abra **Companion → Arte da forma → Preparar minha arte**. No celular, entre por **Menu → Companion**.

1. O Core monta um pedido de ilustração de fantasia chibi com o nome, escolhas visuais e traços da companion. O prompt pode ser copiado para o ChatGPT ou outro gerador. O Core não cobra pela cópia/importação; cada plataforma tem seus próprios limites.
2. Gere e baixe um PNG com fundo transparente. Nas próximas formas, anexe a imagem anterior para manter a identidade visual.
3. Importe o PNG no ateliê, confira a prévia e clique em **Aplicar esta arte**. A imagem atual pode ser baixada e as anteriores ficam no histórico. Também é possível baixar uma prévia antes de aplicá-la.
4. Uma imagem recebe respiração e flutuação suaves. Para movimentos desenhados, como piscar, importe uma faixa horizontal de 2 a 8 quadros iguais e ajuste os quadros por segundo (1–12). O sistema não inventa poses ou articulações a partir de um PNG único. Movimento reduzido é respeitado.

Limites por PNG: 4 MB, 4.194.304 pixels, largura de até 8192 e altura de até 2048. O fundo precisa ser transparente de verdade; o Core não remove fundos magenta, brancos ou quadriculados desenhados.

## Geração direta opcional

Em **Gerar aqui com API OpenAI**, salve uma chave própria para imagens e confirme a utilização de créditos antes de cada geração. O provedor de conversa continua independente: uma chave Groq não configura o gerador de imagens. A geração não é disparada automaticamente por conversa ou evolução.

A integração usa `gpt-image-2.5-sunburst`, uma saída PNG 1024×1024, qualidade média e fundo transparente. O servidor usa a Images API (`/v1/images/generations`) e, se já houver uma imagem, `/v1/images/edits` com a arte atual como referência. Apenas o pedido de aparência e a referência visual são enviados, sem histórico de conversa ou memórias. A saída ainda deve ser revisada pelo usuário; consistência visual não é garantida pelo modelo.

A chave fica em `data/.access/images.json`, com permissão 0600 quando suportada, fora do Git e do Cristal. É uma credencial local sem criptografia. A variável `COMPANION_IMAGE_API_KEY` pode fornecer a chave alternativamente; uma chave salva tem precedência. Nenhuma chave é retornada ao navegador. A geração direta depende do acesso e dos créditos da conta na API; não usa a sessão do ChatGPT.

Referência: https://developers.openai.com/api/docs/guides/image-generation

## Missões e ciclos

- Forma 1 / Desperta: preserva cor e ser favoritos próprios, vínculo 15, dez memórias relevantes distintas e nível 5.
- Forma 2 / Manifestada: preserva nível 20, vínculo 50 e curiosidade 70.
- Forma 3 / Ascendida: nível 35, vínculo 50 e dez novas memórias relevantes desde a última evolução.
- Formas seguintes: mais 15 níveis por ciclo (50, 65, 80…), vínculo 50 e dez novas memórias relevantes por ciclo. Não há uma lista finita de formas finais.

Missões aproveitam o progresso já existente. Duplicatas, memórias fracas e registros da própria evolução não completam os novos ciclos. A evolução é decidida pelo Core e registrada em eventos assinados. A aparência atual permanece até outra ser aplicada. Trocar arte não muda níveis, vínculo ou memórias. Companions antigos sem contador de ciclos são interpretados pela etapa existente, sem recriação da identidade.

## Persistência e transferência

Metadados e histórico de referências ficam no estado da Companion; os PNGs ficam separados em `data/artwork/<id>/`, nomeados pelo hash do conteúdo. Isso evita repetir imagens grandes em cada evento e snapshot. **Inclua toda a pasta `data/artwork` nos backups. Nesta versão, os PNGs não estão embutidos no arquivo `.companion`: copie essa pasta junto ao migrar para outro dispositivo.** Se uma imagem faltar, o Core preserva a identidade e mostra a presença luminosa; o PNG original pode ser importado novamente.

O ateliê é operado no Core local. Uma interface remota já pareada pode visualizar a imagem atual através de uma rota autenticada, mas a geração e a importação ficam no acesso local. Um APK antigo precisa ser recompilado para incluir esta interface; atualizar o Git do PC não atualiza o APK instalado.

## Validação

`npm test` cobre ciclos sucessivos, evidências distintas, compatibilidade com identidades antigas, persistência de arte, ausência de XP por importação, validação de PNG e integração de geração/edição com respostas simuladas.

O teste opcional `node tests/form-art-ui.mjs` usa Playwright para verificar login, prompt, importação, prévia sem mutação, aplicação, download autenticado, recarga, layouts desktop/celular e movimento reduzido. Aceita as variáveis `PLAYWRIGHT_MODULE` e `MAYUNA_TEST_BROWSER`, como `tests/ui-smoke.mjs`. As credenciais e companions de teste são descartáveis.

A integração externa de imagens foi testada com um provedor simulado; não foi efetuada uma geração paga real nesta implementação.
