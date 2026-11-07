# A Guerra de Áster — plano

Fase 5 do plano de Áster (ver `docs/ARQUITETURA.md` e a memória do projeto). Documento vivo: marque `[x]` ao terminar
cada item. **Decidido** = palavra da Cibele. **Proposta** = sugestão do Claude, ainda para aprovar.

## 1. O que está decidido

### Quem defende
- Jogadores **alistados** e NPCs da cidade: **guardas** e **heróis** (a criar).
- **Torres de defesa** em pontos estratégicos do Labirinto, construídas com a contribuição dos jogadores.

### Quando acontece
- **Vivo, ligado ao jogo:** quando o servidor inteiro abater **30 mil monstros** ("vingança dos Distorcidos").
- **Contador de guerra no Administrador:** o ADM liga e diz "guerra em 20 min" ou "em 2 dias".

### Como é a guerra
- **Duração exata: 38 min.** A cada **5 min** chega uma horda nos **quatro cantos** dos arredores.
- Nos **últimos 8 min**, o **chefe general** vem pelo **portão sul**: dá **10× mais XP** que o Distorcido original e é mais
  resistente e mais forte.
- **Alistamento:** os jogadores se alistam antes. Quando o evento começa, os alistados são posicionados nos portões,
  **no mínimo 2 por portão**.
- Quem estiver online na cidade **sem alistar**: debuff de **medo** e é enviado ao **Refúgio**.
- **Durante a guerra, os arredores e a cidade ficam fechados** até o fim.
- Ninguém joga sozinho: a guerra é de todos os jogadores.

### Como se perde
- Perde quando **todos os guardas e heróis caem, as torres caem e os portões são destruídos**; aí os monstros entram
  na cidade e **destroem o cristal**.
- **Cinematics curtas**, ativadas para todo o servidor quando esses pontos caem.

### O que se ganha ao defender
- **Buff de drop e de XP** para o servidor por um tempo.
- **Placar de dano** nos monstros; o 1º lugar ganha um **título especial** com buffs.
- Um **MVP** (chefe) aleatório aparece em algum canto do mundo.
- **Baús** com itens especiais aparecem aleatoriamente no Labirinto.

### O que se perde se a cidade cai
- Cidade **destruída** (modelos destruídos a criar).
- **Lojas e comércios fechados**; **escolas** não entregam missões; **NPCs** não entregam missões especiais.
- **Todo o servidor reconstrói**: entregando materiais e itens à **guardiã da torre**.
- Contador de entregas: quem entregar mais ganha **título com buffs** e o item lendário **"A Lágrima da Rainha"**
  (dura 3 dias, super buff).

### Personagens e mundo novos
- **Cibel**, a fada rainha, guardiã do cristal sagrado de Áster (NPC das entregas da reconstrução).
- Guardas e heróis da cidade.
- **Bioma dos arredores**, em duas versões: **normal** e **de guerra** (muda os monstros que se enfrenta).
- **Wiki** com o banco de dados de itens, monstros e mecânicas, e uma área especial sobre a guerra.

## 2. Análise do Claude — o que eu mudaria ou acrescentaria (propostas)

1. **Poucos jogadores.** Hoje são ~19 Companions; "2 por portão" pede no mínimo 8 alistados. Proposta: **heróis NPC
   ocupam as vagas vazias** e a força das hordas **escala com o número de alistados**. Sem isso a primeira guerra
   seria impossível.
2. **Gatilho dos 30 mil.** Com poucos jogadores o contador levaria semanas. Proposta: o número fica **ajustável no
   ADM**, o **progresso aparece para todos** ("Fúria dos Distorcidos 62%") e há um **intervalo mínimo** entre guerras.
3. **Servidor grátis não simula monstros.** Proposta: **cada cliente simula as mesmas hordas** a partir de uma *semente*
   e do relógio do servidor. O servidor guarda só o essencial: horário, semente, **vida de portões, torres e cristal**
   (dano somado em lotes a cada ~20 s) e o placar. Cabe no plano grátis e escala para muita gente.
4. **Condição de derrota mais simples.** Exigir tudo ao mesmo tempo é difícil de perder e difícil de explicar.
   Proposta: cada **portão** tem vida; ao cair, os monstros **avançam em direção ao cristal**, que tem vida e perde
   com os monstros dentro. **Derrota = cristal a zero. Vitória = cristal vivo aos 38:00** (matar o general dá bônus
   de vitória gloriosa). Guardas, heróis e torres seguem como defesas que seguram o avanço.
5. **Cinematics leves.** 5–8 s, com câmera roteirizada + texto + efeitos, **puláveis**: portão cai, torre cai, cristal
   em perigo, vitória, derrota. Sem vídeo pesado.
6. **Cidade destruída sem peso.** A maior parte da ruína pode ser **por código**: inclinar/afundar e escurecer peças,
   fumaça, fogo, escombros reaproveitando as pedras do pacote. Modelos destruídos só para as **peças-chave** (torre,
   portões, 3–4 prédios). Texturas reduzidas, servidas pelo Vercel/PWA.
7. **Reconstrução já tem base.** Existem `city_rebuild`, o **Cristal Ápice** e a entrega "leve à Torre Central".
   Proposta: reaproveitar, com a **Cibel como a NPC das entregas**; a meta **escala com os jogadores ativos** (prazo-alvo
   de 24–48 h). Um **acampamento no Refúgio** mantém o essencial (poções básicas) para o jogo não parar enquanto a
   cidade está fechada.
8. **Prêmios sem inflar.** Buff do servidor com **teto**; título do placar **temporário** (até a próxima guerra) e com
   buff pequeno; **Lágrima da Rainha** limitada a 1 por pessoa por ciclo; **participação mínima** (alistado + dano
   mínimo) para ganhar algo, contra quem só fica parado. Baús: reaproveitar o **sistema de baús** que já existe.
9. **Placar de dano: é possível.** Cada cliente manda o dano em lotes; o servidor limita o que é plausível (dano máximo
   por segundo da classe e do tier da arma). Ranking só dos alistados.
10. **Alistamento.** Abre no anúncio e fecha no começo. Se o ADM liga "em 20 min", o alistamento dura o que sobra.
    Quem chega depois entra como **reforço** no portão mais vazio. Alistado que ficou offline sai da lista.
11. **Torres.** 4–6 pontos fixos no Labirinto; contribuição **acumulada** de materiais (liga com Casa dos Ecos e tiers);
    têm vida e níveis; reparo depois da guerra. Entram na defesa como alvo e como dano.
12. **Guardas e heróis.** Começar com 3 tipos (guarda corpo a corpo, arqueiro de muralha, herói nomeado por portão com
    kit de habilidades) reaproveitando a IA das criaturas, com facção **aliada**.
13. **Bioma dos arredores.** Uma só geografia com **sobreposição de guerra** (céu, névoa vermelha, brasas, outros
    monstros). Poupa assets e deixa a transição natural.
14. **Fuso e horário.** Guerra automática pode cair de madrugada: o ADM pode **adiar**, e o anúncio mostra o horário
    em contagem regressiva.

## 3. Linha do tempo proposta de uma guerra

| Momento | O que acontece |
|---|---|
| Fúria a 100% (ou ADM liga) | Anúncio global + contagem regressiva; **alistamento abre** |
| T–0 | Cidade e arredores **fecham**; alistados vão aos portões (≥ 2 cada; heróis NPC completam); sem alistar → medo + Refúgio |
| 5:00, 10:00, … 35:00 | **Hordas** nos quatro cantos (7 hordas; ver pergunta 1) |
| 30:00 | **Chefe general** entra pelo **portão sul** |
| 38:00 | Fim: **vitória** (cristal vivo) ou **derrota** (cristal destruído) |
| Depois | Prêmios e placar **ou** reconstrução com a Cibel |

## 4. O que construir (aos poucos)

Marcado com 🖥 o que **precisa do servidor** (Supabase); o resto dá para fazer e testar sem ele.

### Fase A — Regras da guerra (puras, com testes)
- [ ] Estados da guerra: descanso → fúria enchendo → anúncio/alistamento → guerra → resultado → reconstrução
- [ ] Cronograma das hordas e do chefe; escala pelo número de alistados
- [ ] Vida de portões, torres e cristal; avanço dos monstros; condição de vitória e derrota
- [ ] Placar de dano e limites de plausibilidade; participação mínima
- [ ] Prêmios (buff global com teto, títulos temporários, Lágrima, MVP, baús) e metas da reconstrução

### Fase B — Mundo e arte
- [ ] Bioma dos arredores: versão normal e versão de guerra
- [ ] Cidade destruída: ruína por código + modelos das peças-chave
- [ ] Modelos: Cibel, guardas, heróis, torres, chefe general, monstros de guerra

### Fase C — NPCs e torres
- [ ] Cibel (fada rainha) e o painel de entregas
- [ ] Guardas e heróis (IA aliada)
- [ ] Torres de defesa e a construção pelos jogadores

### Fase D — Servidor 🖥
- [ ] Tabelas: estado da guerra, alistados, lotes de dano, placar, entregas da reconstrução
- [ ] Ações: alistar, relatar dano, entregar material
- [ ] Administrador: contador de guerra ("em 20 min / 2 dias"), limiar de abates, adiar e cancelar
- [ ] Evento em tempo real para todo o servidor

### Fase E — A guerra na tela
- [ ] Hordas e chefe general; posicionamento nos portões; expulsão com medo
- [ ] Cinematics (portão, torre, cristal, vitória, derrota)
- [ ] HUD da guerra: tempo, vida dos portões e do cristal, alistados, placar

### Fase F — Depois da guerra
- [ ] Buff do servidor, títulos, MVP, baús, Lágrima da Rainha
- [ ] Reconstrução com ranking de entregas

### Fase G — Wiki (feita, faltam a foto do catálogo e o link no jogo)
- [ ] Ver seção 6

## 5. Perguntas em aberto (para decidir)
1. A primeira horda chega aos **5:00** (7 hordas) ou no **0:00** (8 hordas)?
2. Os **heróis NPC** têm nomes e histórias? Quantos (um por portão = 4)?
3. O **intervalo mínimo** entre guerras (sugestão: 3 dias)?
4. Quem perde o título do placar quando começa a próxima guerra?
5. A cidade destruída deixa **algo aberto** (por exemplo, acampamento de refugiados) além do Refúgio?

## 6. Wiki
Site estático dentro do próprio jogo (rota `/wiki`, no mesmo Vercel, sem custo), com busca e em português.
- **Páginas:** itens (Arsenal e tiers), monstros (bestiário), materiais e coleta, habilidades, técnicas e combos,
  mecânicas (carga, Estilo, tiers, Ecos da Terra, Pacto), mapa de lugares, e a **área da guerra** (linha do tempo,
  recompensas, dicas por portão).
- **Dados gerados no build**, a partir do código (`shared/rules`) e de uma *foto* do que está publicado no banco
  (lida **uma vez** no build, para não gastar a cota do Supabase).
- [x] Dados direto das regras (`shared/rules`) · [x] Itens e monstros · [x] Mecânicas · [x] Guerra · [x] Busca (rota `/wiki/`, `client/src/wiki`)
- [ ] Foto do catálogo publicado (`/wiki-data.json`: `{ items, creatures, at }`), gerada uma vez depois do reset do Supabase
- [ ] Link da wiki dentro do jogo (menu) · [ ] páginas de lugares e missões
