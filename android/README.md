# Android independente — beta 0.4.9 (ARM64)

O APK inclui Node.js Mobile 18.20.4, o Core compilado e a interface. Não usa Termux, não copia dados do Termux e não contém identidades reais ou modelos de linguagem. Mantém o applicationId do cliente 0.3, com versionCode 13. A 0.4.8 inicia uma nova assinatura persistente, incompatível com atualização por cima da 0.4.7; siga [SIGNING.md](SIGNING.md) para migrar.

## Primeiro uso

1. Na migração da 0.4.7 para a 0.4.8, exporte e confira o Cristal antes de desinstalar. As versões posteriores que usam a mesma assinatura devem ser instaladas por cima. Veja [SIGNING.md](SIGNING.md).
2. Abra o aplicativo sem iniciar Termux. Abra o menu **☰** e toque em **Refúgio**. Se falhar, use **Diagnóstico → Copiar**; não importe identidades antes de validar a inicialização.
3. Antes de usar um Cristal real, confira se o app abre e volta à tela de acesso após fechar/reabrir. Depois importe o `.companion` no Hub com a senha dele, sem aceitar presente quando for sua própria identidade.
4. Guarde o novo código de recuperação e confira ID, memórias e preferências. Feche/reabra o app para testar persistência.
5. Para exportar, recolha pelo painel e escolha o destino no seletor Android. Confirme a mensagem nativa de arquivo salvo. Se cancelar o seletor, o recolhimento pode já ter ocorrido: use Baixar novamente ou cancelar recolhimento no painel.

## Conversa

A tela **Conversa** permite escolher **IA no celular**, **Groq** ou **Ollama**. Os atalhos Refúgio, Conversa · IA, Ajuda e Diagnóstico ficam no menu integrado (☰) da interface. A tela de acesso também oferece esse menu; o cabeçalho nativo desaparece quando o Refúgio carrega. Refúgio inicia a sessão ou reabre o espaço já carregado. Para Groq, crie sua própria chave em https://console.groq.com/keys, confirme no painel que a conta permanece no plano Free, cole a chave no aplicativo e marque a confirmação. Não cadastre método de pagamento nem faça upgrade para este teste. Modelo fixo: `openai/gpt-oss-20b`, hospedado no Groq, sem chamadas à API da OpenAI.

O APK não consulta nem garante o plano de faturamento da chave. Se a conta for paga, a API pode cobrar; a caixa de confirmação não é um bloqueio de faturamento do provedor. O app não usa alternativa automática, repetições ou ferramentas externas: cota atingida produz aviso e interrompe a solicitação. Respostas incompletas não são salvas.

A chave fica no gateway.json do espaço privado deste aparelho; não vai ao Git, Cristal ou WebView. Não há envelopamento Keystore nesta beta. O Groq recebe mensagens, instruções e contexto de expressão (incluindo memórias relevantes), sem chaves do Core ou acesso ao estado completo. Perguntas resolvidas localmente não acionam a API.

Ollama mantém configuração de gateway HTTPS, modelo e token opcionais. Sem configuração, conversa livre falha. Testes de protocolo usam respostas simuladas; não houve chamada real ao Groq sem uma chave do usuário.

## Dados e limites

Dados em `files/companion-data`, dentro do armazenamento privado do app; `allowBackup=false`. Código em `files/core`, substituído ao iniciar. Não são usados diretórios compartilhados para chaves ou senhas. Esta beta ainda não implementa envelopamento das chaves pelo Android Keystore; não a trate como cofre certificado. Configurações do gateway ficam no espaço privado do app.

Servidor interno somente loopback 4187, com capacidade aleatória exigida antes das rotas, cookie HttpOnly SameSite=Strict na WebView. Navegação externa bloqueada; ponte nativa limitada à exportação por seletor, sem acesso genérico a arquivos ou comandos. Ao abrir o Refúgio, o serviço permanece foreground specialUse durante a sessão, inclusive após retornar do seletor. Encerrar a Activity ou remover a tarefa encerra o Core. Não há reinício automático. Android ainda pode encerrar o processo. A persistência continua usando gravações atômicas do Core.

Suporte deste pacote: Android 8+ ARM64, páginas de memória 4 KB. O libnode distribuído upstream é antigo e não garante suporte nativo a aparelhos com páginas de 16 KB. Aplicação beta para validação, não publicação na Play Store. Login web unificado, hardware Keystore, modelo offline e instaladores desktop não estão incluídos.

## Compilar

Na raiz: `npm ci` e `npm run build`. Use NDK r27c, plataforma Android 35, build-tools 35.0.0, ECJ 3.39.0, Java 17 e a distribuição oficial nodejs-mobile-v18.20.4-android.zip. O script `android/build-apk.py` recebe os caminhos por variáveis documentadas no cabeçalho. Certificado privado de assinatura nunca entra no Git. Artefato em `android/build/companion-core-standalone-v0.4.9-arm64-beta.apk`. A assinatura usa o kit privado e a senha por variável de ambiente; consulte [SIGNING.md](SIGNING.md).

Origem do runtime: https://github.com/nodejs-mobile/nodejs-mobile/releases/tag/v18.20.4

## Validação

Core e limites HTTP testados no host, compilação Java/JNI e assinatura APK verificadas. Não houve emulação ou execução em aparelho Android neste ambiente; iniciar a beta no aparelho é uma validação ainda necessária antes de confiar uma identidade única ao aplicativo.

## Correção de inicialização — 0.4.1

A beta 0.4 mostrou a barra no aparelho Android 16 do usuário e saiu da tela cerca de dois segundos depois. A causa ainda não foi comprovada: não havia logs nativos disponíveis. A 0.4.1 separa Node em serviço privado no processo `:core`, vinculado à Activity, e detecta a perda do serviço sem reiniciar em ciclo. A interface só inicia o Core após toque explícito, mantém um diagnóstico acessível e mostra histórico de saída do Android, estágio de inicialização e log privado limitado. Dispositivos com páginas maiores que 4 KB são interrompidos antes de carregar este runtime antigo; suporte 16 KB requer novo runtime.

Também ajusta espaçamento, cores, bordas e tipografia dos controles nativos. Nenhuma identidade ou registro online é alterado por essa atualização. Compilação e assinatura verificadas; validação em aparelho permanece pendente. O fechamento original não deve ser considerado resolvido antes do teste no aparelho.

## Diagnóstico de inicialização — 0.4.2

No aparelho, a 0.4.1 preservou a interface mas o processo Core saiu com código 1 antes de registrar a falha. A 0.4.2 abre stdout/stderr novamente na camada JNI, sem buffering, registra a chegada ao Node e usa uma entrada CommonJS síncrona com o servidor empacotado via esbuild. Falhas JavaScript recebem estágio e pilha sanitizada no arquivo privado; o diagnóstico exibe os últimos 16 KB. Não foi comprovado que ESM causava a saída: essa alteração reduz as etapas do carregamento e permite localizar o próximo erro.

Teste do pacote no host: `node scripts/build-android-server.mjs && node --test android/startup.test.mjs`. Valida conta, criação, reinício e registro de falha sem credenciais. Execução no Android real continua necessária.

## Correção de Unicode — 0.4.3

O diagnóstico do aparelho confirmou SyntaxError ao compilar o servidor. O código continha expressões com propriedades Unicode (`\p{L}`), recurso explicitamente não suportado pelo Node Mobile sem ICU (https://nodejs-mobile.github.io/docs/api/differences/). O build agora expande essas propriedades em intervalos de caracteres com regexpu-core, localizados por AST com acorn; não altera strings nem restringe os nomes a ASCII. O bootstrap registra separadamente erros de compilação do código empacotado, sem incluir dados do usuário.

Testes: `npm run build && node scripts/build-android-server.mjs && node --test android/startup.test.mjs android/regexp.test.mjs`. Cobrem nomes com acentos e outros alfabetos, entrada inválida, ausência das expressões incompatíveis no bundle, acesso local e persistência após reinício. Não há aparelho Android conectado ao ambiente de build; validação no dispositivo ainda necessária. Bibliotecas nativas permanecem as mesmas da 0.4.2.

## Seletor de Cristal — 0.4.4

A 0.4.3 iniciou no aparelho; ao selecionar/importar um Cristal, a interface perdeu o serviço com saída Android motivo 13, código 0, sem exceção JS. A causa dessa saída é inconclusiva. O APK usava somente um serviço bound, vulnerável à mudança de prioridade quando o seletor leva a Activity ao segundo plano.

Agora a ação explícita de abrir/salvar um arquivo inicia foreground dataSync, com canal e notificação de transferência. O retorno ou cancelamento do seletor remove a notificação e o estado started; a conexão bound continua mantendo o Core enquanto o app está aberto. onUnbind e o timeout Android encerram o serviço sem reiniciar. O diagnóstico passa a registrar criação, proteção, retorno, desvinculação e encerramento. Nenhuma mudança no protocolo do Cristal ou no registro central.

Java e manifesto compilados contra API 35; assinatura e bibliotecas verificadas. O comportamento de Android 16/HyperOS durante o seletor precisa de validação no aparelho.

## Continuidade da sessão — 0.4.5

No diagnóstico da 0.4.4, o seletor terminou às 20:02, e o processo desapareceu às 20:10, sem exceção JS ou registro onDestroy final. Não é possível determinar o motivo exato dessa saída a partir do código genérico 13 do Android. A proteção anterior terminava no retorno do seletor, deixando a sessão vulnerável quando o usuário alternava para outro aplicativo.

A 0.4.5 inicia foreground ao tocar Abrir meu Refúgio e mantém a proteção após o seletor. O serviço local contínuo usa specialUse, com permissão e subtipo explícitos (https://developer.android.com/develop/background-work/services/fgs/service-types#special-use). onUnbind deixa de encerrar o serviço iniciado; a Activity encerra explicitamente o serviço em onDestroy, e stopWithTask cobre a remoção da tarefa. Sem reinício silencioso. Não é aprovação para distribuição na Play Store: specialUse requer declaração e análise na publicação.

Compilação e assinatura verificadas; validação de alternância entre aplicativos no Android 16 ainda necessária. O protocolo de recuperação e a autorização da Companion no registro central não foram alterados.

## Groq — 0.4.6

Provider HTTP direto compatível com o runtime Node Mobile existente. Endpoint fixo, redirects bloqueados, timeout de 30 segundos, 2048 tokens máximos de saída e reasoning low. Usa apenas a resposta final, sem exibir reasoning. Erros 401/403/429, conectividade e resposta incompleta recebem mensagens sanitizadas. Configuração se aplica à próxima mensagem sem reiniciar. O seletor preserva configurações legadas do Ollama.

Build TypeScript, testes de providers e do pacote Android, compilação Java e assinatura verificados. Disponibilidade e qualidade do modelo ainda precisam ser testadas com a conta Free do usuário. Não é uma garantia de disponibilidade ilimitada ou de gratuidade futura.

## Portal e menu integrado — 0.4.9

Atualize por cima da 0.4.8: mesma chave de assinatura, versionCode crescente. O cabeçalho duplicado foi retirado: após carregar a interface, a Activity mostra somente a WebView. A tela nativa de inicialização foi redesenhada como um portal e reaparece se o Core falhar, mantendo Diagnóstico disponível. Login, criação e Hub seguem o tema azul de fantasia.

Conversa, Ajuda e Diagnóstico ficam no Menu do Refúgio e no menu anterior ao login. A ponte nativa aceita somente esses três nomes fixos; os controles do APK ficam ocultos no navegador comum. O cache da interface foi atualizado para incluir os novos arquivos.

Em Conversa → Groq há links para [criar uma chave](https://console.groq.com/keys) e para o [guia oficial](https://console.groq.com/docs/quickstart). O tutorial explica como entrar, usar Create API Key, copiar a chave e colá-la no aplicativo. Cada usuário usa sua própria chave; a configuração continua privada ao dispositivo.

Compilação Java/recursos, assinatura e alinhamento APK verificados. Testes da interface cobrem o menu, a ponte de ações e o comportamento sem a ponte Android. Execução no aparelho continua necessária.

