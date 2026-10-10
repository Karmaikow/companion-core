# Cristal de Memória — primeira versão

O Cristal transporta uma Companion entre dispositivos, mantendo o ID, a chave, a cor permanente da alma, a personalidade, as memórias, o diário, os eventos, os snapshots, as duas progressões, o inventário e as descobertas. O arquivo `.companion` é criptografado com AES-256-GCM, chave derivada da senha com scrypt (N=32768, r=8, p=1), salt aleatório e nonce de 12 bytes. A senha tem 12 a 256 caracteres. Cada arquivo também contém uma assinatura Ed25519 do estado completo, além das assinaturas dos eventos e hashes dos snapshots existentes.

O registro central guarda somente identificação criptográfica, autorização da sessão, nome/plataforma do dispositivo, início/último contato e os hashes necessários para controlar a transferência. Não recebe a chave privada, as memórias, o arquivo nem sua senha. O acesso ao registro exige solicitações assinadas pela identidade da Companion; possuir somente seu ID ou chave pública não dá acesso aos metadados. O ID é associado ao fingerprint canônico da chave para evitar que outra chave reserve o mesmo ID.

## Primeiro teste no Linux

Atualize a branch `feature/ollama-remoto` e rode `npm test`.

Em um terminal, dentro do projeto:

```bash
npm run crystal:server
```

Mantenha esse terminal aberto. O registro de teste escuta `127.0.0.1:4174` e salva seu controle em `.companion-registry/registry.json`, fora do Git. Não apague nem substitua esse diretório ao atualizar o código. Use uma única instância do registro para todas as cópias do Core.

Em outro terminal, inicie o Core existente:

```bash
COMPANION_REGISTRY_URL=http://127.0.0.1:4174 \
MAYUNA_AI_PROVIDER=ollama \
MAYUNA_OLLAMA_BASE_URL=http://localhost:11434 \
MAYUNA_OLLAMA_MODEL=gemma3:4b \
npm run web:start
```

Abra **Meu vínculo → Cristal de Memória**, nomeie o dispositivo (por exemplo, “PC do Trabalho”), defina uma senha e escolha **Recolher ao Cristal**. Guarde o download, a senha e o código de recuperação mostrado. O código é separado da senha e muda a cada despertar ou recuperação.

A criação agora oferece duas escolhas no acesso vazio: despertar uma nova alma ou importar um Cristal. Nenhuma identidade existente é substituída por outra.

Para simular outro dispositivo sem mexer nos dados atuais, use uma segunda pasta de dados e outra porta, apontando para o mesmo registro:

```bash
PORT=4175 \
MAYUNA_DATA_DIR=data-crystal-destino \
COMPANION_REGISTRY_URL=http://127.0.0.1:4174 \
MAYUNA_AI_PROVIDER=mock \
npm run web:start
```

Abra `http://127.0.0.1:4175`, crie o acesso local, abra o Cristal com sua senha e nomeie o destino. A IA dessa simulação é mock. Para testar conversas reais, use as mesmas variáveis Ollama do primeiro terminal. Acompanhe o ID, as memórias e a cor da alma antes/depois. Um segundo despertar do mesmo arquivo em outro destino deve ser bloqueado e mostrar o dispositivo e a sessão autorizados.

## Uso entre Linux, Windows e Android

`localhost` refere-se ao próprio dispositivo. Para transferir entre máquinas, o registro precisa estar num endereço HTTPS acessível por todos, com o mesmo valor de `COMPANION_REGISTRY_URL` em cada Core. O serviço está implementado, mas não é hospedado automaticamente por este projeto. Uma implantação usa proxy HTTPS na frente de `npm run crystal:server`, persistência de `.companion-registry` e uma única instância Node responsável pelo arquivo. É possível configurar `HOST`, `PORT` e `COMPANION_REGISTRY_DATA` para essa instalação.

No PowerShell, defina `$env:COMPANION_REGISTRY_URL="https://seu-registro.example"` antes de iniciar o Core. No Termux, use a mesma variável no comando de inicialização. O APK é a interface; o controle e os arquivos continuam no Core executado pelo Termux. Pacotes mobile antigos precisam receber o código/build atualizado para ter esse fluxo.

Sem registro configurado, o funcionamento local existente continua, e as transferências ficam desabilitadas. Ao configurar o registro, o primeiro chat ou recolhimento registra a sessão. Depois disso, cada conversa verifica essa autorização online. Um Core já registrado conserva a URL no controle local, mesmo se a variável for omitida numa inicialização posterior. O MVP bloqueia o chat quando o registro está indisponível; ainda não implementa uma autorização offline com prazo. Não deve ser apresentado como proteção contra uma cópia adulterada do programa ou contra clonagem integral das credenciais de dispositivo.

## Recolher, despertar e interromper

- O Core serializa conversa, salvamento e transferência. O estado exportado não recebe outra conversa durante o recolhimento.
- O arquivo fica preparado e salvo localmente antes de pedir a suspensão ao registro. Uma falha ambígua de rede mantém a origem pausada até retomar ou cancelar.
- Se o download falhar, **Baixar Cristal novamente** retorna o mesmo arquivo. A senha original continua sendo necessária para abri-lo.
- **Cancelar recolhimento** só reativa a origem enquanto a transferência não foi consumida. O Cristal cancelado não serve para um despertar normal.
- O destino valida criptografia, assinatura, chave e histórico antes de instalar. Uma transação pendente permite retomar a autorização após queda de conexão ou reinício; o mesmo arquivo deve ser usado.
- Duas tentativas de despertar concorrentes são serializadas no registro: apenas uma sessão recebe a autorização.
- Na importação da mesma identidade, um backup privado é salvo em `data/.crystal/backups` antes da atualização. Uma história mais antiga ou divergente é bloqueada, sem mesclagem automática.
- Os arquivos locais de controle/instalação usam permissões privadas onde o sistema oferece esse suporte. Durante uma instalação pendente, a chave pode existir no arquivo local de recuperação, com a mesma proteção dos arquivos de chave do Core. Ela não é enviada ao registro nem incluída sem criptografia no download.

## Dispositivo ativo e recuperação

A tela mostra nome do dispositivo, plataforma, identificador resumido da sessão, início e último contato. “Autorizada” não significa que a máquina está online neste instante. O silêncio do dispositivo não libera outra sessão automaticamente.

Em **Recuperar um dispositivo perdido**, selecione um Cristal disponível, informe sua senha e o código de recuperação da sessão atualmente autorizada. Confirme explicitamente a revogação. Isso restaura somente a história presente no arquivo; conversas posteriores num dispositivo perdido não podem ser recuperadas pelo registro, pois ele não guarda as memórias. Após a operação, a sessão anterior é recusada na próxima consulta. Um novo código de recuperação é fornecido. O código antigo deixa de funcionar.

Sem a senha do Cristal, seu conteúdo não pode ser aberto por este serviço. Perder o arquivo e os dados locais também não permite ao registro reconstruir a Companion. A ação independente “Criar backup”, sincronização remota de conteúdo e autorizações offline com prazo ficam para uma próxima etapa.

## Validação

`npm test` inclui ida/volta com identidade intacta, reinício da origem recolhida, senha incorreta, ciphertext adulterado, estado sem assinatura válida, conflitos de identidade e de histórico, uso repetido de arquivo, cancelamento, duas importações simultâneas, repetição de solicitação assinada após reiniciar o registro, resposta perdida nos dois lados, recuperação, indisponibilidade da autoridade e transferência HTTP de um arquivo grande com autenticação local. Esses testes usam diretórios temporários e um registro local descartável. A instalação real em Android, Windows e a apresentação visual ainda precisam de conferência nesses ambientes.


## Várias Companions no mesmo Hub

É possível importar Lunaya enquanto Mayuna está ativa, sem recolher Mayuna. A importação seleciona Lunaya; Mayuna permanece salva e autorizada neste dispositivo. Use a seleção de Companions do Hub para alternar. Cada identidade mantém suas próprias memórias, chave, sessão e código de recuperação. A restrição de uma sessão autorizada por identidade continua valendo entre dispositivos.

Recolher uma Companion afeta somente a selecionada. Uma senha errada ou um Cristal recusado não substitui a Companion atual. Se a importação ficar pendente, a outra Companion continua utilizável; retome o mesmo arquivo para concluir. No reinício, o Core tenta concluir a operação pendente.

O controle antigo de sessão é migrado automaticamente para o formato por identidade, sem alterar os arquivos das Companions. A criação de uma nova alma continua bloqueada quando já existem Companions; importar não cria uma nova identidade.

Para trazer Lunaya: faça backup da pasta `data`, atualize o projeto e rode `npm test`. Abra **Meu vínculo → Cristal de Memória → Importar Companion do Cristal**, escolha o arquivo `.companion`, informe sua senha e nomeie o computador. O código de recuperação só é necessário no fluxo explícito de recuperação de dispositivo perdido. Na transferência normal, deixe esse campo vazio.

O registro que autorizou a exportação precisa continuar acessível, com seus dados originais. Um registro novo em `localhost` no Windows não substitui o registro do Linux. Esta atualização não hospeda nem migra esse serviço. Contas remotas, amizades e encontros no mundo permanecem etapas futuras; o Hub atual é uma instalação local com várias identidades.
