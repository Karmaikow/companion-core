# Companion Core Web v0.6 — Mayuna é a primeira Companion

Companion Core é a plataforma. Mayuna é a primeira Companion persistente usada nos testes. O nome da Companion permanece no perfil, na identidade, no chat e no mundo. As variáveis MAYUNA_* continuam compatíveis; renomeá-las agora quebraria instalações existentes.

## Atualizar no PC preservando a mesma Companion

1. Pare o servidor antigo com Ctrl+C. Faça um backup privado da pasta `data` completa, incluindo `secure`, antes da atualização. Não envie esse backup ao ChatGPT.
2. Extraia este pacote e copie seu conteúdo SOBRE a pasta atual do projeto. Preserve `data` e qualquer diretório personalizado em `MAYUNA_DATA_DIR`. Não exclua arquivos da Companion.
3. Na pasta atual do projeto, execute `npm install`, `npm run build` e `npm test`.
4. Configure o provider no terminal e inicie o servidor. Se você iniciar em uma pasta nova sem os seus dados, será criada uma identidade nova; isso não transfere a Mayuna original.

## OpenAI no PowerShell (Windows)

A chave é digitada em um prompt oculto e não é colocada no histórico como texto literal. Não a envie em chats, screenshots ou arquivos do projeto.

```powershell
$secret = Read-Host "Chave da API OpenAI" -AsSecureString
$env:OPENAI_API_KEY = [System.Net.NetworkCredential]::new("", $secret).Password
Remove-Variable secret
$env:MAYUNA_OPENAI_MODEL = "gpt-4.1-mini"
$env:MAYUNA_AI_PROVIDER = "openai"
npm run web:start
```

O modelo é configurável. `gpt-4.1-mini` é apenas uma opção inicial compatível com Responses; disponibilidade e cobrança dependem da sua conta de API.

Abra http://127.0.0.1:4173. A faixa do mundo exibirá CORE LOCAL · IA ONLINE. Perguntas simples de identidade podem ser respondidas diretamente pelo perfil, sem chamar a API.

## Modo híbrido

No mesmo terminal, pare o servidor e configure:

```powershell
$env:MAYUNA_AI_PROVIDER = "hybrid"
npm run web:start
```

A cada mensagem, tenta OpenAI. Em falha de rede/timeout, tenta Ollama em http://localhost:11434, com gemma3:4b. Erros HTTP de chave/cota/modelo e respostas incompletas não acionam fallback. Não há detecção antecipada de internet; a primeira tentativa indisponível pode levar até 20 segundos. Ollama pode levar até 120 segundos. A interface local aguarda até 155 segundos; pedidos são serializados por Companion.

Nenhum modo instala Ollama no celular ou torna o PC acessível pela internet. O pacote Android de teste anterior continua forçando mock. Esta entrega atualiza o projeto do PC; não substitua o iniciador Android sem uma atualização específica.

## Apenas Ollama

```powershell
$env:MAYUNA_AI_PROVIDER = "ollama"
npm run web:start
```

Sem MAYUNA_AI_PROVIDER, Ollama continua sendo o padrão. Um valor inválido interrompe a inicialização, em vez de selecionar outro provider silenciosamente. Mock continua exigindo dados isolados (`npm run web:mock`).

## Linux / Termux com o projeto completo

```bash
read -rsp 'Chave da API OpenAI: ' OPENAI_API_KEY
export OPENAI_API_KEY
export MAYUNA_OPENAI_MODEL=gpt-4.1-mini
export MAYUNA_AI_PROVIDER=openai
npm run web:start
```

Estas variáveis valem para o terminal atual. Não existe carregamento automático de `.env` nesta versão.

## Interface hospedada

O backend local deve receber também a origem já utilizada:

```powershell
$env:MAYUNA_REMOTE_ORIGIN = "https://mayuna-companion-interface.diegozxcvbnm.chatgpt.site"
```

A interface hospedada continua usando o pareamento existente. A API OpenAI é chamada pelo backend local, não pelo navegador. Esta entrega não publica alterações no Site hospedado.

## Autoridade, privacidade e continuidade

- AIProvider produz texto. InteractionEngine continua validando a expressão e só o Core aplica suas regras de eventos, XP e Bond.
- A OpenAI recebe o prompt, memórias recuperadas e conversa recente necessários à expressão. Usar IA online envia esse contexto ao serviço externo.
- A requisição usa `store: false`, sem Conversations API ou previous_response_id. Isso não é uma promessa de retenção zero; as políticas do serviço continuam aplicáveis.
- Nenhuma chave privada da Companion ou handle de mutação é enviado ao modelo. A chave da API fica no processo backend.
- Não houve modificação em core.ts, no formato do estado, nas memórias fundacionais ou nas regras de progressão.
- A persistência atual continua em arquivos locais. Exportação `.mayuna` criptografada e sincronização entre aparelhos permanecem futuras.

## Validação

Build e testes automatizados com identidades descartáveis, incluindo autenticação, HTTP, pareamento, integridade, reconhecimento, provider OpenAI simulado e fallback. Não foi realizada chamada paga real à OpenAI, nem teste com o Ollama do seu PC. Confira visualmente a interface no seu navegador.

Fontes oficiais consultadas em 07/10/2026:
- https://developers.openai.com/api/docs/guides/migrate-to-responses
- https://developers.openai.com/api/docs/models/gpt-4.1-mini
- https://learn.chatgpt.com/docs/projects
