import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export function listMigrations() {
  return readdirSync(migrationsDir)
    .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function migrationStatus(db) {
  const expected = listMigrations();
  const applied = db.prepare('SELECT name FROM schema_migrations ORDER BY name').all().map(({ name }) => name);
  return { expected, applied, current: expected.every((name) => applied.includes(name)) && applied.every((name) => expected.includes(name)) };
}

export function migrateDatabase(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY NOT NULL,
    applied_at TEXT NOT NULL
  )`);

  const files = listMigrations();
  const isApplied = db.prepare('SELECT 1 FROM schema_migrations WHERE name = ?');
  const record = db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)');

  for (const file of files) {
    if (isApplied.get(file)) continue;
    const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      record.run(file, new Date().toISOString());
    })();
  }
}
