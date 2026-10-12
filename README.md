# Companion Core

Mayuna é a primeira Companion persistente da plataforma.

Para abrir a aplicação, use `npm start` ou `npm run web:start`. O código é recompilado antes de iniciar. Para desenvolvimento, use `npm run dev` ou `npm run web`. O antigo demo CLI agora é explícito: `npm run demo` ou `npm run demo:dev`, com arquivos isolados em `.mayuna-cli-demo/`.

O servidor exibe o caminho do projeto, build, pasta de dados e se está aguardando o primeiro ritual. `GET /api/health` identifica esse fluxo com `startupFlow: first-awakening-v1`. Uma instalação vazia não cria Mayuna automaticamente.

Esta cópia está na **Web v0.7**. Comece por [ATUALIZACAO_V0.7.md](ATUALIZACAO_V0.7.md) para instalar e conferir a persistência. O plano de desenvolvimento fica em [PLANO_DESENVOLVIMENTO.md](PLANO_DESENVOLVIMENTO.md).

OpenAI e modo híbrido seguem opcionais; Ollama local continua como padrão. Para usar Groq no Windows local sem salvar a chave no repositório, execute `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\start-groq-windows.ps1` e siga `docs/GROQ_WINDOWS.md`. A configuração de um endpoint Ollama HTTPS fica em [docs/OLLAMA_REMOTO.md](docs/OLLAMA_REMOTO.md). Consulte **ATUALIZACAO_V0.6.md** para detalhes dos providers e **PROJETO_CHATGPT.md** para organizar o contexto de desenvolvimento.

# Atualização web v0.4

Comece por [WEB_V0.4.md](WEB_V0.4.md). Build incluído: `npm run web:start`.
No primeiro acesso com dados vazios, crie a conta local e desperte sua Companion pelo ritual. Nenhuma Mayuna é criada automaticamente. Há uma Companion própria por conta local; a criação adicional é bloqueada no servidor. Preserve a pasta `data/` mais recente. Veja [o fluxo de criação](docs/HUB_MULTICOMPANION.md).
Arquitetura portátil e plano de escala: [ARQUITETURA_PORTATIL.md](ARQUITETURA_PORTATIL.md).

---

# Atualização web v0.2

Comece por [WEB_V0.2.md](WEB_V0.2.md). Para abrir o build incluído: `npm run web:start`.
A auditoria, testes e limitações estão em [AUDITORIA_V0.2.md](AUDITORIA_V0.2.md).
O Core e os dados recebidos foram preservados. O conteúdo anterior segue abaixo.

---

# Companion Core MVP 0.1

Protótipo funcional do núcleo de Companions, independente de Angular/UI.

## O que já funciona

- Criação de Companion (Genesis)
- Identidade Ed25519
- Assinatura digital de eventos
- Hash SHA-256 e cadeia de integridade
- Core XP e Combat XP independentes e sem cap
- Bond separado dos dois XP
- Memórias episódicas/significativas/identitárias
- Journal com momentos importantes
- Personalidade gradual
- Evolução por milestones
- Snapshots confiáveis
- Persistência local em JSON
- Simulação de alterações offline
- Verificação local
- Verificação online simulada com regras de servidor
- Rollback para último estado confiável
- Evento periódico de verificação com recompensa
- Auditoria de histórico

## Segurança do MVP

A chave privada fica em `data/secure/<companionId>.key.json` apenas para demonstração local. Isso NÃO é armazenamento seguro para produção. Em produção ela deve ser movida para Android Keystore, Windows TPM/DPAPI, Secure Enclave ou outro armazenamento seguro.

O servidor simulado mantém a identidade pública e o último snapshot confiável. Uma implementação online real deverá manter esses dados em um backend e nunca receber a chave privada.

## Rodar

```bash
npm install
npm run dev
```

Ou:

```bash
npm run build
npm start
```

A demo cria/recupera Mayuna, registra experiências, mostra o Journal, cria snapshots, simula corrupção/cheat offline e depois faz uma verificação online simulada com rollback.

## Interface Web — Mayuna Web v0.1

A primeira interface web do projeto está em `web/` e usa o mesmo Companion Core já existente.

Ela inclui:

- viewport central animado para o futuro mundo do MMORPG;
- HUD desktop modular;
- modo mobile simplificado;
- painel da Companion;
- Core Level, XP, vínculo, combate e integridade;
- equipamentos, inventário, skills, passivas e hotbar;
- memórias reais carregadas do Core;
- chat conectado ao `InteractionEngine` + Ollama;
- painéis minimizáveis no desktop;
- drawers simplificados no mobile;
- troca de cor do HUD, incluindo um preset verde-musgo;
- verificação local do Core pela interface;
- API local sem dependências extras de servidor.

### Rodar a interface web

Com o Ollama aberto e o modelo configurado normalmente, na raiz do projeto execute:

```bash
npm run web
```

Depois abra:

```text
http://127.0.0.1:4173
```

A interface e a API rodam na mesma porta. A pasta `data/` continua sendo a fonte local da identidade e do estado da Companion.

### Rotas locais atuais

```text
GET  /api/health
GET  /api/companion/state
GET  /api/companion/verify
POST /api/companion/chat
```

A interface nunca recebe a chave privada da Companion. O arquivo em `data/secure/` continua acessível apenas ao runtime local do Node.

### Mobile

A interface não comprime o HUD desktop. Em telas menores ela troca para um modo próprio, mantendo o mundo como foco principal e abrindo inventário, Companion, skills, memórias e chat em painéis inferiores.

### Próximas etapas sugeridas

1. transformar o `GameViewport` conceitual em um mundo real com Phaser;
2. definir modelos reais de equipamentos, skills, passivas e inventário no Core;
3. persistir configurações de HUD por usuário/Companion;
4. criar sistema de missões e exploração;
5. criar exportação/importação criptografada da Companion;
6. evoluir a interface para temas completos, além da troca de cor.

## Cristal de Memória

O [registro online compartilhado](docs/REGISTRO_ONLINE.md) usa Supabase Edge Functions e Postgres. O guia inclui diagnóstico (`npm run crystal:check`), backup, migração dos registros locais e teste de importação em uma instalação limpa. Sessões antigas precisam de migração explícita; o login web e o acesso local ainda são separados.

Recolha sua Companion em um arquivo criptografado e desperte no próximo dispositivo. O registro central controla a sessão ativa e mostra onde ela está autorizada. Inicie o serviço com `npm run crystal:server` e configure `COMPANION_REGISTRY_URL` no Core. Veja o [guia de transferência, recuperação e limites](docs/CRISTAL_MEMORIA.md).
