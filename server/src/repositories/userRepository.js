export function createUserRepository(db) {
  const findByEmailStatement = db.prepare('SELECT * FROM users WHERE email = ?');
  const findByIdStatement = db.prepare('SELECT * FROM users WHERE id = ?');
  const insertUserStatement = db.prepare(`
    INSERT INTO users (email, password_hash, display_name, timezone, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  return {
    findByEmail(email) {
      return findByEmailStatement.get(email);
    },
    findById(id) {
      return findByIdStatement.get(id);
    },
    create({ email, passwordHash, displayName, timezone, createdAt }) {
      const result = insertUserStatement.run(
        email,
        passwordHash,
        displayName,
        timezone,
        createdAt,
        createdAt,
      );
      return findByIdStatement.get(Number(result.lastInsertRowid));
    },
  };
}
