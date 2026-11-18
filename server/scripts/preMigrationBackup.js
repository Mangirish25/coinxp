import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/db/connection.js';

const env = loadEnv();
if (env.dbPath === ':memory:') throw new Error('Pre-migration backups require a persistent DB_PATH.');
const directory = path.resolve(process.env.BACKUP_DIR || path.join(path.dirname(env.dbPath), 'backups'));
mkdirSync(directory, { recursive: true });
const stamp = new Date().toISOString().replaceAll(':', '-');
const target = path.join(directory, `coinxp-pre-migration-${stamp}.sqlite`);
const db = createDatabase(env.dbPath);
try {
  await db.backup(target);
  process.stdout.write(`SQLite pre-migration backup created: ${path.basename(target)}\n`);
} finally {
  db.close();
}
