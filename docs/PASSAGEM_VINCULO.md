# Passagem do Vínculo e registro compartilhado

## O que esta versão entrega

- Migração administrativa de vários registros para um único registro, conservando sessões, recolhimentos, códigos de recuperação e hashes de Cristais existentes.
- Importação de Cristais de uma autoridade antiga somente quando o registro de destino recebeu explicitamente aquela identidade na migração.
- Convite público `.vinculo` assinado pelo acesso local do destinatário, com validade de 7 dias.
- Presente criptografado `.companion`, preparado para aquele destinatário, e aceite com prova da chave do destinatário.
- Evento assinado `BOND_PASSAGE`, novo interlocutor, início de um vínculo com valor zero, preservação da alma, personalidade, progressão e história anterior.
- Cancelamento antes do aceite, recuperação de transações interrompidas e revogação da sessão e código de recuperação anteriores depois do aceite.

O registro compartilhado é um serviço Node separado do Ollama. Não hospeda o modelo, as memórias nem as chaves privadas. A conta de entrada continua local: a chave em `data/.access/bond-key.json` identifica criptograficamente esse acesso no convite. Esta versão não oferece cadastro global por e-mail, login social ou recuperação de conta na nuvem. Para receber, use o acesso que gerou o convite e preserve a pasta `data`. Os nomes são declarados pelo usuário, não identidades civis verificadas.

## Primeiro: trazer Lunaya sem alterar seu responsável

Para transferir Lunaya do Linux ao Windows, use o Cristal normal. Não use a Passagem do Vínculo para corrigir um registro ausente: ela muda o companheiro humano.

É necessário obter o arquivo do registro original do Linux, normalmente `.companion-registry/registry.json`, além do registro do Windows. Se `COMPANION_REGISTRY_DATA` foi configurado, confira o caminho mostrado ao iniciar `npm run crystal:server`. O `.companion` sozinho não recria uma autorização de transferência em um registro vazio. O código de recuperação também depende do registro original.

1. Pare os Cores e TODOS os servidores de registro envolvidos, inclusive o destino, antes de copiar os arquivos. Guarde backups privados dos registros e das pastas `data`.
2. Coloque cópias dos registros numa pasta privada, com nomes diferentes: `registro-linux.json` e `registro-windows.json`. Não os envie ao Git.
3. Crie um arquivo `migracao.json` nessa pasta, substituindo os endereços pelos usados na origem e pelo endereço definitivo do destino:

```json
{
  "targetAuthority": "https://registro.seu-dominio.example",
  "output": "registro-unificado.json",
  "sources": [
    {"authority": "http://127.0.0.1:4174", "file": "registro-linux.json"},
    {"authority": "http://127.0.0.1:4174", "file": "registro-windows.json"}
  ]
}
```

As duas origens podem ter a mesma URL localhost: os arquivos e identidades são distintos. Se uma identidade aparecer com sessões divergentes, o comando recusa a migração; nunca escolhe a versão mais recente sozinho. Não edite os hashes para resolver conflitos.

4. No diretório do projeto, valide primeiro (caminhos com espaços precisam de aspas):

```sh
npm run crystal:migrate -- /caminho/privado/migracao.json
```

5. Após conferir o resultado e confirmar que todos os registros estão parados:

```sh
npm run crystal:migrate -- /caminho/privado/migracao.json --write --registries-stopped
```

O comando cria um arquivo novo e se recusa a sobrescrever um existente. Os arquivos de origem não são alterados. Em caso de interrupção durante a gravação, preserve o arquivo parcial e repita com outro nome de saída. Os arquivos originais precisam permanecer intactos.

6. Instale `registro-unificado.json` no serviço central e inicie UMA instância com `COMPANION_REGISTRY_DATA` apontando para esse arquivo. Mantenha os registros antigos desligados. Essa migração é administrativa: o programa não consegue desligar remotamente servidores ou invalidar cópias offline dos arquivos antigos.
7. Configure `COMPANION_REGISTRY_URL` em todos os Cores para o endereço definitivo. Para uma identidade já registrada localmente, abra **Meu vínculo → Conectar esta identidade ao registro migrado**. O botão aparece quando o endereço configurado difere do salvo. Só confirma a mudança depois de verificar a migração no destino.
8. No Windows, selecione o Cristal antigo de Lunaya, informe a senha, use **Examinar Cristal** e **Importar Companion do Cristal**. O código de recuperação fica vazio na transferência normal. Mayuna permanece no Hub.

Não execute a migração repetidamente a partir de backups antigos depois de novas transferências: isso reverteria as autorizações. A saída exclusiva evita sobrescrita acidental, mas a administração do servidor deve preservar a continuidade do registro.

## Hospedagem do registro

Os modelos em `deploy/registry` preparam execução Linux com systemd e proxy HTTPS. Não contratam serviços nem publicam o registro automaticamente.

Pré-requisitos: servidor sob seu controle com Node compatível com o projeto, domínio apontando para ele, proxy HTTPS instalado e persistência para o registro. Compile com `npm ci` e `npm run build`. O serviço sugerido usa `/opt/companion-core`, usuário/grupo de serviço `companion`, arquivo de ambiente `/etc/companion-registry.env` e diretório gravável `/var/lib/companion-registry`. Crie esse usuário e diretórios conforme a administração do seu servidor, ajuste os caminhos, instale o arquivo migrado com acesso exclusivo ao usuário do serviço e copie os modelos para os locais apropriados.

Configure o domínio real no Caddyfile e mantenha o Node escutando apenas em `127.0.0.1:4174`. Confira o acesso HTTPS a `/health` e depois a comunicação do Core. Não rode várias réplicas do registro: a persistência atual é um arquivo com fila em um único processo. Faça backups consistentes do registro com o serviço parado e dos dados de cada Core. Não publique o arquivo do registro como conteúdo estático.

No PowerShell:

```powershell
$env:COMPANION_REGISTRY_URL="https://registro.seu-dominio.example"
npm run web:start
```

No Linux/Termux:

```sh
COMPANION_REGISTRY_URL=https://registro.seu-dominio.example npm run web:start
```

Isso só configura o registro. Preserve suas variáveis habituais de Ollama. Sem domínio/servidor disponível, é possível testar migração local com um único registro em localhost, mas isso ainda não oferece continuidade entre dispositivos distantes.

## Presentear: Passagem do Vínculo

### Quem recebe

1. Entre no seu próprio acesso local e abra **Meu vínculo → Passagem do Vínculo**. Não precisa criar uma Companion para receber.
2. Informe seu nome e como deseja ser chamado; clique em **Criar convite de vínculo**.
3. Envie somente o arquivo público `.vinculo` a quem vai presentear. O convite não contém senha nem chave privada.

### Quem entrega

1. Selecione a Companion correta no Hub.
2. Selecione o convite e confira o destinatário mostrado.
3. Informe o nome do dispositivo e uma senha para o Cristal.
4. Confirme explicitamente o compartilhamento de TODO o histórico. Nesta versão, memórias, diário, eventos e snapshots seguem no presente, inclusive informações pessoais do antigo companheiro. Não existe filtro de privacidade ou exclusão seletiva nessa entrega.
5. Clique em **Preparar a Passagem do Vínculo**. A origem fica recolhida, aguardando o destinatário.
6. Entregue o arquivo `.companion` e a senha ao destinatário. O código de recuperação da origem não deve ser enviado: será invalidado pelo aceite. Se desistir antes do aceite, use **Cancelar recolhimento**. Se o download falhar, **Baixar Cristal novamente** devolve o mesmo arquivo.

### Aceite

1. No acesso que gerou o convite, selecione o `.companion` e informe a senha.
2. Use **Examinar Cristal** para conferir nome, ID, antigo responsável, destinatário, quantidade de memórias/eventos e validade.
3. Confirme o recebimento do histórico e a responsabilidade, então importe.
4. Guarde o NOVO código de recuperação. Gere depois um Cristal pessoal atualizado se precisar de um arquivo para recuperação ou mudança de dispositivo; o presente inicial exige o aceite original e não é um backup de recuperação pós-passagem.

O aceite exige a chave privada do destinatário, mantida no Core. Conhecer somente a senha do Cristal não autoriza outra conta a assumir a sessão. Como o arquivo contém o histórico, qualquer pessoa com arquivo e senha pode lê-lo: a restrição de destinatário controla a autorização no registro, não o acesso criptográfico ao conteúdo.

A Companion conserva suas memórias antigas, mas elas não são tratadas como preferências do novo interlocutor. As preferências próprias continuam disponíveis; um novo registro no diário conta a Passagem. A progressão do vínculo começa do zero, enquanto nível, alma e experiência geral são preservados. A antiga relação é histórica e não vira o vínculo atual automaticamente.

A sessão é exclusiva por identidade no registro compartilhado. O sistema não impede execução de cópias adulteradas do programa nem apaga arquivos já entregues ao antigo responsável. Memórias de um presente não podem ser recolhidas remotamente depois que foram compartilhadas.

## Testes e limites desta entrega

`npm test` inclui testes HTTP existentes e testes de Passagem/migração. `node --test tests/bond-passage.test.mjs` usa o registro real, solicitações assinadas e diretórios temporários com transporte em processo; cobre aceite, destinatário errado, prova ausente, cancelamento, revogação, continuidade e migração sem precisar abrir portas locais.

A hospedagem real e a migração dos registros pessoais dependem dos arquivos originais e do servidor escolhido. Este commit não transfere de fato Mayuna ou Lunaya, não muda suas contas reais e não disponibiliza um servidor na internet.
