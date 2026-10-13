import {
  mkdir,
  open,
  readFile,
  rename,
  rm
} from 'node:fs/promises';

import path from 'node:path';
import { randomUUID } from 'node:crypto';

import type {
  StoredCompanion
} from '../models/types.js';

const writeQueues = new Map<string, Promise<void>>();


/** Write a complete replacement beside the target, then atomically rename it.
 * This prevents a process interruption from leaving half of a JSON document.
 */
export async function writeFileAtomic(file: string, contents: string | Uint8Array, mode = 0o600): Promise<void> {
  const target = path.resolve(file);
  const previous = writeQueues.get(target) ?? Promise.resolve();
  const queued = previous
    .catch(() => undefined)
    .then(() => writeFileAtomicNow(target, contents, mode));
  writeQueues.set(target, queued);

  try {
    await queued;
  } finally {
    if (writeQueues.get(target) === queued) writeQueues.delete(target);
  }
}

async function writeFileAtomicNow(file: string, contents: string | Uint8Array, mode: number): Promise<void> {
  const directory = path.dirname(file);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  let handle: any;
  try {
    handle = await open(temporary, 'wx', mode);
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(temporary, file);
        break;
      } catch (error) {
        if (!isTransientRenameError(error) || attempt >= 3) throw error;
        await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1)));
      }
    }
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

function isTransientRenameError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'EPERM' || code === 'EACCES' || code === 'EBUSY';
}


export class LocalStore {

  constructor(
    private root = 'data'
  ) {}


  private file(
    id: string
  ): string {
    return path.join(
      this.root,
      `${id}.json`
    );
  }


  private keyFile(
    id: string
  ): string {
    return path.join(
      this.root,
      'secure',
      `${id}.key.json`
    );
  }


  /**
   * Salva o estado público da Companion.
   */
  async save(
    companion: StoredCompanion
  ): Promise<void> {

    await mkdir(this.root, { recursive: true, mode: 0o700 });

    await writeFileAtomic(
      this.file(
        companion.state.identity.id
      ),

      JSON.stringify(
        companion,
        null,
        2
      ),

      0o600
    );
  }


  /**
   * Carrega o estado público da Companion.
   */
  async load(
    id: string
  ): Promise<StoredCompanion | null> {

    try {

      const content = await readFile(this.file(id), 'utf8');
      const value = JSON.parse(content) as StoredCompanion;
      if (!value || typeof value !== 'object' || !value.state?.identity || !Array.isArray(value.events) || !Array.isArray(value.snapshots)) {
        throw new Error('Estrutura inválida. Preserve a pasta data e restaure um backup válido.');
      }
      return value;
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return null;
      if (error instanceof SyntaxError) throw new Error('Arquivo da Companion corrompido. Preserve a pasta data e restaure um backup válido.', { cause: error });
      throw error;
    }
  }


  /**
   * Salva a chave privada separadamente.
   */
  async savePrivateKey(
    id: string,
    privateKey: string
  ): Promise<void> {

    await mkdir(path.join(this.root, 'secure'), { recursive: true, mode: 0o700 });

    await writeFileAtomic(
      this.keyFile(id),

      JSON.stringify(
        {
          privateKey
        },
        null,
        2
      ),

      0o600
    );
  }


  /**
   * Carrega a chave privada.
   */
  async loadPrivateKey(
    id: string
  ): Promise<string> {

    const content =
      await readFile(
        this.keyFile(id),
        'utf8'
      );

    const data =
      JSON.parse(
        content
      ) as {
        privateKey: string;
      };

    if (
      typeof data.privateKey !==
      'string'
    ) {
      throw new Error(
        'Chave privada inválida.'
      );
    }

    return data.privateKey;
  }
}

