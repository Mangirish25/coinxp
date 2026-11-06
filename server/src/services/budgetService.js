import { BUDGET_CONFIG } from '../config/budgetConfig.js';
import { createBudgetHistoryRepository } from '../repositories/budgetHistoryRepository.js';
import { createBudgetRepository } from '../repositories/budgetRepository.js';
import { createCategoryRepository } from '../repositories/categoryRepository.js';
import { createTransactionRepository } from '../repositories/transactionRepository.js';
import { createUserRepository } from '../repositories/userRepository.js';
import {
  calculateBudget,
  calculateMonthProgress,
  calculateSafeDailySpend,
  daysInMonth,
} from './budgetCalculator.js';
import { nowIso, todayInTimezone } from '../utils/dates.js';
import { formatINR, paiseToRupees } from '../utils/money.js';
import { httpError } from '../utils/httpError.js';

function monthEnd(month) {
  return `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
}

function effective(rows, scope, categoryId, month) {
  const candidates = rows.filter((row) => row.scope === scope && row.categoryId === categoryId);
  const exact = candidates.find((row) => row.month === month);
  if (exact) return { ...exact, source: 'month' };
  const fallback = candidates.find((row) => row.month === null);
  return fallback ? { ...fallback, source: 'default' } : null;
}

function scopeMoney(calculated) {
  return {
    budgetPaise: calculated.budgetPaise,
    budget: calculated.budgetPaise === null ? null : formatINR(calculated.budgetPaise),
    spentPaise: calculated.spentPaise,
    spent: formatINR(calculated.spentPaise),
    remainingPaise: calculated.remainingPaise,
    remaining: calculated.remainingPaise === null ? null : formatINR(calculated.remainingPaise),
    percentUsed: calculated.percentUsed,
    status: calculated.status,
  };
}

function sumSafePaise(values) {
  const total = values.reduce((sum, value) => sum + BigInt(value), 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError('Expense total exceeds the safe integer paise range.');
  return Number(total);
}

export function createBudgetService({ db }) {
  const budgets = createBudgetRepository(db);
  const history = createBudgetHistoryRepository(db);
  const categories = createCategoryRepository(db);
  const transactions = createTransactionRepository(db);
  const users = createUserRepository(db);

  function timezoneFor(userId) {
    const timezone = users.findTimezone(userId);
    if (!timezone) throw httpError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
    return timezone;
  }

  function validateMonthWindow(month, timezone) {
    if (!month) return;
    const current = todayInTimezone(timezone).slice(0, 7);
    const [year, number] = current.split('-').map(Number);
    const target = month.split('-').map(Number);
    const delta = (target[0] - year) * 12 + target[1] - number;
    if (Math.abs(delta) > BUDGET_CONFIG.monthWindow)
      throw httpError(
        422,
        'MONTH_OUT_OF_RANGE',
        'Budget month must be within 12 months of the current month.',
      );
  }

  function resolveDaily(userId, month) {
    return effective(budgets.listForUser(userId), 'daily_limit', null, month);
  }

  return {
    upsert(userId, input) {
      const timezone = timezoneFor(userId);
      validateMonthWindow(input.month, timezone);
      const categoryId = input.categoryId ?? null;
      if (input.scope === 'category_monthly') {
        if (categoryId === null)
          throw httpError(422, 'CATEGORY_REQUIRED', 'Choose an expense category.');
        const category = categories.findVisibleById(userId, categoryId);
        if (!category || category.type !== 'expense')
          throw httpError(
            422,
            'CATEGORY_NOT_ELIGIBLE',
            'Choose an expense category available to your account.',
          );
      } else if (input.categoryId !== undefined)
        throw httpError(
          422,
          'CATEGORY_NOT_ALLOWED',
          'Category is only allowed for category budgets.',
        );
      // future: budget changes may feed gamification anti-abuse (see budget_history)
      return db.transaction(() => {
        const current = budgets.findByKey(userId, input.scope, categoryId, input.month ?? null);
        if (current?.amountPaise === input.amountPaise) return current;
        const timestamp = nowIso();
        const saved = current
          ? budgets.updateAmount({
              userId,
              id: current.id,
              amountPaise: input.amountPaise,
              updatedAt: timestamp,
            })
          : budgets.insert({
              userId,
              scope: input.scope,
              categoryId,
              month: input.month ?? null,
              amountPaise: input.amountPaise,
              createdAt: timestamp,
            });
        history.insert({
          userId,
          budgetId: saved.id,
          scope: input.scope,
          categoryId,
          month: input.month ?? null,
          action: current ? 'update' : 'set',
          oldAmountPaise: current?.amountPaise ?? null,
          newAmountPaise: input.amountPaise,
          createdAt: timestamp,
        });
        return saved;
      })();
    },

    list(userId, filters) {
      return budgets
        .listForUser(userId, filters)
        .map((row) => ({ ...row, amount: paiseToRupees(row.amountPaise) }));
    },

    delete(userId, id) {
      return db.transaction(() => {
        const current = budgets.findById(userId, id);
        if (!current) throw httpError(404, 'BUDGET_NOT_FOUND', 'Budget not found.');
        const timestamp = nowIso();
        history.insert({
          userId,
          budgetId: null,
          scope: current.scope,
          categoryId: current.categoryId,
          month: current.month,
          action: 'delete',
          oldAmountPaise: current.amountPaise,
          newAmountPaise: null,
          createdAt: timestamp,
        });
        budgets.deleteOwned(userId, id);
      })();
    },

    status(userId, requestedMonth) {
      const timezone = timezoneFor(userId);
      const today = todayInTimezone(timezone);
      const month = requestedMonth ?? today.slice(0, 7);
      const progress = calculateMonthProgress(month, today);
      const from = `${month}-01`;
      const to = monthEnd(month);
      const spendRows = transactions.sumExpensesByCategory(userId, from, to);
      const spendByCategory = new Map(spendRows.map((row) => [row.categoryId, row.spentPaise]));
      const totalSpent = sumSafePaise(spendRows.map((row) => row.spentPaise));
      const configured = budgets.listForUser(userId);
      const monthly = effective(configured, 'monthly_total', null, month);
      const monthlyCalculated = calculateBudget({
        budgetPaise: monthly?.amountPaise ?? null,
        spentPaise: totalSpent,
        warningThreshold: BUDGET_CONFIG.warningThreshold,
      });
      const categoryRows = configured.filter((row) => row.scope === 'category_monthly');
      const byCategory = new Map();
      for (const row of categoryRows) {
        const previous = byCategory.get(row.categoryId) ?? {};
        previous[row.month === month ? 'month' : row.month === null ? 'default' : 'other'] = row;
        byCategory.set(row.categoryId, previous);
      }
      const effectiveCategoryBudgets = [...byCategory.entries()]
        .map(([, versions]) => versions.month ?? versions.default)
        .filter(Boolean);
      const categoryData = effectiveCategoryBudgets.map((row) => {
        const spentPaise = spendByCategory.get(row.categoryId) ?? 0;
        return {
          budgetId: row.id,
          categoryId: row.categoryId,
          name: row.categoryName ?? 'Archived category',
          icon: row.categoryIcon,
          budgetPaise: row.amountPaise,
          budget: formatINR(row.amountPaise),
          spentPaise,
          spent: formatINR(spentPaise),
          remainingPaise: row.amountPaise - spentPaise,
          remaining: formatINR(row.amountPaise - spentPaise),
          percentUsed: calculateBudget({
            budgetPaise: row.amountPaise,
            spentPaise,
            warningThreshold: BUDGET_CONFIG.warningThreshold,
          }).percentUsed,
          status: calculateBudget({
            budgetPaise: row.amountPaise,
            spentPaise,
            warningThreshold: BUDGET_CONFIG.warningThreshold,
          }).status,
          source: row.month === month ? 'month' : 'default',
        };
      });
      const budgetedCategoryIds = new Set(effectiveCategoryBudgets.map((row) => row.categoryId));
      const expenseCategories = categories.listForUser(userId, 'expense');
      const categoryById = new Map(expenseCategories.map((category) => [category.id, category]));
      const unbudgetedRows = spendRows
        .filter((row) => !budgetedCategoryIds.has(row.categoryId))
        .map((row) => {
          const category = categoryById.get(row.categoryId);
          return {
            categoryId: row.categoryId,
            name: category?.name ?? 'Archived category',
            icon: category?.icon ?? null,
            spentPaise: row.spentPaise,
            spent: formatINR(row.spentPaise),
          };
        });
      const unbudgetedPaise = sumSafePaise(unbudgetedRows.map((row) => row.spentPaise));
      const daily = effective(configured, 'daily_limit', null, month);
      const warnings = [];
      const categoryBudgetTotal = effectiveCategoryBudgets.reduce(
        (sum, row) => sum + BigInt(row.amountPaise),
        0n,
      );
      if (monthly && categoryBudgetTotal > BigInt(monthly.amountPaise))
        warnings.push({
          code: 'CATEGORY_BUDGETS_EXCEED_TOTAL',
          message: 'Category budgets add up to more than the monthly total budget.',
        });
      const result = {
        month,
        ...progress,
        monthlyTotal: monthly
          ? { ...scopeMoney(monthlyCalculated), source: monthly.source, budgetId: monthly.id }
          : null,
        categories: categoryData,
        unbudgetedSpending: {
          spentPaise: unbudgetedPaise,
          spent: formatINR(unbudgetedPaise),
          categories: unbudgetedRows,
        },
        dailyLimit: daily
          ? {
              limitPaise: daily.amountPaise,
              limit: formatINR(daily.amountPaise),
              source: daily.source,
              budgetId: daily.id,
            }
          : null,
        warnings,
      };
      if (month === today.slice(0, 7)) {
        const safe = monthly
          ? calculateSafeDailySpend(monthly.amountPaise, totalSpent, progress.daysRemaining)
          : 0;
        result.safeDailySpendPaise = safe;
        result.safeDailySpend = formatINR(safe);
      }
      return result;
    },

    dailyStatus(userId, date) {
      const timezone = timezoneFor(userId);
      const selectedDate = date ?? todayInTimezone(timezone);
      const daily = resolveDaily(userId, selectedDate.slice(0, 7));
      const spentPaise = transactions.getDailySpend(userId, selectedDate);
      const calculated = calculateBudget({
        budgetPaise: daily?.amountPaise ?? null,
        spentPaise,
        warningThreshold: BUDGET_CONFIG.warningThreshold,
      });
      return {
        date: selectedDate,
        limitPaise: daily?.amountPaise ?? null,
        limit: daily ? formatINR(daily.amountPaise) : null,
        source: daily?.source ?? null,
        spentPaise,
        spent: formatINR(spentPaise),
        remainingPaise: calculated.remainingPaise,
        remaining: calculated.remainingPaise === null ? null : formatINR(calculated.remainingPaise),
        percentUsed: calculated.percentUsed,
        status: calculated.status,
      };
    },
  };
}
