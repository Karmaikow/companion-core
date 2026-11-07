# Como rentabilizar o Companion Core

Plano honesto, em etapas, para quem **não tem renda** e quer que o jogo se pague (e um dia renda). Valores de
mercado e leis mudam: tudo marcado com ⚠ deve ser **conferido** antes de agir (e, para impostos, com um contador).

## 0. Antes de cobrar qualquer coisa: licenças dos ativos ⚠
Cobrar por um jogo exige poder provar que os ativos podem ser usados comercialmente. Conferir **um por um**:
- **Pacote de natureza (Quaternius Stylized Nature MegaKit):** CC0, uso livre. ✅
- **Pacote de armas (24 modelos GLB):** a origem e a licença **ainda não foram confirmadas** (anotado na memória). Pendente.
- **Modelos gerados no Tripo** (salgueiro, runas, líquen, remanso, nascente, árvore): depende do **plano** da conta
  na hora da geração. Planos gratuitos costumam publicar o modelo com licença aberta e limitar uso comercial.
- **Animações e rigs (Mesh2Motion, etc.), imagens geradas por IA, bibliotecas de efeitos (`vendor/threejs-vfx`):**
  ler a licença de cada uma.
- **Layout dos menus:** foi **inspirado** em outro jogo; nunca copiar arte, nomes ou ícones dele.

Faça uma planilha (arquivo → origem → licença → pode vender?) e mantenha em `docs/`.

## 1. Princípios
- **Nada de pay-to-win.** O jogo é cooperativo (a guerra é de todos): vender poder estraga a comunidade.
- **Cosmético e conveniência leve.** Aparência, títulos, decoração, apoio.
- **Sem caixas de sorteio pagas** ("loot boxes"): além de impopular, a lei brasileira recente (ECA Digital) restringe
  para menores ⚠.
- **Custo no zero enquanto der**, para não depender de renda.

## 2. Etapas

### Etapa 0 — Agora: custo zero e comunidade
- Servidor e arquivos nos planos grátis (Supabase com chamadas reduzidas; modelos pesados no Vercel/R2; PWA).
- Criar o **Discord** e um **devlog** (vídeos curtos de 30–60 s no YouTube/TikTok/Instagram mostrando o jogo).
  Quem ainda não conhece o jogo não compra nada: o primeiro objetivo é **jogadores**.
- Um **formulário de interesse** para avisar quando abrir testes.

### Etapa 1 — Apoio voluntário (a partir de ~50 jogadores)
- **Apoia.se**, **Catarse** ou **Ko-fi** (aceitam Pix). Metas claras: "R$ 150/mês paga o servidor".
- Recompensas **cosméticas**: nome no **Muro dos Apoiadores** em Áster, título "Apoiador", cargo no Discord, acesso
  antecipado a testes.
- Transparência: mostrar quanto custa o servidor e quanto já foi arrecadado.

### Etapa 2 — Loja de cosméticos (a partir de ~300 jogadores ativos)
- **Aparência:** cores e brilhos do Companion, auras, asas, trajes, efeitos coloridos de habilidade.
- **Pets e companheiros leves**, molduras de título, **decoração de casa** (quando as casas dos jogadores existirem).
- **Passe de temporada** *cosmético* (trilhas de recompensas ligadas a metas do jogo, incluindo a guerra).
- Pagamento por **Pix** e cartão (Mercado Pago, Asaas ou Stripe); moeda própria **separada** de Lumes e do Cristal Ápice
  para não confundir.
- ⚠ Para cobrar de forma contínua, formalizar (ver seção 4).

### Etapa 3 — Lojas de aplicativos e Steam (quando houver estabilidade)
- **Google Play:** taxa única (~US$ 25) e comissão sobre vendas dentro do app. **Apple:** assinatura anual (~US$ 99).
- **Steam:** taxa por jogo (~US$ 100, recuperável com vendas). Empacotar com Tauri/Electron.
- Cada loja fica com 15–30%: só vale quando a base de jogadores já justifica.

### Outras fontes
- **Editais e fomento a jogos** (nacionais e estaduais, por exemplo Ancine/FSA e programas de cultura): pesquisar
  prazos; costumam premiar projetos com protótipo jogável. ⚠
- **Parcerias:** criadores de conteúdo que mostram o jogo; troca de divulgação por itens cosméticos.
- **Anúncios com recompensa** (opcional, só no celular): geram pouco e incomodam. Deixar para o final, se for o caso.

## 3. Ordem de grandeza (para não se iludir)
Em jogos grátis, só **2–5%** dos jogadores pagam alguma coisa. Exemplo: com **1.000 jogadores ativos**, 30 pagantes ×
R$ 15 ≈ **R$ 450/mês**: **cobre o servidor, não um salário**. Rentabilizar de verdade leva **milhares de jogadores** e
tempo. O objetivo realista dos próximos meses é **o jogo se pagar sozinho**.

## 4. Custos e formalização ⚠
- **Supabase Pro** (~US$ 25/mês) só quando o plano grátis não bastar. Cloudflare R2 como alternativa para arquivos.
- **Hospedagem do site:** o plano grátis do Vercel (Hobby) é para uso **não comercial**. Ao começar a cobrar, trocar
  para um plano que permita uso comercial (o Vercel Pro custa ~US$ 20/mês) **ou** para o Cloudflare Pages.
- **Domínio próprio:** ~R$ 40/ano.
- **MEI** (limite de faturamento anual, confirmar o valor atual) permite emitir nota e receber como pessoa jurídica;
  procurar a atividade de desenvolvimento de jogos eletrônicos. Conversar com um contador antes de vender.
- Conta bancária separada para o jogo.

## 5. Linha do tempo sugerida
| Quando | O que |
|---|---|
| Agora | Custo zero, Discord, devlog, **checar licenças** |
| Depois do reset | Modelos no Vercel, PWA, guerra de Áster (conteúdo que dá o que mostrar) |
| ~50 jogadores | Apoio voluntário (Etapa 1) |
| ~300 jogadores | Loja de cosméticos e MEI (Etapa 2) |
| Estável | Steam / Google Play (Etapa 3) e editais |

## 6. O que evitar
- Vender poder, itens de combate ou vantagem na guerra.
- Caixas de sorteio pagas.
- Cobrar antes de ter jogadores e antes de resolver as licenças.
- Prometer o que o jogo ainda não tem.
