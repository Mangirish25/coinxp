import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export function migrateDatabase(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY NOT NULL,
    applied_at TEXT NOT NULL
  )`);

  const files = readdirSync(migrationsDir)
    .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
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
