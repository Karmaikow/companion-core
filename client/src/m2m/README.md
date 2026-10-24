# Mesh2Motion (retarget)

Código do retarget do [Mesh2Motion](https://github.com/Mesh2Motion/mesh2motion-app) (MIT, `LICENSE-MIT.md`),
trazido de `src/retarget` (commit 653a969, out/2026) com mudanças mínimas: imports sem `.ts`, sem a interface
(`ModalDialog`, passos da tela) e o enum `TargetBoneMappingType` num arquivo próprio.

Nosso código: `standard.ts` (converte o pacote padrão para o esqueleto de um Companion, enxuga e grava o .GLB do jogo),
`slots.ts` (qual clipe faz cada papel) e `lab.ts` (lab no dev: `/m2m-lab.html?modelo=/caminho/modelo.glb`).

Animações em `client/public/m2m/` (CC0, `mesh2motion-app/static/animations`), sem malha e comprimidas (meshopt).
