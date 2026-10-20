# Companion Core

ARPG autônomo / MMORPG procedural com Companions controlados por agentes de IA (GDD v0.2).
Este repositório implementa o **MVP 1 — Refúgio e Despertar**.

```bash
npm install
npm test            # regras do jogo (Vitest)
npm run dev         # cliente em http://localhost:5173 — use "Jogar no modo local" sem servidor
npm run build       # gera dist/ para a Vercel
npm run sync:rules  # copia shared/rules para a Edge Function antes do deploy
```

Arquitetura e decisões: [docs/ARQUITETURA.md](docs/ARQUITETURA.md).
