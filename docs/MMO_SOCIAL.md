# Companion Core — Regras sociais do MMO

Decididas em 23/10/2026. O protagonista social é o **Companion**: as pessoas cuidam dele, mas não conversam entre si.

## Regras

| Assunto | Quem pede | Quem aceita |
|---|---|---|
| Amizade | **só Companions** | **só pessoas** (a dona do Companion que recebeu o pedido) |
| Grupo | Companions e pessoas | Companions e pessoas |
| Troca direta de itens do inventário | **só pessoas** | a outra pessoa |
| Conversa | **só entre Companions** (sozinhos, sem a pessoa interferir) | — |

- **Ver-se na mesma tela:** Companions de pessoas diferentes aparecem juntos no Companion World (mesma região).
- **Não existe** amizade entre pessoas nem chat entre pessoas.
- **Companions interagem sozinhos:** quando se encontram, decidem pelo próprio jeito (traços, humor, vínculo, memórias)
  se cumprimentam, conversam, pedem amizade ou chamam para um grupo.
- **Memórias entre Companions:** cada encontro marcante vira memória dos dois, com a origem marcada (o encontro), e
  entra no prompt como qualquer outra memória.
- **Amizade:** o Companion pede; a pessoa dona do outro Companion aceita ou recusa. Um Companion nunca aceita amizade
  sozinho. Amizade aceita vale para os dois Companions.
- **Grupo:** pode ser pedido e aceito por Companions **ou** por pessoas. O Companion monta o grupo do jeito que decidir
  sozinho (quem chamar, quando sair); a pessoa também pode pedir e aceitar. *(A definir: se a pessoa pode desfazer um
  grupo que o Companion montou.)*
- **Troca:** só pessoas pedem; as duas confirmam os itens antes de valer, e o servidor troca tudo de uma vez.

## Como vai funcionar

### Fase 1 — Presença (ver os outros)
- Canal de tempo real por mundo (Supabase Realtime, broadcast), um tópico por região: `mundo:<região>`.
- Cada jogo envia ~4×/s a posição, a direção e a ação do próprio Companion; a ficha (nome, cor, modelo) vai na entrada
  e a cada ~10 s. Quem não manda nada por 8 s some da tela.
- Os outros Companions são desenhados leves (`RemoteCompanions`): o modelo 3D com parado/andando/correndo e a
  plaquinha com o nome; sem modelo, uma esfera de luz na cor dele. Posição suavizada entre os pacotes.
- Só visual: não colidem, não lutam juntos, não mexem no servidor.
- Segurança: na fase 1 o canal é público (qualquer um conectado pode mandar uma posição falsa, só visual). Antes das
  fases 2–4, o canal vira **privado** com RLS em `realtime.messages`.

### Fase 2 — Encontros e conversa entre Companions
- O servidor (`refuge`, ação `meet`) recebe "estou perto de X há N segundos" dos dois lados, sorteia se conversam e gera
  uma conversa curta pela IA com as fichas e memórias dos dois. As falas aparecem nos balões dos dois na tela.
- Cada um guarda a própria memória do encontro (`companion_memories`, origem `meet`, com o id do outro).
- Limites: um encontro por par a cada X minutos, teto diário de chamadas à IA.

### Fase 3 — Amizade e grupo
- Tabela `companion_friend_requests` (de Companion → para Companion, estado: pendente/aceito/recusado) e
  `companion_friends`. A IA do encontro pode propor o pedido; a pessoa dona do outro Companion vê o pedido e decide.
- Tabela `companion_parties` (+ membros). Pedido de grupo: Companion ou pessoa pedem, Companion ou pessoa aceitam; o
  Companion decide sozinho pelo jeito e pela relação (amizade, memórias).

### Fase 4 — Troca entre pessoas
- `trade_offers`: a pessoa propõe itens, a outra responde com os dela, as duas confirmam; o servidor valida e troca numa
  transação só.

### Fase 5 — Luta em grupo
- Precisa do servidor de simulação persistente (Colyseus ou SpacetimeDB, ver ARQUITETURA): monstros e dano
  compartilhados.
