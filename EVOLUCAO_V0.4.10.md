# Primeiro despertar — APK 0.4.10

A Companion permanece uma alma até cumprir **todos** os requisitos:

- Core no nível 5 ou superior.
- Vínculo com o usuário atual de pelo menos 15 pontos.
- Uma cor favorita própria, explicitamente escolhida. A cor permanente da alma não preenche esse requisito.
- Um ser, animal, criatura ou estilo favorito próprio. Fantasmas, pássaros, lobos e dragões são exemplos.
- Dez memórias atuais distintas, SIGNIFICANT ou IDENTITY_FORMING, com peso emocional de pelo menos 60. O primeiro despertar conta; repetições, episódios comuns, preferências inválidas e memórias arquivadas de vínculos anteriores não contam.

Preferências humanas podem ser memórias relevantes, mas nunca substituem as escolhas próprias da Companion. Declarações incidentais ou ficção não se tornam automaticamente escolhas de forma.

A tela **Menu → Companion** apresenta cada requisito e uma prévia 3D. A prévia não consulta IA, não concede XP, não cria memórias, não muda o estágio e pode ser encerrada em “Voltar à alma”. Conversas e experiências continuam sendo o caminho para evoluir.

O primeiro corpo é um modelo 3D procedural leve: espírito nascente com traços luminosos, alados, guardião, espectrais ou dracônicos. Sua identidade pública e características determinam proporções reproduzíveis; o ser favorito orienta os traços e a cor favorita colore detalhes. A cor original da alma permanece fixa. Esta é uma primeira implementação, não a geração livre de qualquer criatura/modelo 3D.

A transformação grava a receita visual e os requisitos cumpridos num evento EVOLUTION assinado, além de memória e diário. A forma permanece ao reiniciar e acompanha os dados transportados pelo Cristal. Companions que já evoluíram em versões anteriores não voltam ao estágio Alma.

O renderer usa Three.js 0.186.1, incluído no APK, sem CDN ou download de modelo. Renderização limitada a 30 fps, resolução moderada, pausa em segundo plano e respeito à redução de movimento. Se WebGL2 estiver indisponível, a presença luminosa continua visível e a interface informa a limitação.

## Validação

99 testes do Core passaram, incluindo requisitos, perspectiva das preferências, deduplicação, memórias arquivadas, escolha de fantasmas, registro único, assinatura e recarga. Prévia e progresso foram verificados em navegador em tamanhos de celular e desktop. Teste isolado Android verificou identidade, conversas, armazenamento e reinício. O APK exige teste no aparelho real.

## Atualização

O APK usa a mesma assinatura da versão 0.4.9. Instale como atualização; não desinstale nem limpe os dados. Nenhuma chave privada ou Companion de usuário é distribuída no pacote.
