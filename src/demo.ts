import {
  createInterface
} from 'node:readline/promises';

import {
  stdin as input,
  stdout as output
} from 'node:process';

import {
  mkdir,
  readFile,
  writeFile
} from 'node:fs/promises';

import {
  CompanionCore
} from './core/core.js';

import {
  MAYUNA_PROFILE
} from './companions/mayuna.js';

import {
  OllamaProvider
} from './ai/ollama-provider.js';

import {
  ConversationHistory
} from './interaction/conversation-history.js';

import {
  InteractionEngine
} from './core/interaction-engine.js';

import {
  LocalStore
} from './storage/store.js';


/*
 * Arquivo que identifica qual Companion
 * está ativa atualmente.
 */
const ACTIVE_COMPANION_FILE =
  'data/active-companion.json';


/*
 * Recupera o ID da Companion ativa.
 */
async function getActiveCompanionId(): Promise<
  string | null
> {

  try {

    const content =
      await readFile(
        ACTIVE_COMPANION_FILE,
        'utf8'
      );

    const data =
      JSON.parse(content);

    return typeof data.id === 'string'
      ? data.id
      : null;

  } catch {

    return null;
  }
}


/*
 * Define a Companion ativa.
 */
async function setActiveCompanionId(
  id: string
): Promise<void> {

  await mkdir(
    'data',
    {
      recursive: true
    }
  );

  await writeFile(
    ACTIVE_COMPANION_FILE,
    JSON.stringify(
      { id },
      null,
      2
    ),
    'utf8'
  );
}


/*
 * Salva o estado completo da Companion
 * e sua identidade criptográfica.
 */
async function saveCompanion(
  store: LocalStore,
  core: CompanionCore
): Promise<void> {

  await store.save(
    core.getData()
  );

  await store.savePrivateKey(
    core.getState().identity.id,
    core.getPrivateKey()
  );

  await setActiveCompanionId(
    core.getState().identity.id
  );
}


/*
 * Exibe o estado atual da Companion.
 */
function printState(
  core: CompanionCore
): void {

  const state =
    core.getState();

  console.log('\n');

  console.log(
    '══════════════════════════════════════'
  );

  console.log(
    '             ESTADO'
  );

  console.log(
    '══════════════════════════════════════'
  );

  console.log(
    `Companion: ${state.identity.name}`
  );

  console.log(
    `ID: ${state.identity.id}`
  );

  console.log(
    `Companion de: ${state.profile.companionOf.name}`
  );

  console.log(
    `Forma: ${state.core.evolutionStage}`
  );

  console.log(
    `Core Level: ${state.core.level}`
  );

  console.log(
    `Core XP: ${state.core.xp}/${state.core.xpToNextLevel}`
  );

  console.log(
    `Combat Level: ${state.combat.level}`
  );

  console.log(
    `Combat XP: ${state.combat.xp}/${state.combat.xpToNextLevel}`
  );

  console.log(
    `Bond: ${state.bond.value}/1000`
  );

  console.log(
    `Relacionamento: ${state.bond.relationship}`
  );

  console.log('\nPersonalidade:');

  console.log(
    `  Lealdade: ${state.personality.loyalty}`
  );

  console.log(
    `  Curiosidade: ${state.personality.curiosity}`
  );

  console.log(
    `  Humor: ${state.personality.humor}`
  );

  console.log(
    `  Coragem: ${state.personality.courage}`
  );

  console.log(
    `  Empatia: ${state.personality.empathy}`
  );

  console.log(
    `  Autonomia: ${state.personality.autonomy}`
  );

  console.log(
    '\nMemórias:',
    state.memories.length
  );

  console.log(
    'Diário:',
    state.journal.length
  );

  console.log(
    'Eventos:',
    core.getData().events.length
  );

  console.log(
    'Snapshots:',
    core.getData().snapshots.length
  );

  console.log(
    '══════════════════════════════════════\n'
  );
}


/*
 * Exibe todas as memórias.
 */
function printMemories(
  core: CompanionCore
): void {

  const state =
    core.getState();

  console.log('\n');

  console.log(
    '══════════════════════════════════════'
  );

  console.log(
    '              MEMÓRIAS'
  );

  console.log(
    '══════════════════════════════════════'
  );

  if (
    state.memories.length === 0
  ) {

    console.log(
      'Nenhuma memória registrada.'
    );

    console.log(
      '══════════════════════════════════════\n'
    );

    return;
  }

  for (
    const memory of state.memories
  ) {

    console.log(
      `\n[${memory.type}] ${memory.title}`
    );

    console.log(
      memory.content
    );

    console.log(
      `Peso emocional: ${memory.emotionalWeight}`
    );

    console.log(
      `Data: ${memory.timestamp}`
    );
  }

  console.log(
    '\n══════════════════════════════════════\n'
  );
}


/*
 * Exibe o diário da Companion.
 */
function printJournal(
  core: CompanionCore
): void {

  const state =
    core.getState();

  console.log('\n');

  console.log(
    '══════════════════════════════════════'
  );

  console.log(
    '               DIÁRIO'
  );

  console.log(
    '══════════════════════════════════════'
  );

  if (
    state.journal.length === 0
  ) {

    console.log(
      'O diário ainda está vazio.'
    );

    console.log(
      '══════════════════════════════════════\n'
    );

    return;
  }

  for (
    const entry of state.journal
  ) {

    console.log(
      `\n[${entry.type}] ${entry.title}`
    );

    console.log(
      entry.content
    );

    console.log(
      `Data: ${entry.timestamp}`
    );
  }

  console.log(
    '\n══════════════════════════════════════\n'
  );
}


/*
 * Exibe a personalidade.
 */
function printPersonality(
  core: CompanionCore
): void {

  const personality =
    core.getState()
      .personality;

  console.log('\n');

  console.log(
    '══════════════════════════════════════'
  );

  console.log(
    '           PERSONALIDADE'
  );

  console.log(
    '══════════════════════════════════════'
  );

  console.table({

    Lealdade:
      personality.loyalty,

    Curiosidade:
      personality.curiosity,

    Humor:
      personality.humor,

    Coragem:
      personality.courage,

    Empatia:
      personality.empathy,

    Autonomia:
      personality.autonomy
  });

  console.log(
    '══════════════════════════════════════\n'
  );
}


/*
 * Exibe todos os eventos registrados.
 */
function printEvents(
  core: CompanionCore
): void {

  const events =
    core.getData().events;

  console.log('\n');

  console.log(
    '══════════════════════════════════════'
  );

  console.log(
    '              EVENTOS'
  );

  console.log(
    '══════════════════════════════════════'
  );

  if (
    events.length === 0
  ) {

    console.log(
      'Nenhum evento registrado.'
    );

    console.log(
      '══════════════════════════════════════\n'
    );

    return;
  }

  for (
    const event of events
  ) {

    console.log(
      `#${event.sequence} | ${event.type} | ${event.importance}`
    );

    console.log(
      `   ${event.timestamp}`
    );

    console.log(
      `   effects: Core ${event.effects.coreXp} | Combat ${event.effects.combatXp} | Bond ${event.effects.bond}`
    );

    console.log('');
  }

  console.log(
    '══════════════════════════════════════\n'
  );
}


/*
 * Exibe informações da identidade criptográfica.
 */
function printIdentity(
  core: CompanionCore
): void {

  const state =
    core.getState();

  console.log('\n');

  console.log(
    '══════════════════════════════════════'
  );

  console.log(
    '       IDENTIDADE CRIPTOGRÁFICA'
  );

  console.log(
    '══════════════════════════════════════'
  );

  console.log(
    `ID: ${state.identity.id}`
  );

  console.log(
    `Algoritmo: ${state.identity.cryptographicIdentity.algorithm}`
  );

  console.log(
    `Criada em: ${state.identity.createdAt}`
  );

  console.log(
    `Chave pública:`
  );

  console.log(
    state.identity.cryptographicIdentity.publicKey
  );

  console.log(
    '══════════════════════════════════════\n'
  );
}


/*
 * Inicialização principal.
 */
async function main(): Promise<void> {

  const store =
    new LocalStore();


  /*
   * Verifica se existe uma Companion ativa.
   */
  const activeId =
    await getActiveCompanionId();


  let core: CompanionCore;


  /*
   * =========================================================
   * RECUPERAÇÃO DA COMPANION
   * =========================================================
   */
  if (activeId) {

    try {

      const stored =
        await store.load(
          activeId
        );


      if (!stored) {

        throw new Error(
          'Companion não encontrada.'
        );
      }


      /*
       * A chave privada fica armazenada
       * separadamente do estado público.
       */
      const privateKey =
        await store.loadPrivateKey(
          activeId
        );


      core =
        CompanionCore.from(
          stored,
          privateKey
        );


      console.log(
        `\nCompanion recuperada: ${core.getState().identity.name}`
      );

      console.log(
        `ID: ${core.getState().identity.id}`
      );


    } catch (error) {

      console.log(
        '\nNão foi possível recuperar a Companion existente.'
      );

      console.log(
        'Uma nova Companion será criada.'
      );


      core =
        CompanionCore.create(
          MAYUNA_PROFILE
        );


      console.log(
        `\nNova Companion criada: ${core.getState().identity.name}`
      );

      console.log(
        `ID: ${core.getState().identity.id}`
      );
    }


  } else {


    /*
     * =========================================================
     * PRIMEIRA CRIAÇÃO
     * =========================================================
     */
    core =
      CompanionCore.create(
        MAYUNA_PROFILE
      );


    console.log(
      `\nNova Companion criada: ${core.getState().identity.name}`
    );

    console.log(
      `ID: ${core.getState().identity.id}`
    );
  }


  /*
   * Salva imediatamente o estado inicial
   * e a chave privada.
   */
  await saveCompanion(
    store,
    core
  );


  /*
   * =========================================================
   * IA
   * =========================================================
   */
  const provider =
    new OllamaProvider();


  /*
   * Histórico da conversa atual.
   */
  const conversation =
    new ConversationHistory(
      20
    );


  /*
   * Motor responsável pela interação.
   */
  const interaction =
    new InteractionEngine(
      core,
      provider,
      conversation
    );


  /*
   * =========================================================
   * INTERFACE
   * =========================================================
   */
  console.log('\n');

  console.log(
    '╔══════════════════════════════════════════════╗'
  );

  console.log(
    `║      ${core.getState().identity.name} — Companion Core      ║`
  );

  console.log(
    '╚══════════════════════════════════════════════╝'
  );


  console.log(
    '\nDigite uma mensagem para conversar.'
  );

  console.log(
    'Comandos disponíveis:'
  );

  console.log(
    '  /estado'
  );

  console.log(
    '  /memorias'
  );

  console.log(
    '  /diario'
  );

  console.log(
    '  /personalidade'
  );

  console.log(
    '  /identidade'
  );

  console.log(
    '  /eventos'
  );

  console.log(
    '  /verificar'
  );

  console.log(
    '  /sair'
  );


  const rl =
    createInterface({
      input,
      output
    });


  try {

    while (true) {


      /*
       * =======================================================
       * ENTRADA DO USUÁRIO
       * =======================================================
       */
      const message =
        (
          await rl.question(
            '\nVocê > '
          )
        ).trim();


      if (!message) {
        continue;
      }


      /*
       * =======================================================
       * SAIR
       * =======================================================
       */
      if (
        message === '/sair'
      ) {

        break;
      }


      /*
       * =======================================================
       * ESTADO
       * =======================================================
       */
      if (
        message === '/estado'
      ) {

        printState(
          core
        );

        continue;
      }


      /*
       * =======================================================
       * MEMÓRIAS
       * =======================================================
       */
      if (
        message === '/memorias'
      ) {

        printMemories(
          core
        );

        continue;
      }


      /*
       * =======================================================
       * DIÁRIO
       * =======================================================
       */
      if (
        message === '/diario'
      ) {

        printJournal(
          core
        );

        continue;
      }


      /*
       * =======================================================
       * PERSONALIDADE
       * =======================================================
       */
      if (
        message === '/personalidade'
      ) {

        printPersonality(
          core
        );

        continue;
      }


      /*
       * =======================================================
       * IDENTIDADE
       * =======================================================
       */
      if (
        message === '/identidade'
      ) {

        printIdentity(
          core
        );

        continue;
      }


      /*
       * =======================================================
       * EVENTOS
       * =======================================================
       */
      if (
        message === '/eventos'
      ) {

        printEvents(
          core
        );

        continue;
      }


      /*
       * =======================================================
       * VERIFICAÇÃO
       * =======================================================
       */
      if (
        message === '/verificar'
      ) {

        const result =
          core.verifyLocal();


        console.log('\n');


        console.log(
          result.valid
            ? '✓ Histórico íntegro.'
            : '✗ Histórico inválido.'
        );


        console.log(
          `Sequência confiável: ${result.trustedSequence}`
        );


        console.log(
          `Eventos aceitos: ${result.acceptedEvents}`
        );


        console.log(
          result.reason
        );


        continue;
      }


      /*
       * =======================================================
       * CONVERSA COM A COMPANION
       * =======================================================
       */
      console.log(
        `\n${core.getState().identity.name} > pensando...`
      );


      try {

        const result =
          await interaction.interact(
            message
          );


        console.log(
          `\n${core.getState().identity.name} > ${result.response}`
        );


        /*
         * Caso o ResponseGuard tenha precisado
         * corrigir a resposta da IA.
         */
        if (
          result.guarded
        ) {

          console.log(
            '  [resposta corrigida pelo guard de consistência]'
          );
        }


        /*
         * =====================================================
         * SNAPSHOT PERIÓDICO
         * =====================================================
         *
         * A cada 5 eventos criamos um snapshot
         * confiável do estado.
         */
        const eventCount =
          core.getData()
            .events.length;


        if (
          eventCount > 0 &&
          eventCount % 5 === 0
        ) {

          core.createSnapshot();

          console.log(
            '  [snapshot criado]'
          );
        }


        /*
         * Salva estado + chave privada.
         */
        await saveCompanion(
          store,
          core
        );


      } catch (error) {

        console.error(
          '\nErro durante a interação:',
          error
        );
      }
    }


  } finally {

    rl.close();
  }


  /*
   * =========================================================
   * ENCERRAMENTO
   * =========================================================
   */
  await saveCompanion(
    store,
    core
  );


  console.log(
    '\nSessão encerrada.'
  );

  console.log(
    `Companion salva: ${core.getState().identity.name}`
  );


  printState(
    core
  );
}


/*
 * ===========================================================
 * ERRO FATAL
 * ===========================================================
 */
main().catch(
  error => {

    console.error(
      'Erro fatal:',
      error
    );

    process.exit(1);
  }
);