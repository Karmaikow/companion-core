# Refúgio de Mayuna: navegador e Godot

O repositório contém duas implementações para experimentar o mesmo refúgio:

- **Prévia web:** `web/refuge-godot.html`. Usa Three.js, abre dentro do navegador
  do Companion Core e conversa com o Core em execução. Não é uma exportação do
  Godot.
- **Projeto Godot:** `godot/refuge-prototype/project.godot`. Abra esse arquivo no
  Godot 4.3 ou mais recente pelo Project Manager e execute `main.tscn`.

## Prévia web no computador

No terminal do VS Code, na raiz do repositório:

```powershell
npm ci
npm run build
$env:MAYUNA_REMOTE_ORIGIN = "http://127.0.0.1:4173"
npm run dev
```

Abra `http://127.0.0.1:4173`, entre no Core e selecione **Refúgio Godot ·
protótipo** no topo do mundo. A rota direta é
`http://127.0.0.1:4173/refuge-godot.html`. O movimento é por clique/toque no
chão; toque na Mayuna para carinho. A conversa, memórias, XP e vínculo passam
pelos endpoints já existentes do Core e permanecem sob a persistência do Core.

## Abrir a cena no Godot

Mantenha o Core rodando com o comando acima. Entre pela interface web, abra
**Configurações → Conexão online**, gere o código de uso único e digite os oito
dígitos no painel superior da janela Godot. O código dura dois minutos; a sessão
pareada dura até duas horas e o token fica apenas na memória do processo Godot.

No Godot Project Manager, clique **Import**, selecione
`godot/refuge-prototype/project.godot` e execute o projeto. A URL do Core e a
origem de pareamento podem ser ajustadas no Inspector do nó principal; ambas
precisam corresponder à configuração `MAYUNA_REMOTE_ORIGIN` do Core.

Para atualizar uma cópia já clonada no Windows:

```powershell
git switch feature/evolucao-3d
git pull --ff-only origin feature/evolucao-3d
npm ci
npm test
npm run build
```

O teste automatizado do navegador pode ser executado após instalar o Chromium
do Playwright:

```powershell
npx playwright install chromium
node tests/refuge-godot-preview.mjs
```

## Limites deste protótipo

O workspace de preparação não tinha o editor/runtime Godot nem os templates de
exportação HTML5. O projeto GDScript não foi importado nem executado aqui; a
exportação web do Godot não foi gerada. A página de navegador é uma prévia
Three.js separada.

A arte disponível de Mayuna é um retrato PNG único. O movimento usa uma pose com
balanço e inversão horizontal; ainda faltam quadros de caminhada nas oito
direções e ciclos desenhados de respiração, carinho, espera, ataque, descanso,
desmaio e defesa. Visitas, decoração e itens continuam fora do escopo deste
primeiro refúgio.
