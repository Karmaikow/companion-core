# Primeiro vínculo e Refúgio

## Uma Companion própria por conta local

Uma instalação vazia inicia sem Companion. Após criar/entrar no acesso local, o usuário completa o ritual: nome da Companion, seu nome, tratamento, cor da alma e traços em badges. A gênese, chave Ed25519, estado e ponteiro ativo só são criados depois de um ritual válido. Não há mais criação automática de Mayuna no primeiro início do servidor.

Após o despertar, o servidor recusa outra criação com HTTP 409, inclusive com nomes diferentes e duas solicitações simultâneas. A antiga variável `MAYUNA_ALLOW_EXTRA_COMPANIONS` não libera mais essa exceção. O botão de criar desaparece para quem já possui uma Companion. O backend atual tem uma conta local por diretório de dados; isso não é ainda um sistema de contas sincronizadas entre dispositivos.

Instalações que já tinham várias identidades continuam podendo selecionar as existentes. Nenhuma identidade, memória, chave ou evento é apagado por esta atualização. Uma chave ausente, estado corrompido ou ponteiro perdido continua interrompendo a inicialização para evitar substituição silenciosa.

## Ritual e evolução

A cor da alma é registrada no perfil e na gênese assinada; não existe rota para alterá-la. O tema visual inicia nessa cor e pode ser ajustado separadamente por identidade. Perfis antigos mantêm o visual azul existente.

Os cinco grupos inspirados no Big Five calculam tendências. Temperamento e eixos inspirados no MBTI orientam a descrição narrativa usada nas conversas. Não são avaliação psicológica. As sementes visuais ficam persistidas para a futura manifestação; modelos 3D e transformação automática ainda não foram implementados.

O usuário é o companheiro humano da alma. O Refúgio faz parte de um universo de fantasia. A cor escolhida registra a preferência do usuário, sem inventar uma preferência pessoal para a Companion.

## Começar um teste novo com dados antigos incompletos

Pare o servidor. Preserve integralmente a pasta anterior fora de `data`, sem editar seus IDs nem gerar uma chave substituta. Dentro do projeto, no Linux:

```bash
backup_dir="$(mktemp -d ./data-linux-backup-XXXXXXXX)"
mv data "$backup_dir/data"
```

No próximo início, será necessário configurar o acesso local novamente e completar o ritual. A Lunaya poderá nascer com seu próprio ID, chave, memórias e progresso, enquanto os arquivos antigos continuam no backup. Esse teste não recupera a identidade antiga sem chave.

## Verificação

- Instalação vazia não cria identidades nem eventos antes do ritual.
- Escolhas inválidas deixam a instalação vazia e permitem tentar novamente.
- Nome, tratamento, cor, traços, chave e identidade sobrevivem ao reinício.
- Segunda criação é bloqueada na API, inclusive quando a antiga variável de testes vale `1`.
- Alterar o tema não altera a cor da alma.
- Instalações existentes e falhas de integridade preservam seus dados.

## Encontros futuros

Mayuna e Lunaya poderão se encontrar quando implementarmos identidades portáteis, mundo externo e convites. Cada alma terá sua própria história. Visitas ao Refúgio precisarão de consentimento, autorização revogável e separação entre chat privado e chat compartilhado. Nenhuma visitante terá acesso automático às memórias privadas de outra Companion. Essas funções ainda não estão disponíveis.

## Conferir a instalação que está rodando

`npm start` e `npm run web:start` recompilam os arquivos antes de iniciar o servidor. `npm run dev` inicia a aplicação web pelo código TypeScript. O demo CLI só roda pelos comandos `demo` e `demo:dev`, com dados próprios em `.mayuna-cli-demo/`; ele não grava na pasta `data` da conta web.

No terminal, o servidor atualizado mostra `first-awakening-v1`, o diretório do projeto, o arquivo de servidor carregado, o caminho de dados efetivamente usado e o ID ativo (ou `nenhuma · aguardando ritual`). A rota `/api/health` também informa `startupFlow: first-awakening-v1`, sem revelar caminhos nem IDs. Se esse marcador não aparecer, confira a branch, o último commit e o processo que ocupa a porta 4173 antes de trocar dados outra vez.

Uma identidade já gerada por uma versão antiga permanece carregável e não é apagada pela atualização. Para testar o ritual do zero, depois de parar o processo correto e confirmar o código atualizado, preserve a pasta ativa em backup conforme descrito acima. Use o caminho mostrado no log se `MAYUNA_DATA_DIR` estiver configurado para outro diretório.
