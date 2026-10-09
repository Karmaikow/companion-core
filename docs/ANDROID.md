# Android / Termux — atualização do ritual

O APK Companion Core v0.3 é um cliente da interface local. O Core, a conta, identidades e chaves continuam no Termux. Esta versão não inclui modelo Ollama, servidor externo, NFC ou execução do Core dentro do APK. Não usa API paga por padrão.

## Atualizar uma instalação existente

Instale o novo APK por cima do anterior. Ele mantém `com.companioncore.mobile.test` e o certificado de teste do APK v0.1. Não precisa desinstalar o aplicativo. Se Android recusar por assinatura diferente, mantenha a instalação e informe a mensagem. A compatibilidade foi verificada com o APK anterior que temos, não com seu aparelho.

1. No Termux, pare o servidor com Ctrl+C.
2. Baixe o ZIP `companion-core-termux-v0.3.zip` para Downloads.
3. Libere acesso ao armazenamento com `termux-setup-storage` se necessário.
4. Extraia e execute o atualizador:

```bash
pkg install unzip
unzip -o "$HOME/storage/downloads/companion-core-termux-v0.3.zip" -d "$HOME/companion-update-v03"
bash "$HOME/companion-update-v03/mayuna-mobile/scripts/update-termux.sh"
cd "$HOME/mayuna-mobile"
npm run android:check
npm run android:start
```

O atualizador copia código sobre `$HOME/mayuna-mobile` e salva um backup privado dos diretórios de dados existentes em `$HOME/.companion-backups`. O pacote não contém `data/`, `.mayuna-mobile-preview/`, `.env`, chaves, contas ou `node_modules`. Não é necessário npm install para executar o pacote pré-compilado. Não desinstale o Termux: seus dados ficam nele.

Após iniciar, abra o APK → Entrar no mundo. Use sua conta local existente. O APK e o navegador possuem sessões distintas, mas compartilham o mesmo Core.

O diagnóstico cria dados temporários isolados: ele não abre sua Companion real.

## Ollama

O iniciador preserva `MAYUNA_AI_PROVIDER` da sessão. Sem configuração, usa `mock`, que é resposta simulada para testar interface e persistência. Isso não é conversa livre com IA. O pacote não instala Ollama.

Para usar um Ollama acessível:

```bash
MAYUNA_AI_PROVIDER=ollama \
MAYUNA_OLLAMA_BASE_URL=http://localhost:11434 \
MAYUNA_OLLAMA_MODEL=gemma3:4b \
npm run android:start
```

`localhost` é o próprio celular. Para um Ollama no computador, use o endereço acessível dele pela rede e o gateway protegido configurado no projeto. Isso só funciona enquanto esse servidor estiver acessível; estar fora da rede de casa não estabelece essa conexão automaticamente.

## GitHub no celular

O app GitHub serve para acompanhar código e revisões. Para clone/pull/commit use Git no Termux:

```bash
pkg install git nodejs-lts
git clone --single-branch --branch feature/ollama-remoto https://github.com/Karmaikow/companion-core.git "$HOME/companion-core"
cd "$HOME/companion-core"
npm ci
npm run build
```

Para continuar com a identidade já instalada, primeiro confira seu ponteiro e use o diretório existente:

```bash
test -f "$HOME/mayuna-mobile/.mayuna-mobile-preview/active-companion.json" || { echo "Dados anteriores não encontrados; confira a pasta antes de iniciar."; exit 1; }
MAYUNA_DATA_DIR="$HOME/mayuna-mobile/.mayuna-mobile-preview" npm run android:start
```

Não inicie duas cópias do Core ao mesmo tempo. As próximas atualizações do checkout Git podem ser feitas com `git pull --ff-only`, `npm ci` e `npm run build`, após parar o servidor. Arquivos de Companion e chaves ficam fora do Git.

## Testar

Abra Hub → Despertar Companion · teste. Escolha nomes, cor e traços. A cor da alma persiste; o tema visual pode mudar separadamente. Reinicie o servidor e confirme a identidade e preferências. A criação extra continua temporariamente habilitada; encontros e visitantes ainda não foram implementados.

O APK preserva o cliente nativo anterior, aumenta a versão de instalação e mantém o mesmo certificado. A interface nova é entregue pelo pacote Termux. Conteúdo e assinatura do APK verificados. Não houve instalação/emulação Android nem teste visual em aparelho neste ambiente.
