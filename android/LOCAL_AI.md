# IA local Android — beta 0.4.7

Em Conversa, selecione **IA no celular**, toque em **Baixar IA local** e salve. O motor está no APK; o modelo é baixado uma vez, explicitamente. Não exige conta externa. Groq com chave pessoal e Ollama remoto continuam opcionais; configurações existentes são preservadas.

- Modelo oficial Qwen2.5-1.5B-Instruct, Q4_K_M, Apache-2.0.
- Revisão: `91cad51170dc346986eccefdc2dd33a9da36ead9`.
- Arquivo: `qwen2.5-1.5b-instruct-q4_k_m.gguf`, 1.117.320.736 bytes.
- SHA-256: `6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e`.
- Download HTTPS com progresso, cancelamento, limite de tamanho e hash obrigatório antes da instalação atômica. Uma interrupção exige reiniciar o download; sem retomada parcial nesta versão.
- Motor llama.cpp b5046, commit `74d4f5b041ad837153b0e90fc864b8290e01d8d5`, MIT; CPU ARM64, 4 threads, contexto 4096, resposta até 256 tokens. Sem GPU nesta beta.
- Processo sob demanda, loopback autenticado por segredo aleatório, sem logs de conversas. Launcher encerra o motor quando o processo Core morre. Libera modelo após 60 segundos sem geração.
- Sem fallback online automático. Falhas não devem gerar XP/memórias. Respostas incompletas são rejeitadas.
- Modelo, configurações de IA e chaves de API ficam fora do Cristal. Identidade e memórias continuam no Core.
- Offline refere-se à inferência: registro, transferências e operações que já exigem validação online continuam exigindo internet.

## Build

Execute `android/build-local-engine.sh` com `ANDROID_NDK_HOME` apontando para NDK r27c; exporte `LLAMA_ANDROID_SERVER` com o executável resultante. Os demais requisitos de `build-apk.py` continuam iguais. O APK embala esse executável em `lib/arm64-v8a/libllama-server.so`, extraído pelo instalador Android; nunca executa código baixado na pasta de dados. O modelo é somente dados.

## Validação e limites

Testes de provider, Core, bootstrap e preservação Unicode; compilação Java/API35, motor ARM64 e assinatura APK. O teste real no Android ainda precisa medir tempo de primeira resposta, RAM, bateria e retomada após alternar aplicativos. Não há dispositivo/emulador Android no ambiente de build. Não desinstale nem limpe dados para atualizar.

Validação adicional: inferência real com o mesmo modelo e revisão do motor em Linux, usando o provider local e contexto sintético do Core; resposta em português concluída. Requisição sem autenticação ao motor retornou 401. Esse teste não mede desempenho Android.
