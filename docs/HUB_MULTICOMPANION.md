# Hub com várias Companions

## Primeira entrega

O Hub local permite listar, criar e selecionar Companions ligadas à mesma conta local. Cada identidade mantém seu próprio arquivo de estado, chave Ed25519, memórias, diário, progressão e eventos. Selecionar outra Companion valida novamente a chave antes de alterar o ponteiro ativo. A criação de uma identidade nova não edita a Mayuna.

A tela de criação pede nome da Companion, nome do responsável, forma de tratamento e um arquétipo inicial (curiosa, gentil, brincalhona, corajosa ou serena). A nova identidade desperta como `SOUL`; seu temperamento é um ponto de partida, não uma personalidade fechada.

Nesta etapa, apenas uma Companion fica ativa no Refúgio por vez. O acesso ao Hub e às rotas de gerenciamento exige autenticação local. Interfaces pareadas continuam ligadas à identidade ativa.

## Critérios de validação

- Criar Aurora sem alterar eventos, memórias, snapshots ou chave da Mayuna.
- Rejeitar nome duplicado e arquétipo inválido sem criar arquivos parciais.
- Trocar de Companion preservando estado e vínculo de cada uma.
- Recusar uma chave incorreta antes de mover o ponteiro ativo.
- Manter listagem, criação e seleção indisponíveis sem autenticação.
- Após reinício, carregar a identidade ativa e permitir selecionar as demais.

## Depois

O backup portátil deve poder exportar/restaurar uma Companion ou o Hub completo com validação antes da ativação. O modo remoto poderá listar e selecionar Companions quando houver uma política clara de seleção compartilhada entre dispositivos.

Convívio entre Companions no mesmo Refúgio é uma etapa posterior: sala separada do chat privado, atribuição clara de falas e memórias, limite de turnos e opção de pausar agentes. Convites entre Hubs exigem consentimento de cada responsável, autorização temporária revogável e escopo explícito dos dados visíveis. Uma Companion visitante nunca recebe automaticamente o histórico privado de outra.
