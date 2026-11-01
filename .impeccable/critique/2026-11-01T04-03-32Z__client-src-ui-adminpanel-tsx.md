---
target: Administrador (AdminPanel + estúdios)
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\Cibele Santana\\Documents\\mayuna\\companion-core-git\\companion-core\\client\\src\\ui\\AdminPanel.tsx"
target_fingerprint: "sha256:a01cf9f68c0a015b09927253c329477cc4a6805b9d420b998409bb9fab407390"
target_path: "C:\\Users\\Cibele Santana\\Documents\\mayuna\\companion-core-git\\companion-core\\client\\src\\ui\\AdminPanel.tsx"
timestamp: 2026-11-01T04-03-32Z
slug: client-src-ui-adminpanel-tsx
---
Method: dual-agent (A: design review · B: detector + browser)

# Crítica — O Administrador (client/src/ui/AdminPanel.tsx + estúdios)

## Nota de saúde: 19/40 (Ruim)
| # | Critério | Nota | Problema principal |
|---|---|---|---|
| 1 | Visibilidade do estado | 2 | Servidor sem aviso de alteração; mensagem longe do botão (ServerStudio.tsx:113); Lojas mostram padrão antes de carregar (ShopStudio.tsx:19) |
| 2 | Linguagem do mundo real | 3 | Biblioteca de VFX da Forja em inglês |
| 3 | Controle e liberdade | 2 | Trocar aba perde edições sem aviso (AdminPanel.tsx:297); ficha sem Esc |
| 4 | Consistência | 1 | 4 nomes p/ despublicar; apagar link vs botão; 3 padrões de salvar; 2× Atualizar |
| 5 | Prevenção de erros | 1 | Despublicar sem confirmação; apagar ao lado de Salvar (ArsenalStudio.tsx:216-218); XP global sem diff; selects da Fábrica gravam na hora (AdminPanel.tsx:248, :372) |
| 6 | Reconhecer vs lembrar | 2 | Companions homônimos sem ID; Forja 135 itens sem busca |
| 7 | Eficiência | 1 | Sem Ctrl+S, busca global, edição em massa (só Cidade tem atalhos) |
| 8 | Estética/minimalismo | 2 | Fábrica: 4 prompts + JSON aberto (AdminPanel.tsx:223); 100 botões de VFX |
| 9 | Recuperação de erros | 2 | Mensagens específicas; apagar sem restauração |
| 10 | Ajuda | 3 | Dicas ricas, mas longas e em itálico 11–12px |

## Especificidade
Parcialmente autoral: moldura com identidade (serifa dourada, noite, voz pt-BR), Cidade e prévias 3D próprias. Mas 6 estruturas de layout diferentes; classes de Biomas reaproveitadas em ShopStudio.tsx:82/103 e ServerStudio.tsx:65 → "nove protótipos com a mesma paleta".
Detector: CLI 0 achados (regex em .tsx — subcontagem). Navegador: 14 achados em 5 abas — low-contrast ×11 (7 placeholders #757575 a 4,1:1; Invocador "Nova criatura" 2,4:1; Servidor Testar/Ver modelos 4,3:1; rótulos cs-group 4,2:1), tiny-text (xp-curve 10,9px), flat-type-hierarchy (Lojas), straggler, ai-color-palette (falso positivo: cor do Companion vinda de dados, AdminCompanions.tsx:69/98).

## Pontos fortes
1. Voz e dicas que explicam consequência. 2. Estúdio da Cidade (W/E/R, snap, undo/redo, outliner, guarda de teclado CityStudio.tsx:224). 3. Dirty tracking intra-estúdio, barras fixas, :focus-visible dourado, contraste de texto ~9:1.

## Problemas prioritários
1. [P1] Sem moldura comum — StudioShell (lista c/ busca + editor em seções + rodapé fixo; Publicar/Despublicar/Apagar). → layout, polish
2. [P1] Perda de dados e risco ao vivo — guarda de navegação + beforeunload; confirmação c/ resumo; diff no Servidor; selects da Fábrica em estágio. → harden
3. [P1] Barra lateral quebrada em Biomas/Arsenal (.biome-list 396 vs 280px; botão Criar escondido; títulos cortados; vaza no mobile). → adapt
4. [P2] Listas/formulários não escalam — busca, Lojas como tabela, ID nos Companions, Fábrica em passos. → distill
5. [P2] 9 abas planas; cabeçalho 241px no mobile; Forja 9478px; alvos <32px — agrupar Mundo/Catálogo/Companions/Servidor. → layout, adapt

## Personas
Usuária avançada: sem Ctrl+S, busca, massa; troca de aba perde trabalho; "Biblioteca (0)" errado (CityStudio.tsx:337).
Teclado/leitor: Cidade só mouse; botão sem nome em Animações; poucas mensagens com role=status; dicas 12px itálico.
GM futuro: jargão técnico na Fábrica; chave de API/expoentes no Servidor; "+ itens de exemplo novos" no topo do Arsenal; nada separa seguro de só-autora.

## Observações menores
Mercadão "0 itens · 4 por dia"; emojis no menu; ações minúsculas tipo link; Servidor com 1 área de mensagem p/ 3 salvamentos; prévias 3D claras dominam a tela.

## Perguntas
1. Modo Autora vs modo GM? 2. Abrir numa caixa de pendências? 3. Tudo via rascunho → revisão → publicar com diff?
