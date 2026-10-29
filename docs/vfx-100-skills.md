# Pacote de 100 habilidades em português

Fonte versionada: data/skills/vfx-100.pt-BR.json. Cada uma das 100 entradas do catálogo VFX tem uma habilidade independente, com slug estável `vfx-<id original>`, nome e descrição em português. São 68 habilidades de essência e 32 de escolas. As 30 habilidades publicadas existentes não são alteradas.

Todas as novas entradas são criadas como rascunho, visíveis/editáveis na Forja administrativa. A árvore atual seleciona somente duas técnicas de essência; publicar o pacote indiscriminadamente pode alterar a seleção automática ou expor técnicas de escola neutras. O pacote não modifica árvores, kits, loadouts nem a disponibilidade das escolas.

## Balanceamento inicial

Cinco graus, com vínculo mínimo 2, 4, 7, 10 e 14. Grau 5 ocupa o slot supremo. Escala inicial de dano 38–105 antes de ajustes de área/papel; ataques pesados ganham dano, custo, preparação e recarga. Áreas causam menos dano por alvo e custam mais. Controles sacrificam dano, e atordoamentos ficam limitados a 1,5 s. Cura é aplicada ao próprio conjurador. Dano total por queimadura/veneno depende da implementação atual do combate (15% do dano por pulso, com mínimo de 2), além do dano inicial.

O manifesto learningPlan registra escola, grau e papel para a futura aquisição. Não é requisito já aplicado pelo servidor; somente campos existentes de SkillDef são persistidos em skills.data. A descrição identifica a escola e o grau e permanece após editar/salvar na Forja.

## Limites reais

- Dano, cura própria, queimadura e veneno são suportados pelo combate atual.
- Atordoamento, enraizamento, lentidão e ofuscamento foram CONFIGURADOS para as técnicas, mas sua aplicação no mundo ainda precisa de integração. Não estão implementados por este pacote de dados.
- Não há roubo de vida, invulnerabilidade, invocação de unidades, dispel, rebobinamento real, destruição de terreno nem ricochete/encadeamento por alvo. Os efeitos correspondentes são adaptações visuais com dano em linha/área ou recuperação própria.
- Efeitos de enxames continuam usando a paleta original do shader. A afinidade Veneno e as condições de envenenamento estão configuradas; a recoloração integral roxa está pendente.
- Nomes do seletor de efeitos upstream permanecem em inglês; os 100 registros de habilidades da Forja têm nomes portugueses.

## Importação

Importar somente `rows` em public.skills usando INSERT com conflito ignorado por slug, nunca upsert que sobrescreva alterações do administrador. Conferir 100 slugs, 100 IDs visuais únicos e status draft. A importação é uma operação de dados, não uma migração de esquema. A fonte pode recriar os rascunhos em outro ambiente; learningPlan fica reservado à integração futura das escolas.
