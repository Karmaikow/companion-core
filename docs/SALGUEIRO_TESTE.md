# Salgueiro do Vale dos Ecos — teste na branch ecos-do-vale

Integra os GLBs originais enviados na conversa, sem conversão: `ecos_salgueiro.glb` e `ecos_machado.glb` em `client/public`.

## Localização

Posições absolutas do Core (`shared/rules/ecos.ts`), no bosque junto ao riacho do Vale dos Ecos. Não dependem da ponte:

| Nó | X | Z |
| --- | ---: | ---: |
| salgueiro-baixo | -6.4 | 19 |
| salgueiro-curva | -5.6 | 31.5 |
| salgueiro-nascente | -8.2 | 45.5 |

Y acompanha o terreno por `height(x, z)`, não é uma constante. O Salgueiro Antigo é outro recurso e não foi alterado.

## Fluxo e verificação manual

1. Entrar no Vale e clicar em um dos três salgueiros. Escolher **Cortar a árvore**.
2. Sem machado disponível no perfil, o fluxo existente deve recusar. Com machado utilizável, aproximação e coleta seguem o Core/Pacto.
3. Durante a coleta, verificar o GLB do machado animado junto ao tronco, a oscilação da árvore, as partículas existentes e a barra de resistência. O machado é um efeito junto à árvore; não está preso à mão do personagem.
4. Após confirmação, verificar 4–6 Madeiras de Salgueiro na mochila e consumo de seis unidades de abundância. Não há novo loot no chão: os drops seguem o inventário existente.
5. O corte de árvore cheia deixa abundância 2/8 e mostra um toco por código. O GLB volta quando há abundância para novo corte (6/8). O Core regenera três unidades por hora: aproximadamente 80 minutos para outro corte e duas horas para encher, sem outras coletas.
6. Recarregar e verificar mochila e abundância preservadas. Reenvio da mesma confirmação não deve duplicar materiais. Mochila cheia não deve gastar recurso.

O cliente só anima: recompensas, ferramentas, desgaste e armazenamento continuam nos caminhos existentes. Offline usa localEcos/localStorage; online mantém o servidor existente. Sem migrações, alterações de loja, novas ferramentas concedidas ou mudanças na Erva de Orvalho. A versão online implantada e a apresentação visual no jogo precisam de teste manual; os testes automatizados de coleta exercitam o modo local, não um servidor de produção.

## Validação automatizada

- `npm test`: 29 arquivos, 275 testes aprovados, incluindo os dois cenários de coleta local acima.
- GLBs: cabeçalho glTF 2, tamanho declarado e texturas incorporadas conferidos; arquivos originais preservados.
- No Windows, `npm run build` encontra o conflito preexistente entre o import de `World.tsx` e `world.ts`. Para validar o código, a cena foi temporariamente renomeada para `WorldScene.tsx` e o import correspondente ajustado, sem incluir essa alteração no commit.
- Build com o ajuste temporário: TypeScript e Vite aprovados; nomes originais restaurados antes do commit.
