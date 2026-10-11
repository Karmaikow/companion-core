# Android independente — beta 0.4.2 (ARM64)

O APK inclui Node.js Mobile 18.20.4, o Core compilado e a interface. Não usa Termux, não copia dados do Termux e não contém identidades reais ou modelos de linguagem. Usa o mesmo applicationId/certificado de teste do cliente 0.3, com versionCode 6.

## Primeiro uso

1. Instale por cima do APK anterior. Se houver conflito de assinatura, não desinstale nem limpe dados: informe o erro.
2. Abra o aplicativo sem iniciar Termux. Toque em **Abrir meu Refúgio**. Se falhar, use **Diagnóstico → Copiar**; não importe identidades antes de validar a inicialização.
3. Antes de usar um Cristal real, confira se o app abre e volta à tela de acesso após fechar/reabrir. Depois importe o `.companion` no Hub com a senha dele, sem aceitar presente quando for sua própria identidade.
4. Guarde o novo código de recuperação e confira ID, memórias e preferências. Feche/reabra o app para testar persistência.
5. Para exportar, recolha pelo painel e escolha o destino no seletor Android. Confirme a mensagem nativa de arquivo salvo. Se cancelar o seletor, o recolhimento pode já ter ocorrido: use Baixar novamente ou cancelar recolhimento no painel.

## Conversa

O botão **IA** configura gateway Ollama **HTTPS**, modelo e token opcional. Esse servidor ainda precisa existir e estar acessível. Nenhuma API paga ou resposta mock é ativada automaticamente. Sem gateway, o Core pode responder perguntas de identidade resolvidas pelo próprio código, mas conversa livre falha. A inscrição online e as transferências precisam de internet. Não há servidor Ollama hospedado por esta entrega.

## Dados e limites

Dados em `files/companion-data`, dentro do armazenamento privado do app; `allowBackup=false`. Código em `files/core`, substituído ao iniciar. Não são usados diretórios compartilhados para chaves ou senhas. Esta beta ainda não implementa envelopamento das chaves pelo Android Keystore; não a trate como cofre certificado. Configurações do gateway ficam no espaço privado do app.

Servidor interno somente loopback 4187, com capacidade aleatória exigida antes das rotas, cookie HttpOnly SameSite=Strict na WebView. Navegação externa bloqueada; ponte nativa limitada à exportação por seletor, sem acesso genérico a arquivos ou comandos. Não existe serviço de execução em segundo plano; Android pode encerrar o processo. A persistência continua usando gravações atômicas do Core.

Suporte deste pacote: Android 8+ ARM64, páginas de memória 4 KB. O libnode distribuído upstream é antigo e não garante suporte nativo a aparelhos com páginas de 16 KB. Aplicação beta para validação, não publicação na Play Store. Login web unificado, hardware Keystore, modelo offline e instaladores desktop não estão incluídos.

## Compilar

Na raiz: `npm ci` e `npm run build`. Use NDK r27c, plataforma Android 35, build-tools 35.0.0, ECJ 3.39.0, Java 17 e a distribuição oficial nodejs-mobile-v18.20.4-android.zip. O script `android/build-apk.py` recebe os caminhos por variáveis documentadas no cabeçalho. Certificado privado de assinatura nunca entra no Git. Artefato em `android/build/companion-core-standalone-v0.4.2-arm64-beta.apk`.

Origem do runtime: https://github.com/nodejs-mobile/nodejs-mobile/releases/tag/v18.20.4

## Validação

Core e limites HTTP testados no host, compilação Java/JNI e assinatura APK verificadas. Não houve emulação ou execução em aparelho Android neste ambiente; iniciar a beta no aparelho é uma validação ainda necessária antes de confiar uma identidade única ao aplicativo.

## Correção de inicialização — 0.4.1

A beta 0.4 mostrou a barra no aparelho Android 16 do usuário e saiu da tela cerca de dois segundos depois. A causa ainda não foi comprovada: não havia logs nativos disponíveis. A 0.4.1 separa Node em serviço privado no processo `:core`, vinculado à Activity, e detecta a perda do serviço sem reiniciar em ciclo. A interface só inicia o Core após toque explícito, mantém um diagnóstico acessível e mostra histórico de saída do Android, estágio de inicialização e log privado limitado. Dispositivos com páginas maiores que 4 KB são interrompidos antes de carregar este runtime antigo; suporte 16 KB requer novo runtime.

Também ajusta espaçamento, cores, bordas e tipografia dos controles nativos. Nenhuma identidade ou registro online é alterado por essa atualização. Compilação e assinatura verificadas; validação em aparelho permanece pendente. O fechamento original não deve ser considerado resolvido antes do teste no aparelho.

## Diagnóstico de inicialização — 0.4.2

No aparelho, a 0.4.1 preservou a interface mas o processo Core saiu com código 1 antes de registrar a falha. A 0.4.2 abre stdout/stderr novamente na camada JNI, sem buffering, registra a chegada ao Node e usa uma entrada CommonJS síncrona com o servidor empacotado via esbuild. Falhas JavaScript recebem estágio e pilha sanitizada no arquivo privado; o diagnóstico exibe os últimos 16 KB. Não foi comprovado que ESM causava a saída: essa alteração reduz as etapas do carregamento e permite localizar o próximo erro.

Teste do pacote no host: `node scripts/build-android-server.mjs && node --test android/startup.test.mjs`. Valida conta, criação, reinício e registro de falha sem credenciais. Execução no Android real continua necessária.
