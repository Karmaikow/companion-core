# Recuperação da senha da conta web

No modo cloud da tela de acesso, “Esqueci minha senha” chama Supabase Auth em /auth/v1/recover e pede que o e-mail volte à origem Vercel onde o pedido começou. A aplicação valida a sessão retornada antes de habilitar a nova senha e atualiza a credencial autenticada com PUT /auth/v1/user.

O feedback de envio não revela se existe uma conta para o e-mail informado. O Supabase controla validade, uso único e envio da mensagem. O domínio de retorno precisa estar cadastrado em Authentication → URL Configuration → Redirect URLs, e o provedor de e-mail de Auth precisa estar operacional.

Isso recupera apenas a conta web Supabase. Não altera o acesso local do dispositivo nem a senha usada para criptografar o Cristal de Memória.
