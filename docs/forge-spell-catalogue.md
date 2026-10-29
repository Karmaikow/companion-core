# Catálogo de habilidades por referência

A Forja oferece os 100 efeitos ativos de `majidmanzarpour/threejs-vfx`, revisão `3d184edec529e5ad8055d8803967ea1f040aede0`, que expande as seis habilidades de `achrefelouafi/LinearAbiltyCastingThreeJS`. Não há 106 efeitos distintos: os seis originais já integram o catálogo de 100. Ambos os projetos declaram MIT. A licença e a proveniência acompanham o código em `client/src/vendor/threejs-vfx/`.

## Uso

Abra uma habilidade na Forja, procure a Biblioteca de habilidades, filtre a escola ou busque pelo nome original e selecione o efeito. A prévia reinicia; salve a habilidade para persistir `vfx.catalogue`. O botão Visual clássico remove a associação. Os IDs são validados por lista permitida tanto no cliente quanto na cópia das regras do servidor.

O campo visual não altera dano, custo, recarga, status nem geometria de colisão. A forma visual de um efeito pode ser mais larga que a área definida na folha; ajuste os parâmetros de combate na Forja. Os novos IDs são também executados no renderizador do mundo para companions e criaturas. As habilidades existentes não são sobrescritas em massa no banco.

## Integração e limites

As classes e os shaders são carregados sob demanda. Cada viewport tem seus próprios efeitos, partículas, luzes e recursos de chão; até quatro casts simultâneos são aceitos. Fechar a prévia libera seus recursos. Nenhuma API de IA, HDRI, FBX, textura ou aplicativo externo é necessário.

Esta adaptação usa o renderizador atual do Companion Core. A prévia da Forja inclui os passes de profundidade, refração, bloom e gradação do sandbox. No mundo, mantém o pós-processamento existente e profundidade neutra para partículas. Ainda não inclui os hooks globais de alteração do cenário e tremor de câmera. Isso reduz a fidelidade de efeitos como espelhos, portais e distorções. Os 100 efeitos têm classes integradas, mas paridade visual com o sandbox não é garantida.

O repositório original também possui experimentos em `src/archive`; esses arquivos são legado inativo e não fazem parte das seis habilidades atuais. Não foram importados.

## Validação

Build TypeScript/Vite e oito testes de catálogo/persistência/camadas passaram. Uma execução Node instanciou e simulou todos os 100 efeitos sem exceção. Isso não compila GLSL: a validação visual WebGL e o desempenho em Android continuam pendentes porque a instalação do navegador de teste falhou no ambiente.
