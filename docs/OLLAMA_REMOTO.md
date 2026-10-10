# Ollama remoto — primeira etapa

O backend do Companion Core pode enviar as conversas para um endpoint Ollama configurado pelo administrador. O navegador e o celular continuam falando com a API do Companion Core; eles nunca recebem o endereço do modelo nem o token do gateway.

Sem configuração, o provider continua usando `http://localhost:11434` e `gemma3:4b`. Nenhuma troca automática para OpenAI acontece quando o Ollama fica indisponível.

## Configuração

Variáveis reconhecidas pelo processo Node:

- `MAYUNA_OLLAMA_BASE_URL`: raiz do Ollama ou do gateway HTTPS, por exemplo `https://ollama.exemplo.com`. O servidor acrescenta `/api/chat` automaticamente. Também aceita uma URL terminada em `/api` ou `/api/chat`.
- `MAYUNA_OLLAMA_MODEL`: nome do modelo; padrão `gemma3:4b`.
- `MAYUNA_OLLAMA_TOKEN`: opcional; enviado como `Authorization: Bearer ...` para um gateway que valide esse token.

Exemplo em Linux/macOS, sem token:

```bash
MAYUNA_OLLAMA_BASE_URL=https://ollama.exemplo.com \
MAYUNA_OLLAMA_MODEL=gemma3:4b \
npm run web:start
```

Para o endereço local padrão, basta iniciar `npm run web:start` como antes.

## Segurança e limites desta etapa

- Endereços remotos precisam usar HTTPS. HTTP só é aceito para `localhost`, `127.0.0.1` ou `::1`.
- Não exponha a porta `11434` do Ollama diretamente à internet. Coloque-o atrás de um gateway HTTPS com autenticação e limite de requisições. O Ollama padrão não valida `MAYUNA_OLLAMA_TOKEN`; só use esse token quando o gateway estiver configurado para exigi-lo.
- Não coloque o token no frontend, em URLs, commits, screenshots ou logs. `.env` não é carregado automaticamente nesta versão; configure a variável no ambiente do processo Node.
- Esta entrega só permite configurar o endpoint e o modelo. Ainda não inclui servidor de inferência, fila global, escala multiusuário, medição concorrente ou gateway de produção. O runtime atual mantém estado local de uma Companion.
- Um erro no Ollama encerra aquela interação com erro; não habilita provider pago nem aplica XP ou memórias como se a resposta tivesse sido concluída.

Antes de hospedar para outras pessoas, ainda é necessário medir latência, limitar concorrência e validar isolamento por usuário/Companion.
