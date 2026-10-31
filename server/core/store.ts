import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { Database, DatabaseSchema, DomainError } from './schema.js';

const DEFAULT_DB_PATH = path.join(os.homedir(), '.sonionmap', 'db.json');

export function getDbPath(): string {
  return process.env.SONIONMAP_DB?.trim() || DEFAULT_DB_PATH;
}

function emptyDatabase(): Database {
  return {
    version: 1,
    revision: 0,
    activeMapId: null,
    maps: [],
  };
}

async function ensureDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function writeAtomic(filePath: string, data: Database): Promise<void> {
  await ensureDir(filePath);
  const tmp = `${filePath}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  const payload = JSON.stringify(data, null, 2);
  await fs.writeFile(tmp, payload, 'utf8');
  await fs.rename(tmp, filePath);
}

export async function ensureDb(): Promise<Database> {
  const filePath = getDbPath();
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = DatabaseSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new DomainError(
        'INVALID_DB',
        `The database at ${filePath} is not in a valid format.`,
        500,
        parsed.error.issues
      );
    }
    return parsed.data;
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      const db = emptyDatabase();
      await writeAtomic(filePath, db);
      return db;
    }
    throw error;
  }
}

export async function readDb(): Promise<Database> {
  return ensureDb();
}

async function acquireLock(lockDir: string, timeoutMs = 8000): Promise<void> {
  const started = Date.now();
  for (;;) {
    try {
      await fs.mkdir(lockDir);
      return;
    } catch (error: any) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        const stat = await fs.stat(lockDir);
        if (Date.now() - stat.mtimeMs > 30_000) {
          await fs.rm(lockDir, { recursive: true, force: true });
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() - started > timeoutMs) {
        throw new DomainError(
          'DB_LOCKED',
          'The database is locked by another process. Try again in a few seconds.',
          503
        );
      }
      await new Promise(resolve => setTimeout(resolve, 40));
    }
  }
}

async function releaseLock(lockDir: string): Promise<void> {
  await fs.rm(lockDir, { recursive: true, force: true });
}

/**
 * Runs a mutation atomically and serialized across processes.
 * The callback receives a mutable copy of the database and must return the result.
 * If it throws, nothing is written.
 */
export async function mutateDb<T>(mutator: (db: Database) => T | Promise<T>): Promise<T> {
  const filePath = getDbPath();
  const lockDir = `${filePath}.lock`;
  await ensureDir(filePath);
  await acquireLock(lockDir);
  try {
    // Re-read under lock so changes from another process are not overwritten.
    const db = await ensureDb();
    const draft: Database = JSON.parse(JSON.stringify(db));
    const result = await mutator(draft);
    draft.revision += 1;
    const validated = DatabaseSchema.parse(draft);
    await writeAtomic(filePath, validated);
    return result;
  } finally {
    await releaseLock(lockDir);
  }
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomBytes(3).toString('hex')}`;
}
