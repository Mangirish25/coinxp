export function createUserRepository(db) {
  const findByEmailStatement = db.prepare('SELECT * FROM users WHERE email = ?');
  const findByIdStatement = db.prepare('SELECT * FROM users WHERE id = ?');
  const findTimezoneStatement = db.prepare('SELECT timezone FROM users WHERE id = ?');
  const timezoneSettingsStatement = db.prepare('SELECT timezone,timezone_changed_at AS timezoneChangedAt,created_at AS createdAt FROM users WHERE id=?');
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
    findTimezone(id) {
      return findTimezoneStatement.get(id)?.timezone;
    },
    timezoneSettings(id) { return timezoneSettingsStatement.get(id); },
    updateTimezone({ id, timezone, changedAt }) {
      return db.prepare('UPDATE users SET timezone=?,timezone_changed_at=?,updated_at=? WHERE id=?').run(timezone,changedAt,changedAt,id).changes;
    },
    updatePassword({ id, passwordHash, updatedAt }) {
      return db.prepare('UPDATE users SET password_hash=?,token_version=token_version+1,updated_at=? WHERE id=?')
        .run(passwordHash, updatedAt, id).changes;
    },
    listActive() { return db.prepare('SELECT id,timezone,created_at AS createdAt FROM users ORDER BY id').all(); },
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
