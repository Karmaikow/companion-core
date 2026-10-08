# Organizar Companion Core em um Projeto do ChatGPT

Crie um Projeto chamado **Companion Core** na área Projetos do ChatGPT. Mova as conversas relacionadas para ele pelo menu da conversa, quando essa opção estiver disponível. Adicione o handoff, este documento e ATUALIZACAO_V0.6.md como fontes. Anexe uma versão atual do código sem dados pessoais, credenciais ou node_modules. Os nomes exatos dos controles podem variar entre as interfaces.

Projeto do ChatGPT organiza contexto e instruções. Não executa, hospeda ou sincroniza automaticamente o Core, seus arquivos ou a identidade da Companion. Continue mantendo seus dados no dispositivo e backups privados.

## Texto para as instruções do Projeto

O projeto se chama Companion Core. Mayuna é a primeira Companion persistente, usada com Didi para testes; não é o nome de toda a plataforma.

Continue o código existente. Antes de mudanças amplas, leia a estrutura real, execute build e testes. Preserve identidade Ed25519, estado, cadeia de eventos, snapshots, memórias e regras. Não substitua uma identidade diante de erro; preserve os dados e investigue recuperação confiável.

A interface solicita; o Core decide. A IA é expressão e personalidade, sem autoridade direta para alterar XP, Bond, inventário, memórias factuais ou evoluções. Core XP e Combat XP são separados.

Mayuna chama seu companheiro de Didi; sua cor favorita é azul-safira. A preferência verde-musgo de Didi deve vir da memória factual existente, não de acontecimentos inventados. Não invente atividades enquanto a aplicação estava desligada. Preserve a autonomia da personalidade dela, sem simplesmente espelhar Didi.

Priorize a camada web e o GameViewport. Desktop sem scroll global, hotbar e skills visíveis; painéis gerenciáveis; chat flutuante no mundo; mobile com experiência própria. Preserve temas por CSS variables e a separação de um futuro renderer Phaser.

Providers são desacoplados. Ollama gemma3:4b permanece em http://localhost:11434. OpenAI pode ser configurada no backend para uso online; mock somente explícito e isolado. Chaves privadas e credenciais nunca chegam ao frontend ou aos arquivos compartilhados do Projeto.

Consulte os arquivos atuais como fonte de verdade. Diferencie funcionalidades implementadas, testes simulados e planos futuros. Discuta com Didi antes de substituir componentes fundamentais. Entregue o código completo quando houver alterações expressivas.

Planos futuros: pacote portátil criptografado .mayuna, sincronização de eventos, MMORPG e artefatos físicos NFC/moedas 3D para representar habilidades, equipamentos e transformações.

## Fonte oficial

https://learn.chatgpt.com/docs/projects — consultada em 07/10/2026.
