# Mayuna Web v0.1

Primeira interface web jogável/visual do Companion Core.

## Adicionado

- `web/index.html`: HUD completo do MMORPG/Companion.
- `web/styles.css`: visual sci-fi responsivo com temas de cor.
- `web/app.js`: estado, drawers, hotbar, canvas animado, chat e personalização.
- `src/server/companion-runtime.ts`: ponte segura entre UI e Companion Core.
- `src/server/web-server.ts`: servidor HTTP local + API + arquivos estáticos.
- scripts `npm run web` e `npm run web:start`.

## Princípios preservados

- O Core continua sendo a autoridade sobre progressão e memória.
- A interface não recebe a chave privada.
- O arquivo de identidade e os dados atuais de Mayuna foram preservados sem alteração.
- O chat usa o `InteractionEngine`, que continua usando o mesmo `OllamaProvider`.

## Desktop

HUD com Companion, equipamentos, mapa, missões, integridade, skills, passivas, hotbar e viewport central animado.

## Mobile

Mundo em tela cheia, status reduzido, cinco atalhos principais e dock inferior. Os painéis abrem como drawers para não cobrir permanentemente o mundo.

## Personalização

A cor do HUD é alterável em tempo real e persistida no navegador. Presets iniciais: Violeta, Safira, Musgo, Aurora, Arcana e Solar.
