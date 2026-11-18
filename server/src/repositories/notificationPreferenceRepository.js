export function createNotificationPreferenceRepository(db) {
  return {
    list(userId) { return db.prepare('SELECT category,enabled FROM notification_preferences WHERE user_id=?').all(userId); },
    set(userId, category, enabled, updatedAt) {
      db.prepare(`INSERT INTO notification_preferences(user_id,category,enabled,updated_at) VALUES(?,?,?,?)
        ON CONFLICT(user_id,category) DO UPDATE SET enabled=excluded.enabled,updated_at=excluded.updated_at
        WHERE notification_preferences.enabled<>excluded.enabled`)
        .run(userId,category,enabled ? 1 : 0,updatedAt);
    },
  };
}
