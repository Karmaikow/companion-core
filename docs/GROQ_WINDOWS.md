# Groq no Core local do Windows

O Groq é opcional. O Core e as memórias permanecem no computador; durante cada resposta, o texto e o contexto selecionado são enviados ao Groq. A chave é pedida em entrada oculta pelo PowerShell e fica no ambiente apenas enquanto o servidor está aberto. O script não grava a chave em arquivos do projeto.

1. No console Groq, confirme que a conta está no **Free**. Não adicione método de pagamento nem faça upgrade.
2. Pare o servidor Ollama/Core atual com Ctrl+C.
3. No PowerShell, abra a pasta do Companion Core e execute:

   `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\start-groq-windows.ps1`

4. Digite `FREE`, cole a chave quando solicitada e inicie uma conversa com a Companion.
5. Para voltar ao Ollama, encerre com Ctrl+C e inicie normalmente com `npm run web:start` usando a configuração Ollama atual.

O provider usa o modelo Groq configurado no Core. Ao atingir a cota Free, a resposta informa o limite e não aciona outro serviço. O aplicativo não consegue validar o plano da conta; a confirmação digitada não substitui a conferência no painel Groq. Nunca coloque a chave em mensagens, no Git ou em arquivos do projeto.

A chave pode ser lida por processos executados sob a mesma conta Windows enquanto o servidor estiver ativo. Ao encerrar o script, as variáveis de ambiente e o buffer da entrada segura são limpos.
