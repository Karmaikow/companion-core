# Composições VFX por JSON

Abra uma habilidade na Forja → Laboratório de VFX → Importar composição JSON.
Cole uma receita ou selecione um arquivo .json (até 64 KB). Clique **Conferir composição**, revise as camadas e clique **Aplicar à prévia**. Aplicar substitui somente as camadas do rascunho; use o botão de salvar da habilidade para persistir. Descartar antes da aplicação mantém a habilidade intacta. O botão Carregar exemplo preenche uma receita de cristais glaciais sem aplicar automaticamente.

A importação acontece localmente e não chama APIs. Receitas inválidas são rejeitadas com indicação da camada/campo, sem remover ou corrigir valores silenciosamente. Blocos Markdown ```json de respostas de chat também são aceitos. A receita deve ser um objeto com `layers` (1 a 6 camadas).

## Pedido para usar no chat junto da imagem

Crie uma composição de VFX para o Companion Core inspirada na imagem e nesta descrição: [descreva aqui]. Retorne apenas um objeto JSON com "layers", de 1 a 6 camadas. Cada camada precisa conter todos estes campos:

- kind: rune, mist, sparks, crystals ou lightning.
- enabled: true ou false.
- phase: prepare ou launch (início da preparação ou do lançamento).
- anchor: origin, target ou path (conjurador, alvo ou trajeto).
- delay: número de 0 a 2 segundos.
- duration: número de 0.15 a 3 segundos.
- size: número de 0.25 a 2.
- count: inteiro de 1 a 64; rune até 6; lightning até 8.
- color: "skill" para herdar a cor, ou hexadecimal #RRGGBB.

Não inclua código, shaders, modelos 3D ou regras de dano. Use somente os tipos de efeito acima. A Forja toca as camadas sobre o efeito principal existente.

## Exemplo

```json
{"layers":[{"kind":"rune","enabled":true,"phase":"prepare","anchor":"target","delay":0,"duration":1,"size":1,"count":1,"color":"#9deeff"},{"kind":"crystals","enabled":true,"phase":"launch","anchor":"path","delay":0,"duration":2.2,"size":1,"count":36,"color":"#a5e9ff"}]}
```
