# Autorig humanoide e animações

O editor Mesh2Motion encaixa o esqueleto e retorna um GLB com pele e ossos. Para Companions, esse arquivo não traz o pacote humano de animações.

Ao concluir o autorig, a Fábrica agora:
1. Abre o GLB riggado e converte o pacote padrão para esse esqueleto.
2. Confere os clipes obrigatórios e verifica movimento ligado à malha em andar/correr.
3. Envia o modelo e o pacote de animações antes de publicar a atualização.
4. Atualiza os 20 papéis em companion_skill_anims, preservando as outras escolhas.
5. Publica o modelo e o pacote na mesma atualização do visual_job, retirando o pacote padrão anterior da lista.

As escolhas e o visual_job ficam em tabelas separadas: as duas gravações não são uma transação única. Se a publicação falhar, a Fábrica tenta restaurar as escolhas anteriores e informa se essa restauração também falhar. Arquivos enviados antes de uma falha podem permanecer no Storage sem publicação; não são apagados automaticamente.

## Recuperar modelos já riggados

Na ficha do Companion na Fábrica, use **Gerar animações deste rig**. O botão reutiliza o GLB atual sem encaixar os ossos novamente, gera o pacote e substitui as referências padrão antigas. Reabra o jogo para recarregar os arquivos. Faça a revisão visual em Animações; poses e pesos de pele ainda podem precisar de ajuste artístico.

O botão **refazer o rig automático** continua disponível para problemas no encaixe dos ossos. Monstros mantêm as animações do próprio molde.

O cache do retargeter na aba Animações é invalidado quando o arquivo do modelo ou do pacote muda, mesmo mantendo o mesmo Companion.

## Validação

Testes cobrem clipes obrigatórios, movimento em ossos que influenciam vértices, pesos vazios, trilhas sem vínculo, movimento apenas horizontal removido pelo jogo e isolamento das cópias de clipes. Não substituem a inspeção visual dos GLBs privados nem um teste autenticado de upload.
