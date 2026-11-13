import { GAMIFICATION_EVENTS } from '../gamification/events.js';
import { TRANSACTION_CONFIG } from '../config/transactionConstants.js';
import { createAuditRepository } from '../repositories/auditRepository.js';
import { createCategoryRepository } from '../repositories/categoryRepository.js';
import { createTransactionRepository } from '../repositories/transactionRepository.js';
import { createUserRepository } from '../repositories/userRepository.js';
import { httpError } from '../utils/httpError.js';
import { paiseToRupees } from '../utils/money.js';
import { localDateAt } from '../gamification/dateMath.js';
import { createHash } from 'node:crypto';
import { createRequestIdempotencyRepository } from '../repositories/requestIdempotencyRepository.js';

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
    createdLocalDate: row.createdLocalDate,
    createdTimezone: row.createdTimezone,
  };
}

function shiftDate(dateString, { days = 0, years = 0 } = {}) {
  const [year, month, day] = dateString.split('-').map(Number);
  const targetYear = year + years;
  const lastDay = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();
  const date = new Date(Date.UTC(targetYear, month - 1, Math.min(day, lastDay) + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function validateTransactionDate(transactionDate, timezone, instant = new Date()) {
  const today = localDateAt(instant, timezone);
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
  eventHandler,
  gameEngine,
  logger = console,
}) {
  const transactions = createTransactionRepository(db);
  const audits = createAuditRepository(db);
  const categories = createCategoryRepository(db);
  const users = createUserRepository(db);
  const idempotency = createRequestIdempotencyRepository(db);
  const currentIso = () => (gameEngine?.clock.now() ?? new Date()).toISOString();

  async function emitSafely(event) {
    if (!eventHandler) return;
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

  function enqueue(eventType, userId, timezone, date, data) {
    return gameEngine?.enqueue({ eventType, userId, timezone, localDate: date, occurredAt: currentIso(), data });
  }

  async function processCommitted(userId, eventType, data, date, timezone) {
    if (gameEngine) {
      try {
        const result = gameEngine.processUser(userId);
        await emitSafely({ event: eventType, userId, data, timestamp: currentIso(), localDate: date, timezone });
        return result;
      }
      catch (error) { try { logger.error?.(`Gamification processing failed for ${eventType}.`, error); } catch { /* logger failures are ignored */ } return null; }
    }
    await emitSafely({ event: eventType, userId, data, timestamp: currentIso(), localDate: date, timezone });
    return null;
  }

  return {
    async create(userId, body, idempotencyKey) {
      const requestHash = idempotencyKey ? createHash('sha256').update(JSON.stringify(body)).digest('hex') : null;
      if (idempotencyKey) {
        const previous = idempotency.find(userId, idempotencyKey);
        if (previous) {
          if (previous.requestHash !== requestHash) throw httpError(422, 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used with a different request.');
          return { transaction: previous.response, status: 200 };
        }
      }
      const timezone = requireTimezone(userId);
      validateTransactionDate(body.transactionDate, timezone, gameEngine?.clock.now() ?? new Date());
      validateCategory(categories, userId, body.categoryId, body.type);
      const createdAt = currentIso();
      const createdLocalDate = localDateAt(new Date(createdAt), timezone);
      const committed = db.transaction(() => {
        const id = transactions.create({
          ...body,
          description: body.description?.trim() || null,
          userId,
          createdAt,
          createdLocalDate,
          createdTimezone: timezone,
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
        enqueue('TRANSACTION_CREATED', userId, timezone, createdLocalDate, { transactionId: id, after });
        if (idempotencyKey) idempotency.insert({ userId, key: idempotencyKey, requestHash, responseStatus: 201, response: after, createdAt });
        return after;
      })();
      const gamification = await processCommitted(userId, GAMIFICATION_EVENTS.TRANSACTION_CREATED, eventSummary(committed), createdLocalDate, timezone);
      return { transaction: { ...committed, gamification }, status: 201 };
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
        validateTransactionDate(targetDate, timezone, gameEngine?.clock.now() ?? new Date());

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
        const updatedAt = currentIso();
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
        enqueue('TRANSACTION_UPDATED', userId, timezone, localDateAt(new Date(updatedAt), timezone), {
          transactionId, before, after, changedFields,
        });
        return { transaction: after, before, changedFields };
      })();

      let gamification = null;
      if (committed.changedFields.length) {
        gamification = await processCommitted(userId, GAMIFICATION_EVENTS.TRANSACTION_UPDATED, {
          ...eventSummary(committed.transaction), changedFields: committed.changedFields,
          before: eventSummary(committed.before), after: eventSummary(committed.transaction),
        }, committed.transaction.createdLocalDate ?? committed.transaction.transactionDate, requireTimezone(userId));
      }
      return { ...committed.transaction, ...(committed.changedFields.length ? { gamification } : {}) };
    },

    async delete(userId, transactionId) {
      const committed = db.transaction(() => {
        const current = requireOwned(userId, transactionId, true);
        if (current.deletedAt)
          throw httpError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found.');
        const before = publicTransaction(current);
        const deletedAt = currentIso();
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
        enqueue('TRANSACTION_DELETED', userId, requireTimezone(userId), localDateAt(new Date(deletedAt), requireTimezone(userId)), { transactionId, before });
        return before;
      })();

      await processCommitted(userId, GAMIFICATION_EVENTS.TRANSACTION_DELETED, eventSummary(committed), committed.transactionDate, requireTimezone(userId));
    },

    async restore(userId, transactionId) {
      const timezone = requireTimezone(userId);
      const committed = db.transaction(() => {
        const current = requireOwned(userId, transactionId, true);
        if (!current.deletedAt) {
          throw httpError(409, 'TRANSACTION_NOT_DELETED', 'This transaction is not deleted.');
        }
        const before = publicTransaction(current);
        const restoredAt = currentIso();
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
        enqueue('TRANSACTION_RESTORED', userId, timezone, localDateAt(new Date(restoredAt), timezone), { transactionId, before, after });
        return after;
      })();
      const gamification = await processCommitted(userId, GAMIFICATION_EVENTS.TRANSACTION_RESTORED, eventSummary(committed), committed.transactionDate, timezone);
      return { ...committed, gamification };
    },

    history(userId, transactionId) {
      requireOwned(userId, transactionId, true);
      return audits.listForTransaction(userId, transactionId);
    },
  };
}
