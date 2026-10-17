# Estúdio de Assets dentro do Companion Core

Entrada: `/asset-studio.html`, pelos menus do Core e da tela de conta/Cofre.
O Studio separado anterior continua disponível em
https://companion-studio.diegozxcvbnm.chatgpt.site; esta implementação está no
mesmo domínio e usa a sessão da conta Companion Core.

## Fluxo entregue

1. Escolher tipo, nome, descrição e paleta; anexar até três referências PNG/JPEG/WebP.
2. Rever/copiar o pedido completo. O preset estabelece câmera ortográfica 3/4
   elevada, contornos coloridos finos, volumes pintados, escala legível ao lado
   de uma Companion chibi e luz superior esquerda. A direção foi elaborada a
   partir das três referências enviadas na conversa, sem copiar suas imagens
   para os assets distribuídos. Os originais não estão no bundle público.
3. Importar arte ou, se houver credencial no servidor, confirmar o envio das
   referências e a chamada paga para gerar uma opção. Cada clique cria uma
   opção; não há geração automática, retry de cobrança ou resultado simulado.
4. Comparar opções, conferir transparência real e escala no cenário de estudo.
   A sombra de contato desse cenário não é gravada na imagem. PNGs opacos são
   identificados; não há removedor automático de fundo.
5. Guardar rascunhos e reabrir com pedido, referências e imagem. Exportar/importar
   a biblioteca ou baixar o PNG. Guardar cria uma nova versão privada, sem
   publicar o asset no jogo nem modificar o refúgio.

## Persistência e acesso

**Minha conta online:** reutiliza `studio_assets`, `studio_admins` e o bucket
privado `companion-studio`. A sessão e a renovação vêm de `cloud-vault.js`.
Rascunhos e referências exigem a permissão ADM existente; outras contas veem o
catálogo publicado em modo de leitura. Não são criadas tabelas, concessões de
administração ou políticas. Downloads usam JWT no header, sem URLs públicas.

**Neste navegador:** IndexedDB, com escrita confirmada pelo fim da transação.
Não sincroniza com a conta; exporte a biblioteca para transportar. Uma falha de
rede no modo online nunca é apresentada como salvamento local bem-sucedido.

Referências são normalizadas para PNG de até 768 px / 900 KB e armazenadas
separadamente com `purpose: style-reference-only`. Artes importadas preservam
alpha e são reduzidas a até 2048 px / 4 MB. Importações aceitam arquivos de até
16 MB. A biblioteca lista até 100 registros recentes e exibe 24 por busca;
exportação portátil limita-se a 30 registros / 32 MB. GLBs do catálogo anterior
permanecem intactos; esta prévia é para imagens 2D.

## Geração na Vercel

`api/studio.ts` é uma função Node TypeScript. Reutiliza `FormImageProvider`
com o endpoint OpenAI de edição quando há referências e de geração quando não
há. O provedor agora aceita várias referências; chamadas antigas com uma única
imagem continuam compatíveis. O modelo padrão existente foi preservado e pode
ser definido por `COMPANION_IMAGE_MODEL`.

Variáveis **somente no servidor**, a configurar pelo responsável no ambiente
Preview antes de qualquer decisão sobre produção/custos:

- `COMPANION_IMAGE_API_KEY`: credencial do provedor de imagens. Não é uma chave Groq.
- `COMPANION_IMAGE_MODEL`: opcional; padrão `gpt-image-2.5-sunburst`.
- `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`: as configurações públicas já usadas
  pelo projeto. Nenhuma `service_role` é necessária ou aceita no frontend.

O servidor valida a sessão em `/auth/v1/user`, confere `studio_admins`, exige
consentimento e valida o corpo (até 4,1 MB). Antes de chamar o provedor, insere um
rascunho com UUID do pedido. Uma colisão desse UUID retorna 409 sem gerar outra
imagem. Referências e saída ficam no bucket privado; somente após confirmar o
salvamento da imagem e da ficha a API retorna sucesso. Um erro deixa o pedido
identificado na biblioteca, para inspeção antes de nova cobrança.

Sem a credencial, geração retorna indisponível antes de reservar ou cobrar;
upload, prompt e biblioteca continuam funcionando. A duração máxima da função
é 180 s; o provedor tem timeout de 160 s. Falhas do provedor, de rede ou timeout
podem ocorrer depois de uma cobrança: não há retry automático. Uma execução
interrompida pela plataforma pode deixar rascunho `generating` e uploads parciais;
revise o pedido e o painel do provedor antes de gerar outra opção. Não há fila
durável ou limpeza automática de arquivos nesta primeira versão.

## Rodar e verificar

```sh
npm ci
npm run build
npm run dev
```

Abra `http://127.0.0.1:4173/asset-studio.html` no computador onde o comando foi
executado. No Core local, a biblioteca é do navegador e a geração exige login
local e o provedor de imagens configurado no Core. A biblioteca online usa o
build Vercel em modo cloud e a conta existente.

```sh
npm test
npx playwright install chromium
node tests/asset-studio-browser.mjs
node tests/asset-studio-cloud-browser.mjs
npm run vercel:build
```

O segundo teste de navegador intercepta todos os serviços cloud. Testes do
handler verificam autenticação, permissão ADM, consentimento, falhas de storage,
deduplicação e envio de múltiplas referências sem usar a API paga. O teste
local usa IndexedDB real e verifica reabertura, exportação/importação e mobile.
Nenhum teste de geração pago foi executado. Nenhum dado do Core é alterado
para criar, importar ou gerar assets no Studio.

Fontes de contrato: https://developers.openai.com/api/reference/resources/images/methods/edit
e https://supabase.com/docs/guides/storage/buckets/fundamentals

## Ampliação modular

Login na mesma origem, GLB/variantes, folhas de sprites e mundo por chunks: veja [MODULAR_WORLD_STUDIO.md](MODULAR_WORLD_STUDIO.md).
