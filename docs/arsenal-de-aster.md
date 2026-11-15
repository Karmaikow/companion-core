# Arsenal de Áster

A migração `20261106000000_arsenal_de_aster.sql` cadastra os itens do arquivo original no catálogo publicado. Cada registro leva o número do prompt em `data.cardNumber`. Se o slug já existir, a migração só associa a carta, preservando os dados e o estado de publicação do registro.

## Importar as cartas

1. Monte um ZIP com os 200 PNGs diretamente na raiz, de `item_001.png` a `item_200.png`. A ordem dos arquivos é livre.
2. Em um ambiente com Python 3 e Pillow (`python3 -m pip install Pillow`), rode na raiz do repositório:

   ```sh
   python3 scripts/import-arsenal-cards.py cartas.zip
   ```

3. Confira as imagens em `client/src/assets/arsenal-de-aster/`, inclua a pasta no commit e gere o build do cliente. A carta aparece no editor do Arsenal e no detalhe do item na Sacola.

O importador verifica o lote inteiro antes de instalá-lo. Repetir o mesmo ZIP é seguro. Para substituir um lote diferente, mova primeiro a pasta anterior para fora de `client/src/assets`.

A classificação usa os tipos já presentes no jogo. A besta usa o perfil de arco, por exemplo. Poções e ferramentas entram como itens de catálogo. Efeitos de consumo e durabilidade do cinto têm sistemas próprios.
