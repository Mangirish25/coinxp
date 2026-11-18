export function createUiPreferenceRepository(db) {
  const map = (row) => row && ({ userId: row.userId, motionMode: row.motionMode, celebrations: row.celebrations,
    sound: Boolean(row.sound), haptics: Boolean(row.haptics), updatedAt: row.updatedAt });
  const select = db.prepare(`SELECT user_id AS userId,motion_mode AS motionMode,celebrations,sound,haptics,updated_at AS updatedAt
    FROM ui_preferences WHERE user_id=?`);
  return {
    find(userId) { return map(select.get(userId)); },
    save(userId, values, at) {
      db.prepare(`INSERT INTO ui_preferences(user_id,motion_mode,celebrations,sound,haptics,updated_at)
        VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET motion_mode=excluded.motion_mode,celebrations=excluded.celebrations,
        sound=excluded.sound,haptics=excluded.haptics,updated_at=excluded.updated_at`)
        .run(userId, values.motionMode, values.celebrations, Number(values.sound), Number(values.haptics), at);
      return map(select.get(userId));
    },
  };
}
