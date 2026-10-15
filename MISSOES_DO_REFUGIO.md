# Missões do Refúgio

No painel Companion, acima dos requisitos de evolução, há cinco objetivos iniciais:

| Objetivo | Recompensa |
|---|---:|
| Cor favorita da Companion | 100 XP |
| Animal ou ser favorito da Companion | 100 XP |
| Cinco memórias relevantes distintas | 150 XP |
| Vínculo 15 | 150 XP |
| Dez memórias relevantes distintas | 250 XP |

O total inicial é 750 XP do Core. Objetivos já alcançados são reconhecidos: não é necessário apagar preferências ou repetir histórias antigas. Clique em Receber XP quando a missão estiver pronta. Cada recompensa inicial só pode ser recebida uma vez por identidade.

Continuar com a Companion abre a conversa com uma sugestão preenchida; a pessoa pode editá-la antes de enviar. A narrativa deve oferecer escolhas e esperar a decisão, mantendo a Companion participando. São objetivos de conversa e desenvolvimento, não mapas exploráveis ou combate implementado. Uma fala da IA nunca cria itens nem concede a recompensa.

Após receber as cinco recompensas, capítulos recorrentes pedem cinco memórias relevantes novas e cinco mensagens diferentes desde a última recompensa. A recompensa é 35% do XP necessário para o nível atual, com mínimo de 180 e máximo de 500. O valor mostrado acompanha o nível até ser recebido. Não há cobrança ou chamada de IA ao listar ou receber missões.

O Core calcula progresso e XP; o cliente só informa identidade e missão. A operação é serializada, valida a sessão ativa do Cristal e grava um evento QUEST_REWARD assinado. Esse evento impede recebimento duplicado após recarregar, reiniciar ou transferir o Cristal. A política não pretende impedir alterações maliciosas de um Core controlado pelo próprio usuário.

Os critérios de memória são os mesmos da evolução: relevantes, distintas, não arquivadas e com peso emocional suficiente. O número total de memórias exibido em outro painel pode ser maior. Abrir a missão, repetir frases ou esperar não completa esses critérios. O XP normal de conversa continua em 5; as missões dão recompensas adicionais sem remover os requisitos de cor, ser, memória e vínculo para despertar a forma.

A alma mantém carinho e animação visual centralizada, sem deslocamento por clique. A movimentação só funciona quando um sprite estiver carregado e visível, inclusive na prévia. Ao voltar à alma, a posição é centralizada novamente.

Validação: testes de progresso existente, critérios de capítulos, concorrência, duplicação, reinício e integridade; teste de navegador para receber recompensa, preencher sugestão e impedir deslocamento da alma, preservando o deslocamento do sprite.
