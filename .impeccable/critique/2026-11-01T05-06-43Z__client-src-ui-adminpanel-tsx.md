---
target: Administrador (AdminPanel + estúdios)
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:C:\\Users\\Cibele Santana\\Documents\\mayuna\\companion-core-git\\companion-core\\client\\src\\ui\\AdminPanel.tsx"
target_fingerprint: "sha256:f2a166d4853558ee79146cf5a279bcf51da0a6a693b3960898534e48d60d7488"
target_path: "C:\\Users\\Cibele Santana\\Documents\\mayuna\\companion-core-git\\companion-core\\client\\src\\ui\\AdminPanel.tsx"
timestamp: 2026-11-01T05-06-43Z
slug: client-src-ui-adminpanel-tsx
---
Method: dual-agent (A: design review · B: detector + browser)

# Crítica 2 — O Administrador (após a refatoração "Oficina do mundo", commit d836be5)

## Nota: 24/40 (Aceitável) — antes 19/40
| # | Critério | Nota | Problema principal |
|---|---|---|---|
| 1 | Visibilidade do estado | 3 | "Salvar IA" sempre ativo, sem dirty (AiSettings.tsx:125) |
| 2 | Linguagem do mundo real | 3 | jargão para GM: rig, Mesh2Motion, contrato JSON, Tripo |
| 3 | Controle e liberdade | 2 | sem desfazer/histórico após salvar ou publicar |
| 4 | Consistência | 2 | só 4 estúdios usam StudioActions; Cidade, Lojas, Servidor, Animações, Fábrica fogem |
| 5 | Prevenção de erros | 2 | "Salvar IA" sem confirmação; Despublicar da Cidade colado a Publicar |
| 6 | Reconhecer vs lembrar | 2 | aba Servidor escondida a 1366px; "Nome" da Forja a ~1768px |
| 7 | Eficiência | 3 | Ctrl+S, busca, Esc; falta próximo/anterior item |
| 8 | Estética/minimalismo | 2 | Forja 293 controles; VFX aberto |
| 9 | Recuperação de erros | 2 | mensagens em 4 lugares; sem próximo passo |
| 10 | Ajuda | 3 | subtítulos e estados vazios bons |

## Especificidade
Autoral: "Oficina do mundo" clara no shell e no rodapé. Cobertura parcial (4 de 9 abas).
Detector: CLI 0. Navegador: nested-cards (Cidade fieldsets ×6, Invocador model-box/stats/tree-rows, Servidor xp-curve), first-viewport-column-overflow (Servidor 145% vs 56%), radial-halo (admin.css:27), flat-type-hierarchy (Lojas), straggler; falsos positivos: ai-color-palette (cor da Lunaya), repeating-stripes (styles.css do jogo).

## Corrigido após a avaliação
[P0] celular: .admin .studio/.biome-studio vencia o colapso de styles.css → editor 25px. Corrigido em 7c029a8 (coluna única ≤860px), verificado a 375px.

## Pontos fortes
StudioActions; proteção contra perda de trabalho + diff do XP; voz e detalhes de ofício.

## Problemas prioritários
1. [P1] Servidor escondido no menu a 1366px → layout
2. [P1] 5 estúdios fora do rodapé padrão; Salvar IA sem dirty/confirm → harden, polish
3. [P1] editores longos, identidade enterrada (Forja, Invocador, Fábrica) → distill, layout
4. [P2] window.confirm nativo e mensagens dispersas → clarify, harden

## Personas
Avançada: rola até o Nome, sem próximo item, Servidor some, botões de seed. Teclado/leitor: 13 inputs sem rótulo no Biomas, .cs-seg sem aria-pressed, .st-tabs sem role=tab, dirty sem live region. GM: jargão, "Aplicar o pacote padrão" primário, sem auditoria.

## Menores
Nomes de status variados; emojis em Lojas/Arsenal/Cidade; ficha não rola até o detalhe; Testar/Ver modelos sem estilo.

## Perguntas
1. Tela "Mudanças pendentes no mundo"? 2. Fábrica como caixa de entrada? 3. Quais abas um GM vê?
