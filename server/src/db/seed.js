import { loadEnv } from '../config/env.js';
import { createDatabase } from './connection.js';
import { migrateDatabase } from './migrator.js';

const env = loadEnv();
const db = createDatabase(env.dbPath);
const categories = [
  ['Salary', 'income'],
  ['Allowance', 'income'],
  ['Freelancing', 'income'],
  ['Scholarship', 'income'],
  ['Other', 'income'],
  ['Food', 'expense'],
  ['Transportation', 'expense'],
  ['Education', 'expense'],
  ['Entertainment', 'expense'],
  ['Shopping', 'expense'],
  ['Other', 'expense'],
];
try {
  migrateDatabase(db);
  const insert = db.prepare(`INSERT INTO categories (user_id, name, type, is_default, created_at)
    SELECT NULL, ?, ?, 1, ? WHERE NOT EXISTS (
      SELECT 1 FROM categories WHERE user_id IS NULL AND name = ? AND type = ? AND is_default = 1
    )`);
  const seed = db.transaction(() => {
    const now = new Date().toISOString();
    for (const [name, type] of categories) insert.run(name, type, now, name, type);
  });
  seed();
  console.log('Default categories are seeded.');
} finally {
  db.close();
}
