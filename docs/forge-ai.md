# IA da Forja

No laboratório, descreva o VFX, selecione uma imagem opcional e clique Gerar VFX. A geração usa NVIDIA Nemotron para compor as cinco famílias de camadas existentes. Aplicar substitui as camadas do rascunho, sem salvar automaticamente nem alterar combate.

## Ativação

Implante a Edge Function `forge-vfx` com os arquivos de regras importados. Configure os secrets `NVIDIA_API_KEY`, `FORGE_AI_MODEL` (opcional; padrão `nvidia/nemotron-nano-12b-v2-vl`, com visão) e `FORGE_AI_USER_IDS` (UUIDs autorizados, separados por vírgula). Nunca coloque esses secrets no frontend. O endpoint valida o JWT com getUser e só permite a lista explícita. Sem configuração ele falha de forma fechada.

Cada clique gera uma chamada faturada pelo provedor. Texto e imagem são enviados à NVIDIA; o aplicativo não persiste a referência. Limites: imagem 2 MB no cliente, corpo 3 MB no servidor, texto 2000 caracteres, resposta 2000 tokens, timeout 45 s. A lista de acesso restringe o uso a administradores selecionados; não há quota distribuída, portanto não habilite acesso amplo antes de implementar orçamento por usuário.

Não gera shaders, texturas ou modelos novos. Requer validação com credenciais reais antes de disponibilizar em produção.

A integração usa https://integrate.api.nvidia.com/v1/chat/completions, com max_tokens, stream=false e instruções JSON. Não depende de response_format, ausente na referência deste modelo. Aceita JSON puro ou cercado por bloco Markdown; rejeita respostas inválidas. Modelos somente texto não atendem ao upload de imagem. Respostas HTTP 202 são informadas como processamento pendente, sem polling nesta versão.

Referência: https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-nano-12b-v2-vl-infer
