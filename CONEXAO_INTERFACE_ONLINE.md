# Interface online conectada ao Core local

A interface hospedada pode conversar com o Core que já roda no computador do usuário. A identidade, as memórias, os eventos, os snapshots, a chave Ed25519 e o Ollama continuam locais. O site entrega a UI; ele não recebe a chave nem armazena o estado da Companion.

## Preparação

1. Hospede a pasta `web/` em HTTPS e configure o build dessa cópia com `web/modules/runtime-mode.js` exportando `mode = 'connect'`.
2. No computador que contém o Core, inicie o servidor definindo `MAYUNA_REMOTE_ORIGIN` como a origem HTTPS exata (somente domínio e porta, sem caminho):

   ```sh
   MAYUNA_REMOTE_ORIGIN=https://seu-site.example npm run web:start
   ```

   Em desenvolvimento HTTP, somente origens `localhost` podem ser usadas. Sem essa variável, as rotas de pareamento ficam desabilitadas. Mantenha o servidor vinculado a `127.0.0.1`.
3. Entre na interface local, abra **Configurações → Conexão online** e gere o código temporário.
4. Abra o site hospedado no navegador do mesmo computador, digite o código e permita acesso à rede local quando o navegador solicitar.

O código vale por dois minutos e só pode ser usado uma vez. A sessão é limitada à origem configurada, expira em duas horas e permanece apenas na memória da aba. Atualizar/fechar a aba encerra a sessão do lado da interface; gere outro código para reconectar. O Core aceita até quatro abas pareadas ao mesmo tempo.

## Limites atuais

Essa conexão direta cobre a interface hospedada aberta no mesmo computador do Core. Não cria um túnel público, não conecta um celular distante ao PC e não sincroniza dados entre dispositivos. Para o celular acessar um Core portátil em outro dispositivo será necessário um transporte pareado adicional (por exemplo, relay criptografado ou conexão LAN autenticada), sem mover a autoridade do Core para o serviço de transporte.

O acesso local à rede depende do navegador e da permissão concedida ao site HTTPS. Navegadores sem esse suporte podem bloquear a conexão; a UI local continua disponível. O endpoint Ollama não é exposto pelo servidor web: somente as operações autorizadas de estado, verificação e interação são encaminhadas pelo Core.
