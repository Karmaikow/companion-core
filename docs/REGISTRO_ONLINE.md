# Registro compartilhado do Cristal

O registro de sessões roda em uma Supabase Edge Function com persistência no Postgres. O Core continua local e o login web continua responsável pelo cofre. O registro recebe solicitações assinadas com Ed25519 e guarda chaves públicas, hashes das credenciais, dispositivo e autorização da sessão. Não recebe senha do Cristal, chave privada, memórias ou arquivo `.companion`.

## Endereço publicado

```
https://rqdukyenuecrshzmofdo.supabase.co/functions/v1/companion-registry
```

`GET /health` verifica também o armazenamento. O Core usa `POST /registry`. O endpoint não exige o JWT do Supabase porque autentica cada solicitação com a assinatura da Companion, validade de um minuto e nonce. A tabela e a função SQL não têm acesso concedido a `anon` ou `authenticated`; somente o backend possui a credencial administrativa.

Cada atualização exige a revisão atual da sessão no banco. Se duas instâncias tentarem despertar a mesma identidade, apenas uma grava; a outra relê o estado e recebe o conflito. Solicitações mutantes já consumidas são recusadas após reinício. Em perda de resposta, o Core retoma a mesma transação com uma nova solicitação assinada.

## Antes de exportar uma Companion existente

No PowerShell, na pasta do projeto:

```powershell
$env:COMPANION_REGISTRY_URL="https://rqdukyenuecrshzmofdo.supabase.co/functions/v1/companion-registry"
npm run crystal:check
```

O diagnóstico lê apenas metadados locais. Não imprime chaves, senhas, códigos de recuperação nem tokens. Não cria, exporta ou modifica nenhuma Companion.

- `sessions` vazio: não existe sessão de Cristal registrada nessa pasta. A identidade existente será inscrita no registro configurado quando uma operação autorizada exigir registro.
- `needsRegistryMigration: true`: preserve o registro original; configure a migração administrativa abaixo antes de exportar ou retomar uma importação.
- `phase: importing`: preserve a pasta `data` e o mesmo Cristal para retomar a transação. Não crie outro registro para substituir o original.

**Nunca apagar `data/.crystal` ou recriar uma chave para forçar a troca de servidor.** Alterar a variável de ambiente não migra a autorização antiga. A ausência de exportações anteriores não garante ausência de registro: conversar com um registro configurado também inscreve uma sessão.

## Backup local no Windows

Pare o Core e o registro local com Ctrl+C antes de copiar. Para a configuração padrão de pastas:

```powershell
$backupDir = Join-Path $PWD ("backups\antes-cristal-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Path $backupDir -ErrorAction Stop | Out-Null
Copy-Item -LiteralPath ".\data" -Destination (Join-Path $backupDir "data") -Recurse -Force -ErrorAction Stop
if (Test-Path -LiteralPath ".\.companion-registry") {
  Copy-Item -LiteralPath ".\.companion-registry" -Destination (Join-Path $backupDir "registry") -Recurse -Force -ErrorAction Stop
}
Get-ChildItem -LiteralPath $backupDir -Force
```

Se usar `MAYUNA_DATA_DIR` ou `COMPANION_REGISTRY_DATA` personalizados, copie essas origens reais. O backup inclui credenciais locais: guarde-o privadamente e não o envie ao GitHub. A pasta `backups/` é ignorada pelo Git. Um backup antigo não deve ser reativado em paralelo com uma importação concluída.

## Teste de exportação e acesso local novo

Depois do backup e da verificação do registro, inicie o Core original com o endereço online configurado e seu Ollama habitual. Em **Meu vínculo**, recolha a Companion e guarde arquivo, senha e código de recuperação.

Para simular outra instalação no mesmo Windows, abra outro PowerShell no projeto e use uma pasta nova que ainda não exista:

```powershell
$env:PORT="4175"
$env:MAYUNA_DATA_DIR="data-teste-importacao"
$env:COMPANION_REGISTRY_URL="https://rqdukyenuecrshzmofdo.supabase.co/functions/v1/companion-registry"
$env:MAYUNA_AI_PROVIDER="ollama"
$env:MAYUNA_OLLAMA_BASE_URL="http://localhost:11434"
$env:MAYUNA_OLLAMA_MODEL="gemma3:4b"
npm run web:start
```

Abra `http://127.0.0.1:4175`, crie o acesso local e importe o mesmo Cristal com a senha dele. Deixe o aceite de presente desmarcado. Confirme ID, memórias, cor da alma e integridade; reinicie e confira novamente. A origem recolhida não pode continuar conversando. Não copie o backup de `data` para essa pasta de teste: isso copiaria também o acesso antigo, em vez de testar a importação.

A conta local nova é apenas o acesso à instalação. Uma transferência comum mantém o companheiro humano da identidade. Conta web, acesso local e senha do Cristal ainda são distintos; a vinculação de dispositivos à conta Supabase é a próxima etapa. O novo registro não faz essa vinculação implicitamente.

## Migrar um registro antigo — operação administrativa

O arquivo `.companion` não contém o registro que autorizou a transferência. Para Lunaya exportada no Linux, precisamos do arquivo `.companion-registry/registry.json` original (ou seu backup), além do Cristal já guardado. Não é necessário exportar novamente se a transferência original ainda estiver válida no registro migrado.

1. Pare os registros locais de origem e faça backups. Eles devem permanecer desligados após a migração, para não manter duas autoridades independentes.
2. Prepare um arquivo privado `migracao.json` apontando para os registros reais:

```json
{
  "targetAuthority": "https://rqdukyenuecrshzmofdo.supabase.co/functions/v1/companion-registry",
  "sources": [
    {"authority": "http://127.0.0.1:4174", "file": "backup-linux/registry.json"}
  ]
}
```

3. Rode `npm run registry:import -- migracao.json` para validar sem acesso à rede ou gravações.
4. No ambiente administrativo, configure `COMPANION_REGISTRY_DATABASE_URL` com a URL HTTPS do projeto Supabase e `COMPANION_REGISTRY_ADMIN_KEY` com a chave secreta de backend; nunca na Vercel pública, no APK, no Git ou no Core distribuído. Rode `npm run registry:import -- migracao.json --write --registries-stopped`.
5. O comando recusa sessões divergentes e nunca sobrescreve registros. Cada identidade é inserida atomicamente. Em uma interrupção de várias identidades, repita a validação: entradas idênticas já copiadas são reconhecidas e as restantes podem ser inseridas.
6. Remova a credencial administrativa do ambiente. Configure `COMPANION_REGISTRY_URL` nos Cores. Use **Conectar ao registro migrado** para sessões existentes ou retome o mesmo Cristal para importações pendentes.

## Desenvolvimento e publicação

`npm test` cobre as regras do registro local e online, concorrência entre instâncias, replay e perda de resposta. `npm run registry:prepare` compila e copia os módulos testados para a Edge Function; o código gerado em `shared/` é ignorado no Git. Não há implementação paralela das regras de transferência.

A migração `companion_online_registry` cria a tabela com RLS, permissões exclusivas de backend e uma RPC `SECURITY INVOKER` de comparação de revisão. A Edge Function lê a chave secreta automaticamente do ambiente Supabase, com compatibilidade para a antiga chave `service_role`.

Para um teste explícito no endpoint publicado: defina `COMPANION_REGISTRY_URL` e rode `npm run registry:check -- --live`. O teste usa diretórios temporários, cria uma identidade descartável, tenta dois destinos concorrentes, verifica memórias/integridade e reinício. Ao final, imprime somente a chave pública de identificação do registro para limpeza administrativa. Não execute uma limpeza genérica da tabela.

## Limites desta entrega

O registro online exige conectividade para operações de identidades inscritas, inclusive conversa, como o protocolo anterior. Ainda não há autorização offline com prazo, vínculo automático ao login web, distribuição de instaladores ou limite por conta para criar identidades no registro. A assinatura comprova posse da chave da Companion; não substitui uma futura política de contas, emissão e combate a abuso. O serviço é destinado aos testes privados atuais, não a um lançamento público.

O cofre de backups e suas políticas de acesso existentes não foram alterados.
