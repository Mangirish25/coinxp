import Database from 'better-sqlite3';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

export function createDatabase(dbPath) {
  if (!dbPath) throw new Error('A database path is required.');
  if (dbPath !== ':memory:') mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}
