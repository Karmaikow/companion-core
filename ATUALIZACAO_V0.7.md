# Companion Core Web v0.7 — Persistência local mais segura

Esta etapa inicia o marco M0 do plano. Ollama continua como provider padrão, no endereço local `http://localhost:11434`. Esta versão ainda não conecta Ollama Cloud nem hospeda Ollama remotamente. OpenAI permanece opcional e desligada por padrão.

## O que mudou

- O estado da Companion, a chave privada e o ponteiro da identidade ativa são gravados em arquivo temporário no mesmo diretório e substituídos por renomeação atômica.
- Arquivos JSON incompletos ou corrompidos não são confundidos com arquivos ausentes; a inicialização informa o erro e preserva os dados para recuperação.
- Os novos arquivos são criados com permissões privadas no Linux/macOS (diretório `0700`, arquivo `0600`). No Windows, as permissões efetivas continuam dependendo das ACLs do usuário e do dispositivo.
- O identificador da versão no terminal foi atualizado para v0.7.

A gravação atômica protege cada arquivo contra JSON parcial. Ela ainda não torna uma sequência de vários arquivos numa transação única e não substitui um backup.

## Atualizar Linux, Windows ou macOS

1. Pare o servidor anterior com `Ctrl+C`.
2. Faça uma cópia privada de toda a pasta `data/`, inclusive `data/secure/`. Não coloque essa cópia no GitHub.
3. Extraia este pacote sobre a pasta atual do projeto, mantendo a pasta `data/` atual.
4. Na raiz do projeto, execute:

```bash
npm install
npm run build
npm test
npm run web:start
```

Se a verificação estiver correta, os 26 testes passam e o terminal mostra `COMPANION CORE WEB v0.7`. A primeira inicialização deve carregar a identidade ativa existente. Se houver arquivo corrompido, o Core interrompe a inicialização e explica o problema; restaure o último backup válido em vez de apagar `data/` ou criar uma identidade substituta.

## Git e segurança

O `.gitignore` desta versão exclui `data/`, `node_modules/`, `dist/`, `.env` e logs. Revise os arquivos staged antes de enviar qualquer branch. Nunca versionar chaves de API, chaves privadas, dados da Companion, backups, sessão do navegador ou segredos em `.env`.

## Ainda não incluído

Bloqueio entre processos, recuperação transacional entre estado/chave/ponteiro, exportação `.mayuna`, transferência entre dispositivos e Ollama remoto próprio permanecem etapas futuras. Esta entrega não configura servidor GPU nem acessa serviços pagos.

## Validação local desta entrega

`npm test`: build TypeScript aprovado; 26/26 testes passaram, incluindo gravação concorrente sem JSON parcial, permissões de arquivo em POSIX e preservação quando o estado ativo está corrompido. Os testes usam dados temporários descartáveis.
