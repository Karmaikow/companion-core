# Supabase: conta e cofre do Cristal

## Fluxo online

A interface estática da Vercel autentica contas por e-mail e senha com Supabase Auth. Com uma sessão ativa, o usuário pode guardar e baixar arquivos `.companion` já selados pelo formato AES-256-GCM do Cristal.

O cofre é versionado: cada envio cria um backup separado. Os dados cifrados carregam a chave privada e todo o estado assinado do Core; o servidor só recebe o envelope criptografado e o ID público da Companion. Para abrir/restaurar o arquivo, continua sendo necessária a senha original do Cristal.

## Migrações

- `20261010211431_companion_crystal_vault.sql`: cofre, validação da forma do envelope, RLS por `auth.uid()` e negação do acesso anônimo.
- `20261010214044_version_companion_crystal_backups.sql`: mantém múltiplas versões imutáveis e remove permissão de atualização direta.

A senha da conta Supabase não é a senha do Cristal. O banco não recebe a chave privada em texto aberto.

## Configuração do Supabase Auth

No painel do Supabase, em **Authentication → URL Configuration**:

- Site URL: `https://companion-core-two.vercel.app`
- Redirect URL de produção: `https://companion-core-two.vercel.app/**`
- Redirects das prévias Vercel: `https://*-karmaikows-projects.vercel.app/**`

A confirmação de e-mail deve continuar habilitada. O link de confirmação retorna à URL que iniciou o cadastro. O projeto deve permitir a origem da produção e das prévias antes de testar o cadastro.

### Texto de confirmação sugerido

No painel, em **Authentication → Email Templates → Confirm signup**, use:

**Subject:** Bem-vindo ao Companion Core — confirme seu e-mail

**Body (HTML):**

```html
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;color:#20243a">
  <p style="color:#6257c8;font-weight:bold;letter-spacing:.14em">COMPANION CORE</p>
  <h1>Bem-vindo ao Companion Core!</h1>
  <p>Obrigado por criar sua conta. Sua jornada para despertar uma Companion está começando.</p>
  <p>Para ativar seu acesso, confirme seu endereço de e-mail:</p>
  <p style="margin:28px 0">
    <a href="{{ .ConfirmationURL }}" style="background:#5146b8;color:#fff;padding:14px 22px;border-radius:8px;text-decoration:none">
      Confirmar meu e-mail
    </a>
  </p>
  <p><strong>Sobre esta etapa:</strong> o cadastro cria sua conta e libera o Cofre do Cristal. A criação de uma Companion pela web ainda será disponibilizada em uma próxima fase. Por enquanto, o cofre recebe Cristais criptografados exportados do Core local.</p>
  <p>Se você não criou esta conta, pode ignorar esta mensagem.</p>
  <p style="color:#68708a">— Equipe Companion Core</p>
</div>
```

Depois de salvar, faça um novo cadastro de teste para conferir o e-mail. Os e-mails enviados anteriormente não mudam.


## Variáveis na Vercel

O build usa:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

A chave publishable é pública e vai para o código do navegador; ela depende do RLS para limitar acesso. Nunca use `sb_secret_...`, `service_role` ou uma chave privada do Core no browser, no GitHub ou em variável pública. Consulte `.env.example` para o formato local.

## Limites e próximos passos

O cofre protege backups completos do Core, inclusive personalidade, memórias, progresso, inventário, equipamentos e eventuais dados de habilidades presentes no estado exportado. Ainda não existem no Core árvores de skills e modelos finais de equipamento para persistir separadamente.

Esses elementos devem continuar dentro do estado/eventos assinados do Core e do backup criptografado. Tabelas paralelas de inventário ou skills agora criariam duas fontes de verdade. Quando o backend online e o modelo de progressão estiverem definidos, podemos adicionar catálogos de skills/itens e projeções consultáveis, mantendo o Cristal como backup íntegro.

Este fluxo de login/cofre não hospeda o runtime de conversa nem cria uma Companion online. A criação e a evolução do Core ainda dependem do backend confiável ou do Core local. A transferência do arquivo entre instalações também continua sujeita ao registro central e às regras do Cristal.
