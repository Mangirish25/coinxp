import { handleEvent as defaultHandleEvent } from '../gamification/index.js';
import { GAMIFICATION_EVENTS } from '../gamification/events.js';
import { TRANSACTION_CONFIG } from '../config/transactionConstants.js';
import { createAuditRepository } from '../repositories/auditRepository.js';
import { createCategoryRepository } from '../repositories/categoryRepository.js';
import { createTransactionRepository } from '../repositories/transactionRepository.js';
import { createUserRepository } from '../repositories/userRepository.js';
import { nowIso, todayInTimezone } from '../utils/dates.js';
import { httpError } from '../utils/httpError.js';
import { paiseToRupees } from '../utils/money.js';

const CHANGEABLE_FIELDS = ['type', 'amountPaise', 'categoryId', 'description', 'transactionDate'];

function publicTransaction(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    categoryId: row.categoryId,
    type: row.type,
    amountPaise: row.amountPaise,
    amount: paiseToRupees(row.amountPaise),
    description: row.description,
    transactionDate: row.transactionDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    categoryName: row.categoryName,
    categoryIcon: row.categoryIcon,
    categoryType: row.categoryType,
  };
}

function shiftDate(dateString, { days = 0, years = 0 } = {}) {
  const [year, month, day] = dateString.split('-').map(Number);
  const targetYear = year + years;
  const lastDay = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();
  const date = new Date(Date.UTC(targetYear, month - 1, Math.min(day, lastDay) + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function validateTransactionDate(transactionDate, timezone) {
  const today = todayInTimezone(timezone);
  if (transactionDate > shiftDate(today, { days: TRANSACTION_CONFIG.futureDateDays })) {
    throw httpError(
      422,
      'TRANSACTION_DATE_TOO_FAR_AHEAD',
      'Transaction date cannot be more than one day in the future.',
    );
  }
  if (transactionDate < shiftDate(today, { years: -TRANSACTION_CONFIG.maxHistoryYears })) {
    throw httpError(
      422,
      'TRANSACTION_DATE_TOO_OLD',
      'Transaction date cannot be more than five years ago.',
    );
  }
}

function validateCategory(categories, userId, categoryId, type) {
  const category = categories.findVisibleById(userId, categoryId);
  if (!category || category.type !== type) {
    throw httpError(
      422,
      'CATEGORY_TYPE_MISMATCH',
      'Choose a category available for this transaction type.',
    );
  }
  return category;
}

function auditReason(reason) {
  return reason?.trim() || null;
}

function eventSummary(transaction) {
  return {
    transactionId: transaction.id,
    type: transaction.type,
    amountPaise: transaction.amountPaise,
    transactionDate: transaction.transactionDate,
  };
}

export function createTransactionService({
  db,
  eventHandler = defaultHandleEvent,
  logger = console,
}) {
  const transactions = createTransactionRepository(db);
  const audits = createAuditRepository(db);
  const categories = createCategoryRepository(db);
  const users = createUserRepository(db);

  async function emitSafely(event) {
    try {
      await eventHandler(event);
    } catch (error) {
      try {
        logger.error?.(`Gamification handler failed for ${event.event}.`, error);
      } catch {
        // Logging must not turn a committed financial operation into a failed response.
      }
    }
  }

  function requireOwned(userId, transactionId, includeDeleted = true) {
    const row = transactions.findByIdForUser(userId, transactionId, includeDeleted);
    if (!row) throw httpError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found.');
    return row;
  }

  function requireTimezone(userId) {
    const timezone = users.findTimezone(userId);
    if (!timezone) throw httpError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
    return timezone;
  }

  return {
    async create(userId, body) {
      const timezone = requireTimezone(userId);
      validateTransactionDate(body.transactionDate, timezone);
      validateCategory(categories, userId, body.categoryId, body.type);
      const createdAt = nowIso();
      const committed = db.transaction(() => {
        const id = transactions.create({
          ...body,
          description: body.description?.trim() || null,
          userId,
          createdAt,
        });
        const after = publicTransaction(transactions.findByIdForUser(userId, id));
        audits.insert({
          transactionId: id,
          userId,
          action: 'create',
          before: null,
          after,
          changedFields: CHANGEABLE_FIELDS,
          reason: null,
          createdAt,
        });
        return after;
      })();

      await emitSafely({
        event: GAMIFICATION_EVENTS.TRANSACTION_CREATED,
        userId,
        data: eventSummary(committed),
        timestamp: nowIso(),
      });
      return committed;
    },

    list(userId, filters) {
      const result = transactions.listForUser(userId, filters);
      return {
        data: result.rows.map(publicTransaction),
        pagination: {
          page: filters.page,
          pageSize: filters.pageSize,
          total: result.total,
          totalPages: Math.ceil(result.total / filters.pageSize),
        },
      };
    },

    get(userId, transactionId, includeDeleted) {
      return (
        publicTransaction(transactions.findByIdForUser(userId, transactionId, includeDeleted)) ??
        (() => {
          throw httpError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found.');
        })()
      );
    },

    async update(userId, transactionId, body) {
      const committed = db.transaction(() => {
        const current = requireOwned(userId, transactionId, true);
        if (current.deletedAt)
          throw httpError(409, 'TRANSACTION_DELETED', 'Deleted transactions cannot be edited.');
        const timezone = requireTimezone(userId);
        const targetType = body.type ?? current.type;
        const targetCategoryId = body.categoryId ?? current.categoryId;
        const targetDate = body.transactionDate ?? current.transactionDate;
        validateCategory(categories, userId, targetCategoryId, targetType);
        validateTransactionDate(targetDate, timezone);

        const desired = {
          type: targetType,
          categoryId: targetCategoryId,
          transactionDate: targetDate,
          ...(body.amountPaise === undefined ? {} : { amountPaise: body.amountPaise }),
          ...(body.description === undefined
            ? {}
            : { description: body.description?.trim() || null }),
        };
        const changed = Object.fromEntries(
          CHANGEABLE_FIELDS.filter(
            (field) => desired[field] !== undefined && desired[field] !== current[field],
          ).map((field) => [field, desired[field]]),
        );
        const changedFields = Object.keys(changed);
        if (!changedFields.length)
          return { transaction: publicTransaction(current), before: null, changedFields: [] };

        const before = publicTransaction(current);
        const updatedAt = nowIso();
        transactions.updateOwned({ userId, id: transactionId, changes: changed, updatedAt });
        const after = publicTransaction(transactions.findByIdForUser(userId, transactionId));
        audits.insert({
          transactionId,
          userId,
          action: 'update',
          before,
          after,
          changedFields,
          reason: auditReason(body.reason),
          createdAt: updatedAt,
        });
        return { transaction: after, before, changedFields };
      })();

      if (committed.changedFields.length) {
        await emitSafely({
          event: GAMIFICATION_EVENTS.TRANSACTION_UPDATED,
          userId,
          data: {
            ...eventSummary(committed.transaction),
            changedFields: committed.changedFields,
            before: eventSummary(committed.before),
            after: eventSummary(committed.transaction),
          },
          timestamp: nowIso(),
        });
      }
      return committed.transaction;
    },

    async delete(userId, transactionId) {
      const committed = db.transaction(() => {
        const current = requireOwned(userId, transactionId, true);
        if (current.deletedAt)
          throw httpError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found.');
        const before = publicTransaction(current);
        const deletedAt = nowIso();
        transactions.softDelete({ userId, id: transactionId, deletedAt });
        audits.insert({
          transactionId,
          userId,
          action: 'delete',
          before,
          after: null,
          changedFields: ['deletedAt'],
          reason: null,
          createdAt: deletedAt,
        });
        return before;
      })();

      await emitSafely({
        event: GAMIFICATION_EVENTS.TRANSACTION_DELETED,
        userId,
        data: eventSummary(committed),
        timestamp: nowIso(),
      });
    },

    restore(userId, transactionId) {
      return db.transaction(() => {
        const current = requireOwned(userId, transactionId, true);
        if (!current.deletedAt) {
          throw httpError(409, 'TRANSACTION_NOT_DELETED', 'This transaction is not deleted.');
        }
        const before = publicTransaction(current);
        const restoredAt = nowIso();
        categories.restoreForTransaction(userId, current.categoryId);
        transactions.restore({ userId, id: transactionId, updatedAt: restoredAt });
        const after = publicTransaction(transactions.findByIdForUser(userId, transactionId));
        audits.insert({
          transactionId,
          userId,
          action: 'restore',
          before,
          after,
          changedFields: ['deletedAt'],
          reason: null,
          createdAt: restoredAt,
        });
        return after;
      })();
    },

    history(userId, transactionId) {
      requireOwned(userId, transactionId, true);
      return audits.listForTransaction(userId, transactionId);
    },
  };
}
