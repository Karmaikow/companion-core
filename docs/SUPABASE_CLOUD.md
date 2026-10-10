# Supabase: conta e cofre do Cristal

## O que esta etapa prepara

O projeto Supabase da Companion Core usa Supabase Auth para contas quando a interface online for conectada. A migração `20261010160000_companion_crystal_vault.sql` cria a tabela `public.companion_crystal_vault`, um cofre para arquivos `.companion` já selados pelo formato atual do Cristal de Memória.

Cada linha tem o ID da conta autenticada, o ID público da Companion, o envelope criptografado do Cristal e datas de criação/atualização. A chave privada e o estado aberto não devem ser enviados ao banco. O formato do arquivo é conferido pelo banco; a senha do Cristal continua necessária para abri-lo.

## Isolamento e chaves

- RLS está habilitado e forçado.
- SELECT, INSERT, UPDATE e DELETE exigem a conta autenticada e uma política compara `owner_id` com `auth.uid()`.
- Usuários anônimos não recebem acesso à tabela.
- A aplicação no navegador só deve usar a chave **publishable** do Supabase. Nunca inclua `sb_secret_...`, `service_role` ou a chave privada do Core no navegador, no GitHub ou em variáveis públicas da Vercel.
- A tabela recebe somente envelopes de Cristal criptografados. A aplicação precisa validar o Cristal antes de restaurá-lo.

## Limite atual da Vercel

A Vercel ainda compila a interface como prévia estática em modo `demo`. Criar a tabela não adiciona login à tela nem transforma o demo em um Core hospedado. O próximo passo de código é conectar Supabase Auth à tela de acesso e implementar o upload/download do arquivo `.companion`, mantendo o fluxo local e o Cristal existentes. A criação, chat e mutação do Core precisam continuar em um backend confiável ou no Core local; credenciais privilegiadas nunca vão para o browser.

Quando o cliente de Supabase entrar no build, configure na Vercel os nomes de variáveis definidos pelo código (URL e chave publishable), para Development, Preview e Production. Não adicionar chaves secretas ao projeto Vercel para este fluxo público.
