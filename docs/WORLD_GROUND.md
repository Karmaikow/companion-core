# Textura do chão procedural

O WorldStage gera uma textura difusa de 128 × 128 por chunk, combinando grama, terra e rocha com ruído contínuo em coordenadas globais. As cores dos biomas são interpoladas entre os centros dos chunks. A mesma receita e seed reproduzem a textura sem chamadas pagas ou arquivos externos.

A distribuição de objetos, as colisões e a posição salva não mudam. O terreno continua plano; esta alteração não adiciona relevo, caminhos autorais, importação de texturas ou controles novos no Studio. A cor do bioma existente influencia a camada de grama. Terra e rocha usam cores neutras.

Cada textura é criada uma vez ao carregar o chunk e descartada quando ele sai de cena. O custo de textura é limitado aos 9 ou 25 chunks carregados. Mapas usam sRGB, mipmaps padrão e anisotropia até 4.

Validação: node --test tests/world-ground.test.mjs
