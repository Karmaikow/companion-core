# Laboratório VFX da Forja de Batalha

No painel do Administrador, abra a Forja de Batalha e selecione uma habilidade. A seção Laboratório de VFX adiciona até seis camadas ao efeito principal. Use Salvar para manter o status atual ou Salvar e publicar para disponibilizar a habilidade pelo catálogo existente.

- Composições: Cristais glaciais, Tempestade arcana e Brasas vivas. Substituem apenas as camadas, após confirmação se houver camadas existentes.
- Camadas: runas, névoa, faíscas, cristais geométricos instanciados e arcos elétricos.
- Cada camada define início na preparação ou lançamento, atraso, duração, local (conjurador/alvo/trajeto), escala, quantidade, cor herdada ou fixa e ativação.
- A linha do tempo resume a sequência. Pausar, continuar, reiniciar, 0,25×/0,5×/1× e arena escura controlam a prévia. Esses controles não modificam o combate.
- Os ajustes ficam em `SkillDef.vfx.layers`. Habilidades sem camadas mantêm o comportamento anterior. O sanitizador aceita somente camadas conhecidas e limita quantidades, duração e escala. A cópia de regras da Edge Function acompanha o novo formato; nenhuma migração SQL é necessária.
- `playVfxLayers` é usado na prévia e nos dois caminhos de combate (Companion e criatura). Camadas são puramente visuais: não calculam acertos, dano, energia ou recarga. O raio e alcance do contexto vêm da habilidade, embora partículas decorativas possam se espalhar além do limite de colisão.

## Limites desta primeira versão

As camadas são sobrepostas à receita principal, não a substituem. O início é relativo à preparação/lançamento, e não a um evento físico de colisão; projéteis podem chegar em momentos diferentes conforme a distância. As âncoras são posições capturadas no lançamento, não sockets animados. Cristais são decoração e não obstáculos de navegação. Os arcos elétricos persistem pela duração configurada; não são uma simulação física. Máximo de 192 cristais por cena, além do limite existente de partículas. Não há promessa de equivalência visual ao vídeo nem medição de FPS em dispositivos físicos.

## Verificação

- `npm run build`: aprovado (aviso de tamanho do bundle principal já acima do limite configurado).
- `npm test`: 232 testes aprovados, incluindo cinco testes novos de round-trip, limites, temporização, pausa, limpeza e limite de cristais.
- Navegador Chromium com WebGL por software: edição, salvamento/reabertura com API simulada, remoção, pausa por comparação de pixels, velocidade e viewport móvel de 390 px.
- Catálogo online autenticado e partida real com múltiplos jogadores não foram exercitados; validar na prévia de implantação antes de promover a main.
