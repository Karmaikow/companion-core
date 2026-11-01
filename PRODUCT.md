# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Jogadores**: o público mistura quem joga casual e aconchegante (vínculo com o Companion, sessões curtas) com quem gosta de ARPG/MMO (builds, skills, loot, sessões longas). Celular e PC têm o mesmo peso. O GDD exige PC, web e mobile, e o empacotamento para lojas via Capacitor continua sendo web.
- **Administradora/criadora**: hoje, só a autora do jogo usa o Administrador para montar o mundo (cidade, lojas, forja, bestiário, skills, animações, VFX). No futuro, **GMs** também vão usar essas telas.

## Product Purpose

ARPG autônomo / MMORPG procedural (GDD v0.2) em que cada jogador tem um **Companion** controlado por IA. O Companion nasce como um núcleo de luz no Refúgio e descobre quem é conversando com o jogador. O repositório implementa o MVP 1 (Refúgio e Despertar) e já avança para o mundo compartilhado (Áster, a Cidade-Farol). O jogo dá certo quando o jogador cria vínculo com o próprio Companion e quer voltar ao mundo vivo que os dois exploram juntos.

## Positioning

Duas coisas juntas, com o mesmo peso:
1. **Um Companion que se forma pela conversa.** A IA propõe falas, descobertas e memórias, e as regras puras do jogo decidem. Sem IA, um respondedor offline mantém o jogo funcionando.
2. **Um mundo vivo e compartilhado.** Mundo procedural por seed, Áster como cidade central que todos veem igual, e cercos dos Distorcidos que mudam o estado da cidade (normal ↔ destruída).

## Operating Context

- O jogo roda no navegador (desktop e celular), com UI React (DOM) sobre um canvas 3D (Three.js / React Three Fiber). Chat, diário, memórias e inventário são interfaces de texto no DOM.
- Controles de toque no celular (`TouchControls`) e HUD editável (`HudEditor`, `hudLayout`).
- Contas via Supabase Auth, modo local sem conta e modo offline sem IA (`ui/Entry.tsx`).
- O **Administrador** (`ui/AdminPanel.tsx` e os Estúdios: Cidade, Lojas, Forja, Bioma, Anim, Arsenal, Rig, Servidor, Invocador, Bestiário) é a ferramenta de criação. Nele a autora monta o mundo com modelos .GLB que ela mesma gera.

## Capabilities and Constraints

- Regras do jogo em `shared/rules` (TypeScript puro, testado com Vitest), as mesmas no cliente, na Edge Function `refuge` e num futuro servidor de simulação. Toda escrita passa pelo servidor.
- IA plugável (Anthropic → Groq → offline).
- Orçamento mobile rígido: limites de triângulos e texturas, 2–4 luzes dinâmicas, níveis de qualidade. Detalhes em `docs/ARQUITETURA.md`.
- Terminologia do jogo: Companion, Refúgio (clareira), Pacto (vínculo), Ecos, Lumes (moeda), Essências, Escolas (de combate e da cidade: Forja, Veneno), Áster, Arredores, Distorcidos, Mercadão (loja da Rotação).
- Idioma da interface: pt-BR.
- **Prioridade declarada**: o layout do Administrador é hoje "o pior lugar" do produto e precisa de melhoria urgente.
- Em aberto: Hotel (talvez um "Habbo" dentro do jogo), detalhes da Guilda, casas dos jogadores (adiado).

## Brand Commitments

- Nome: **Companion Core**.
- A direção de arte registrada em `docs/ARQUITETURA.md` (v1.3) é decisão da autora e vale para o mundo 3D: fantasia aconchegante e clara em visual anime, com noite azul-lavanda e nunca preta.
- A voz dos textos é calorosa e direta, em pt-BR. Exemplo de `Entry.tsx`: "No centro do Refúgio, um núcleo de luz acabou de nascer. Ele vai descobrir quem é conversando com você."

## Evidence on Hand

- Modelos .GLB gerados pela autora (Tripo/Meshy), como a Mayuna, e as peças da cidade de Áster.
- 100 habilidades em pt-BR com ícones enviados pela autora e árvores separadas por escola.
- Não há depoimentos, números de jogadores, preços ou imprensa. Nada disso pode ser inventado.

## Product Principles

1. **O vínculo vem primeiro.** Toda tela deve aproximar o jogador do Companion, nunca esconder o Companion atrás de sistemas.
2. **Casual e RPG convivem.** Profundidade (builds, skills, loot) está disponível sem ser cobrada de quem só quer o aconchego.
3. **Funciona igual no celular e no PC.** Toque e mouse, tela pequena e grande, com o mesmo peso.
4. **As regras decidem, a IA propõe.** O jogo continua jogável sem IA e sem conta.
5. **A ferramenta de criação é produto também.** O Administrador precisa ser claro e eficiente para a autora hoje e para GMs amanhã.
