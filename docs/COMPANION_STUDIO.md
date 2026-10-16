# Companion Studio

Studio independente: https://companion-studio.diegozxcvbnm.chatgpt.site

O acesso está nos menus desktop e mobile do Companion Core. Administração autorizada no servidor pela tabela studio_admins do Supabase.

Os arquivos ficam no bucket privado companion-studio e as fichas em studio_assets. Rascunhos são restritos ao ADM. Usuários autenticados podem ler apenas assets publicados e seus arquivos. Para consumir no jogo, consultar GET /rest/v1/studio_assets?status=eq.published usando a conta Supabase e baixar /storage/v1/object/authenticated/companion-studio/{object_path}. Nunca persistir JWT em manifestos.

Categorias: companion, refuge, npc, monster, equipment, skill, effect, world.
Metadata: palette, identity, atlas (columns, rows, frames, fps, directions, animation, frameWidth, frameHeight), skill (element, cooldown, skillId, kind, color, duration).

Esta versão inclui upload manual, prompts padronizados, prévia de sprites, gerador procedural VFX e publicação no catálogo. Geração de ilustrações por IA, fila automática, evolução de refúgios e consumo pelo renderer ainda não implementados. Identidade, memórias e progressão permanecem no Core.
