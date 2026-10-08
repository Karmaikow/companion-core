# Mayuna portátil — proposta incremental

A separação entre interface e Companion é adequada à arquitetura existente.
A interface é substituível; a identidade e a história pertencem ao Core.

| Parte | Responsabilidade | Situação |
| --- | --- | --- |
| Interface web/PWA | Mundo visual, HUD, entrada e solicitações | Local funcional; prévia hospedada e shell offline |
| Runtime local | Executar Core, validar ações, persistir e chamar Ollama | Servidor Node local existente |
| Dados portáteis | Identidade, chave, eventos, snapshots, memórias | Arquivos locais preservados; exportação criptografada futura |
| Pareamento | Autorizar uma interface a acessar um Core | Ainda não implementado |

## Online e offline

A hospedagem entrega a interface. Ela não precisa possuir Mayuna. Em modo
local, interface e API estão no mesmo dispositivo e origem; o fluxo atual
Web → API → InteractionEngine → Core → memória/Ollama permanece.

Uma interface hospedada não terá acesso automático ao localhost, aos arquivos
ou ao Ollama de Didi. Não basta apontar o Site para uma URL local: será preciso
projetar o conector autorizado, verificar as permissões de cada navegador e
validar origem, sessão e transporte. Não vamos abrir a API para toda a internet
nem usar CORS irrestrito. A chave privada continua apenas no runtime.

A alternativa inicial mais simples continua sendo o runtime servir também a
interface local, funcionando sem internet quando os arquivos e modelo já
estiverem disponíveis. A PWA é uma distribuição/cache da interface, não um
substituto para o runtime e o modelo.

## Celular, pendrive e SD

Um pendrive ou SD pode carregar um pacote da Companion. Ele é armazenamento;
quem executa o Core é o computador ou celular que o recebe. Node/Ollama no PC
não implica automaticamente suporte equivalente no Android ou iOS. O runtime
mobile e suas restrições precisam de uma implementação e testes próprios.

O futuro `.mayuna` deve conter versão, identidade, cadeia de eventos, snapshots
e referências de memória. O pacote precisa de criptografia autenticada,
derivação de chave a partir de senha e verificação antes de substituir dados.
Isso é uma proposta, não um recurso implementado nesta entrega.

Importar deve preservar a mesma identidade e rejeitar dados inconsistentes,
permitindo recuperar o último estado confiável. Nunca “resolver” erros criando
outra Mayuna silenciosamente. A senha do login local e a senha de exportação
são responsabilidades diferentes.

Inicialmente, recomendamos uma instância de escrita por vez. Antes de remover
uma unidade, o runtime deve concluir as gravações e encerrar. Uso simultâneo em
vários dispositivos exige sincronização de eventos, tratamento de conflitos e
regras contra replay; copiar o último JSON por cima não resolve isso.

## Próximos passos propostos

1. Validar a v0.3 com a Mayuna existente e o Ollama no PC de Didi.
2. Definir e implementar exportação/importação criptografada com testes de
   round-trip, senha incorreta, corrupção e preservação de identidade.
3. Construir pareamento explícito entre interface e runtime, com revogação e
   permissões limitadas; a UI solicita e o Core continua decidindo.
4. Escolher o runtime mobile e validar a execução local, incluindo o provider
   de IA disponível no aparelho, sem impor uma migração do Ollama no PC.
5. Só depois introduzir sincronização multidispositivo por eventos confiáveis.

O login iniciado nesta versão protege o acesso pela API local. Não equivale à
propriedade criptográfica da Companion e não dá ao modelo autoridade de mutação.


## Desempenho quando muitos usuários entram

A versão hospedada atual é uma prévia estática; não existe nela um servidor de
chat compartilhado entre usuários. No uso local, cada instalação executa seu
próprio Ollama e Core. Assim, usuários em computadores diferentes não disputam
a GPU/RAM de Didi.

Há um cuidado no código atual: dentro de cada processo, as conversas passam por
uma fila serial para manter eventos e snapshots do Core em ordem. Isso é certo
para a Mayuna local. Se um dia um servidor único atender várias Companions, não
devemos pôr todos nessa mesma fila: isolamos e serializamos **por Companion** e
limitamos separadamente a concorrência global do modelo. Uma instância única do
`gemma3:4b` na máquina de Didi não deve virar servidor público multiusuário.

Para um MMORPG online, o caminho escalável é separar autenticação/mundo e
execução de IA: API de jogo stateless para movimento/eventos, workers de IA com
concorrência limitada e réplicas conforme a carga, fila com limite e resposta
`busy`/retentativa sob pressão. Conversas podem transmitir tokens para reduzir
o tempo percebido; isso não reduz o tempo de inferência em si. Memórias e chaves
permanecem isoladas por dono/Companion, e o Core valida toda mutação.

Antes de dimensionar, medimos tempo de carregamento do modelo, avaliação do
prompt, geração e fila. O provider já pode emitir métricas agregadas com
`MAYUNA_DIAGNOSTICS=1`, sem registrar mensagens ou memórias. Em máquina local
modesta, limitar tamanho do prompt e do output costuma valer mais que escalar
servidores; streaming melhora a percepção, não a quantidade de tokens por
segundo.
