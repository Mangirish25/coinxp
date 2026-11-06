export function createCategoryRepository(db) {
  const toCategory = (row) =>
    row && {
      id: row.id,
      userId: row.userId,
      name: row.name,
      type: row.type,
      icon: row.icon,
      isDefault: Boolean(row.isDefault),
      createdAt: row.createdAt,
      deletedAt: row.deletedAt,
    };
  const select = `
    SELECT id, user_id AS userId, name, type, icon, is_default AS isDefault,
      created_at AS createdAt, deleted_at AS deletedAt
    FROM categories
  `;
  const statements = {
    listSystem: db.prepare(
      `${select} WHERE user_id IS NULL AND is_default = 1 AND (? IS NULL OR type = ?) ORDER BY type, name COLLATE NOCASE`,
    ),
    listOwned: db.prepare(
      `${select} WHERE user_id = ? AND deleted_at IS NULL AND (? IS NULL OR type = ?) ORDER BY type, name COLLATE NOCASE`,
    ),
    findVisible: db.prepare(
      `${select} WHERE id = ? AND ((user_id = ? AND deleted_at IS NULL) OR (user_id IS NULL AND is_default = 1))`,
    ),
    findOwned: db.prepare(`${select} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`),
    findSystem: db.prepare(`${select} WHERE id = ? AND user_id IS NULL AND is_default = 1`),
    findActiveByName: db.prepare(
      `${select} WHERE user_id = ? AND name = ? COLLATE NOCASE AND type = ? AND deleted_at IS NULL`,
    ),
    findDeletedByName: db.prepare(
      `${select} WHERE user_id = ? AND name = ? COLLATE NOCASE AND type = ? AND deleted_at IS NOT NULL ORDER BY id LIMIT 1`,
    ),
    insert: db.prepare(`INSERT INTO categories (user_id, name, type, icon, is_default, created_at)
      VALUES (?, ?, ?, ?, 0, ?)`),
    revive: db.prepare(`UPDATE categories SET name = ?, icon = ?, deleted_at = NULL
      WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL`),
    update: db.prepare(
      'UPDATE categories SET name = ?, icon = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    ),
    inUse: db.prepare(
      'SELECT 1 FROM transactions WHERE user_id = ? AND category_id = ? AND deleted_at IS NULL LIMIT 1',
    ),
    softDelete: db.prepare(
      'UPDATE categories SET deleted_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    ),
    restoreForTransaction: db.prepare(
      'UPDATE categories SET deleted_at = NULL WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL',
    ),
  };

  return {
    listForUser(userId, type = null) {
      return [
        ...statements.listSystem.all(type, type).map(toCategory),
        ...statements.listOwned.all(userId, type, type).map(toCategory),
      ];
    },
    findVisibleById(userId, id) {
      return toCategory(statements.findVisible.get(id, userId));
    },
    findOwnedById(userId, id) {
      return toCategory(statements.findOwned.get(id, userId));
    },
    findSystemById(id) {
      return toCategory(statements.findSystem.get(id));
    },
    findActiveByName(userId, name, type) {
      return toCategory(statements.findActiveByName.get(userId, name, type));
    },
    findDeletedByName(userId, name, type) {
      return toCategory(statements.findDeletedByName.get(userId, name, type));
    },
    create({ userId, name, type, icon, createdAt }) {
      const result = statements.insert.run(userId, name, type, icon, createdAt);
      return this.findOwnedById(userId, Number(result.lastInsertRowid));
    },
    revive({ userId, id, name, icon }) {
      statements.revive.run(name, icon, id, userId);
      return this.findOwnedById(userId, id);
    },
    update({ userId, id, name, icon }) {
      statements.update.run(name, icon, id, userId);
      return this.findOwnedById(userId, id);
    },
    isInUse(userId, id) {
      return Boolean(statements.inUse.get(userId, id));
    },
    softDelete({ userId, id, deletedAt }) {
      return statements.softDelete.run(deletedAt, id, userId).changes > 0;
    },
    restoreForTransaction(userId, id) {
      return statements.restoreForTransaction.run(id, userId).changes > 0;
    },
  };
}
