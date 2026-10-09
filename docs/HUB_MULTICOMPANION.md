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

## Ritual de criação · regra de propriedade

O produto terá **uma Companion própria por usuário**. Encontros e convites de outras Companions para o Refúgio serão uma etapa futura; a lista atual ainda é um seletor local de identidades para testes, sem sistema de visitantes ou contas de terceiros.

A criação adicional permanece liberada temporariamente. Para aplicar o limite no servidor, configure `MAYUNA_ALLOW_EXTRA_COMPANIONS=0` antes de iniciar. Identidades existentes continuam acessíveis. O nome informado no ritual não cria outra conta nem contorna o limite.

O ritual registra nome, companheiro, tratamento, cor hexadecimal da alma e traços escolhidos. A cor fica no perfil e no evento assinado da gênese; não há rota de edição dessa cor. Ela inicia o tema da interface, que tem preferência independente por identidade. Alterar o tema não altera a alma. Perfis antigos usam o visual azul existente e não são regravados por migração.

Os cinco grupos iniciais inspirados no Big Five calculam tendências; temperamento e eixos inspirados no MBTI são referências narrativas, não avaliação psicológica. Os traços participam da descrição usada na conversa. Cor e influências visuais ficam persistidas como sementes para a futura manifestação; ainda não há geração de modelo 3D nem transformação automática. A cor escolhida registra a preferência do usuário, sem inventar uma cor favorita para a Companion.

### Teste manual

1. Abra Hub → Despertar Companion · teste. Preencha os três nomes, escolha cor e badges.
2. Desperte, converse e reinicie. Confira nome, tratamento, cor da alma e continuidade.
3. Altere a cor da UI em Configurações: a alma deve manter a cor de nascimento.
4. Volte à Mayuna e depois à nova Companion: histórias e temas devem ficar separados.
5. Com `MAYUNA_ALLOW_EXTRA_COMPANIONS=0`, confirme que criar outra identidade é bloqueado, inclusive pela API.
