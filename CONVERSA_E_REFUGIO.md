# Conversa compartilhada e Refúgio

Implementação para o Core web/local no Windows e Linux. O APK já instalado mantém suas configurações nativas; esta atualização não gera nem instala um novo APK.

## Atualizar o PC

Na branch `feature/evolucao-3d`, execute `git pull --ff-only origin feature/evolucao-3d`, `npm ci` e `npm run build`. Inicie com a mesma pasta de dados que já contém sua Companion. Para Mayuna neste Windows, foi utilizada `data-teste-importacao`. Não substitua essa pasta por um teste nem copie um Cristal por cima da sessão ativa.

Em Conversa · IA, escolha Groq · Companion Core e salve. Instalações novas sem configuração explícita usam esse serviço por padrão. Configurações existentes e variáveis do terminal são preservadas. A seleção e os perfis de cada serviço ficam no arquivo privado `.access/conversation.json` da pasta de dados. Chaves pessoais ficam em texto no disco, com permissões restritas onde suportadas, nunca são devolvidas na API de configurações e não entram no Cristal. A seleção é por instalação/acesso local; não há sincronização automática entre PCs.

Alternativas: Groq pessoal, OpenAI, Ollama e endpoints HTTPS compatíveis com Chat Completions. Na opção compatível, informe a base da API (por exemplo `https://provedor/v1`), modelo e chave. A compatibilidade depende do suporte a `messages`, `max_tokens` e respostas textuais em `choices`.

Ollama continua disponível, sem troca automática silenciosa de serviço. A inferência local funciona sem internet com modelo instalado, mas **um Cristal vinculado ao registro online ainda exige validação de sessão no registro para realizar interações**. Esta versão não remove essa proteção nem implementa uma autorização offline temporária.

## Serviço central

A função `companion-chat` usa a assinatura Ed25519 existente do Cristal: domínio específico, timestamp de até 60 segundos, nonce, contexto assinado e hash da sessão ativa. Não usa a senha local como autenticação remota. Uma identidade que ainda não tem registro é registrada no serviço central na primeira conversa compartilhada; identidades vinculadas a outro registro não são migradas silenciosamente.

`GROQ_API_KEY` deve ser cadastrado em Supabase → Edge Functions → Secrets, no projeto `rqdukyenuecrshzmofdo`. Não colocar no Git, APK, navegador ou enviar pelo chat. Sem o segredo, a função responde 503 e não chama a Groq.

Cotas iniciais: 4 solicitações/minuto e 30/dia UTC por identidade, 500/dia UTC para todo o projeto. O banco reserva a cota antes da chamada, com trava transacional; erros do provedor também consomem a reserva. Nonces repetidos são recusados. São contagens de solicitações, não medição financeira; o teto não significa gratuidade. O máximo de saída é 2.048 tokens por solicitação e o corpo aceito tem até 48 KB. Identidades adicionais continuam sujeitas ao teto global.

A tabela `companion_chat_usage` guarda somente nonce, identificador do registro e horário; histórico de mais de dois dias anteriores é removido ao reservar. Ela tem RLS e não concede leitura/escrita a anon/authenticated; a ausência de políticas públicas é intencional. A função SQL é SECURITY INVOKER e somente service_role pode executá-la. O serviço não registra prompts, respostas ou segredos em logs da aplicação.

Código do banco em `scripts/shared-chat-schema.sql`; função em `supabase/functions/companion-chat/index.ts`. Após `npm run build`, rode `node scripts/prepare-shared-chat.mjs` para coletar dependências compiladas antes do deploy. A função usa `verify_jwt=false` porque valida a assinatura própria do Cristal; não é um proxy anônimo. Nunca desabilitar essa validação.

## Interações visuais

Toque/clique na Companion para carinho; Enter/Espaço no botão também funciona. Quando o sprite estiver visível (forma ou prévia), toque no espaço livre do Refúgio para deslocamento com profundidade e sombra. A alma permanece centralizada; carinho continua disponível. São sprites 2D posicionados em um plano; uma única arte não cria visão lateral ou traseira. Não há navegação 3D, colisões, nem novos sprites direcionais nesta versão.

Reações: brilho ao preparar resposta, pequenos saltos e partículas em carinho/resposta/subida de nível, partículas de XP e descanso após 60 segundos sem interação. Sprites não recebem mais rotação e esticamento contínuos. A opção de movimento reduzido mantém a arte estática e comunica reações em texto.

Carinho dá +1 de vínculo, até cinco vezes por dia UTC, com intervalo de um minuto. Os limites são calculados no Core com eventos persistidos e assinados, preservados em reinícios e transferências. Não são uma proteção contra edição maliciosa de um Core que roda na própria máquina. Movimento, animação, espera e prévia da arte não dão XP do Core. A recompensa nunca é fornecida pelo cliente. Não há penalidade por deixar a Companion esperando.

## Validação

`npm test` cobre persistência dos provedores, autorização, assinatura, cotas, interação concorrente e reinício. `tests/form-art-ui.mjs` cobre desktop/mobile, importação, movimento reduzido, clique de carinho, repetição sem recompensa e deslocamento. Nenhum teste usa dados reais de Mayuna ou Lunaya. A resposta real da Groq compartilhada só pode ser testada depois do cadastro do segredo.
