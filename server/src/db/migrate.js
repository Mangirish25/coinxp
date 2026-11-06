import { loadEnv } from '../config/env.js';
import { createDatabase } from './connection.js';
import { migrateDatabase } from './migrator.js';

const env = loadEnv();
const db = createDatabase(env.dbPath);
try {
  migrateDatabase(db);
  console.log('Database migrations are up to date.');
} finally {
  db.close();
}
