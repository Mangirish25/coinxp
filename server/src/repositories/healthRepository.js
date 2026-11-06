export function checkDatabase(db) {
  return db.prepare('SELECT 1 AS ok').get().ok === 1;
}
