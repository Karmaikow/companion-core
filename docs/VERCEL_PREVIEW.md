# Prévia estática na Vercel

Esta configuração publica somente a interface web em modo demonstrativo. A prévia usa uma Companion sintética: não conecta ao Ollama, ao Core local ou ao registro compartilhado, e não grava memórias, XP ou progresso real.

Na importação do repositório, use a raiz `./`, o preset `Other` e deixe as variáveis de ambiente vazias. O `vercel.json` define o comando de build e a pasta estática. O build compila os módulos de cor e monta `vercel-output/` com `runtime-mode.js` apontando para `demo`; o arquivo original em `web/` continua em modo `local` para os usos normais do Core.

Use a prévia para revisar a interface. Ela não hospeda o servidor Node, as contas, os dados das Companions nem um modelo de IA. O backend e o Ollama continuam no dispositivo enquanto a arquitetura online não for preparada.
