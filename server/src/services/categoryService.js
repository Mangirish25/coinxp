import { createCategoryRepository } from '../repositories/categoryRepository.js';
import { nowIso } from '../utils/dates.js';
import { httpError } from '../utils/httpError.js';

function isUniqueConstraint(error) {
  return error.code === 'SQLITE_CONSTRAINT_UNIQUE';
}

export function createCategoryService({ db }) {
  const categories = createCategoryRepository(db);

  function findOwnedOrReadOnly(userId, categoryId) {
    const category = categories.findOwnedById(userId, categoryId);
    if (category) return category;
    if (categories.findSystemById(categoryId)) {
      throw httpError(403, 'CATEGORY_READ_ONLY', 'System categories cannot be changed.');
    }
    throw httpError(404, 'CATEGORY_NOT_FOUND', 'Category not found.');
  }

  return {
    list(userId, type) {
      return categories.listForUser(userId, type);
    },

    create(userId, body) {
      try {
        return db.transaction(() => {
          if (categories.findActiveByName(userId, body.name, body.type)) {
            throw httpError(
              409,
              'CATEGORY_EXISTS',
              'A category with this name already exists for this type.',
            );
          }
          const deleted = categories.findDeletedByName(userId, body.name, body.type);
          if (deleted) {
            return categories.revive({
              userId,
              id: deleted.id,
              name: body.name,
              icon: body.icon ?? null,
            });
          }
          return categories.create({
            userId,
            name: body.name,
            type: body.type,
            icon: body.icon ?? null,
            createdAt: nowIso(),
          });
        })();
      } catch (error) {
        if (isUniqueConstraint(error)) {
          throw httpError(
            409,
            'CATEGORY_EXISTS',
            'A category with this name already exists for this type.',
          );
        }
        throw error;
      }
    },

    update(userId, categoryId, body) {
      try {
        return db.transaction(() => {
          const before = findOwnedOrReadOnly(userId, categoryId);
          const name = body.name ?? before.name;
          const icon = body.icon === undefined ? before.icon : body.icon;
          const duplicate = categories.findActiveByName(userId, name, before.type);
          if (duplicate && duplicate.id !== categoryId) {
            throw httpError(
              409,
              'CATEGORY_EXISTS',
              'A category with this name already exists for this type.',
            );
          }
          if (name === before.name && icon === before.icon) return before;
          return categories.update({ userId, id: categoryId, name, icon });
        })();
      } catch (error) {
        if (isUniqueConstraint(error)) {
          throw httpError(
            409,
            'CATEGORY_EXISTS',
            'A category with this name already exists for this type.',
          );
        }
        throw error;
      }
    },

    delete(userId, categoryId) {
      return db.transaction(() => {
        findOwnedOrReadOnly(userId, categoryId);
        if (categories.isInUse(userId, categoryId)) {
          throw httpError(
            409,
            'CATEGORY_IN_USE',
            'This category is used by an active transaction.',
          );
        }
        categories.softDelete({ userId, id: categoryId, deletedAt: nowIso() });
      })();
    },
  };
}
