import { rmSync } from 'node:fs';
import { loadEnv } from '../config/env.js';
import { createDatabase } from './connection.js';
import { migrateDatabase } from './migrator.js';

const env = loadEnv();
if (env.nodeEnv !== 'development') {
  throw new Error('db:reset is development-only. Set NODE_ENV=development to continue.');
}
if (env.dbPath === ':memory:')
  throw new Error('db:reset requires a file-backed development database.');
for (const suffix of ['', '-shm', '-wal']) rmSync(`${env.dbPath}${suffix}`, { force: true });
const db = createDatabase(env.dbPath);
try {
  migrateDatabase(db);
  console.log('Development database reset and migrated.');
} finally {
  db.close();
}
