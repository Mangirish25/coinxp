import { ANALYTICS_CONFIG } from '../config/analyticsConfig.js';
import { createAnalyticsRepository } from '../repositories/analyticsRepository.js';
import { createBudgetRepository } from '../repositories/budgetRepository.js';
import { createUserRepository } from '../repositories/userRepository.js';
import {
  allocateShares,
  calculateSavingsRateBps,
  safePaiseDelta,
  selectBusiestAndCheapest,
  zeroFillDays,
  zeroFillMonths,
} from './analyticsCalculator.js';
import { daysInMonth, resolveBudget } from './budgetCalculator.js';
import { createBudgetService } from './budgetService.js';
import { formatINR } from '../utils/money.js';
import { todayInTimezone } from '../utils/dates.js';
import { httpError } from '../utils/httpError.js';

function monthBounds(month) {
  return { from: `${month}-01`, to: `${month}-${String(daysInMonth(month)).padStart(2, '0')}` };
}

function shiftMonth(month, offset) {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function validateRange(from, to, maximumDays) {
  if (from > to)
    throw httpError(400, 'INVALID_RANGE', 'The start date must be on or before the end date.');
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1;
  if (days > maximumDays)
    throw httpError(400, 'RANGE_TOO_LARGE', `Date range cannot exceed ${maximumDays} days.`);
}

function sumSafe(values) {
  const total = values.reduce((sum, value) => sum + BigInt(value), 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError('Aggregate exceeds the safe integer paise range.');
  return Number(total);
}

export function createAnalyticsService({ db }) {
  const repository = createAnalyticsRepository(db);
  const budgetRows = createBudgetRepository(db);
  const users = createUserRepository(db);
  const budgets = createBudgetService({ db });

  function timezoneFor(userId) {
    const timezone = users.findTimezone(userId);
    if (!timezone) throw httpError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
    return timezone;
  }

  function range(userId, input, maximumDays) {
    const today = todayInTimezone(timezoneFor(userId));
    const current = monthBounds(today.slice(0, 7));
    const from = input.from ?? current.from;
    const to = input.to ?? current.to;
    validateRange(from, to, maximumDays);
    return { from, to };
  }

  function validateMonthWindow(month, timezone) {
    const current = todayInTimezone(timezone).slice(0, 7);
    const [year, number] = current.split('-').map(Number);
    const [targetYear, targetNumber] = month.split('-').map(Number);
    if (Math.abs((targetYear - year) * 12 + targetNumber - number) > ANALYTICS_CONFIG.monthWindow)
      throw httpError(
        422,
        'MONTH_OUT_OF_RANGE',
        'Dashboard month must be within 12 months of the current month.',
      );
  }

  return {
    categoryBreakdown(userId, input) {
      const { from, to } = range(userId, input, ANALYTICS_CONFIG.categoryBreakdownMaxDays);
      const rows = repository.categoryBreakdown(userId, from, to, input.type);
      const totalPaise = sumSafe(rows.map((row) => row.amountPaise));
      const items = allocateShares(rows, {
        amount: (row) => row.amountPaise,
        id: (row) => row.categoryId,
      }).map((row) => ({ ...row, amount: formatINR(row.amountPaise) }));
      return {
        from,
        to,
        type: input.type,
        total: { amountPaise: totalPaise, amount: formatINR(totalPaise) },
        items,
      };
    },

    dailySpending(userId, input) {
      const { from, to } = range(userId, input, ANALYTICS_CONFIG.dailySpendingMaxDays);
      const rows = repository.dailyAggregates(userId, from, to);
      const configured = budgetRows.listForUser(userId);
      const dailyLimits = new Map();
      const start = new Date(`${from}T00:00:00.000Z`);
      const end = new Date(`${to}T00:00:00.000Z`);
      for (let day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
        const date = day.toISOString().slice(0, 10);
        const selected = resolveBudget(configured, 'daily_limit', null, date.slice(0, 7));
        if (selected) dailyLimits.set(date, selected.amountPaise);
      }
      const days = zeroFillDays(from, to, rows, dailyLimits).map((row) => ({
        ...row,
        expense: formatINR(row.expensePaise),
        income: formatINR(row.incomePaise),
        dailyLimit: row.dailyLimitPaise === null ? null : formatINR(row.dailyLimitPaise),
      }));
      const maxDay = selectBusiestAndCheapest(days).busiestDay;
      return {
        from,
        to,
        days,
        maxDay: maxDay ? { ...maxDay, expense: formatINR(maxDay.expensePaise) } : null,
      };
    },

    incomeVsExpense(userId, months) {
      const timezone = timezoneFor(userId);
      const currentMonth = todayInTimezone(timezone).slice(0, 7);
      const fromMonth = shiftMonth(currentMonth, 1 - months);
      const from = `${fromMonth}-01`;
      const to = monthBounds(currentMonth).to;
      const rows = repository.monthlyAggregates(userId, from, to);
      return zeroFillMonths(fromMonth, months, rows).map((row) => ({
        ...row,
        income: formatINR(row.incomePaise),
        expense: formatINR(row.expensePaise),
        net: formatINR(row.netPaise),
      }));
    },

    monthlyReport(userId, month) {
      const timezone = timezoneFor(userId);
      const currentMonth = todayInTimezone(timezone).slice(0, 7);
      validateMonthWindow(month, timezone);
      const current = monthBounds(month);
      const previousMonth = shiftMonth(month, -1);
      const previous = monthBounds(previousMonth);
      const totals = repository.dashboardTotals(userId, {
        monthStart: current.from,
        monthEnd: current.to,
        previousStart: previous.from,
        previousEnd: previous.to,
      });
      const netPaise = safePaiseDelta(totals.monthIncomePaise, totals.monthExpensePaise);
      const comparisons = repository
        .categoryExpenseComparisons(userId, current.from, current.to, previous.from, previous.to)
        .map((row) => ({ ...row, deltaPaise: safePaiseDelta(row.currentPaise, row.previousPaise) }))
        .filter((row) => row.deltaPaise !== 0);
      const biggestIncreases = comparisons
        .filter((row) => row.deltaPaise > 0)
        .sort((a, b) => b.deltaPaise - a.deltaPaise || a.name.localeCompare(b.name))
        .slice(0, ANALYTICS_CONFIG.reportCategoryChanges);
      const biggestDecreases = comparisons
        .filter((row) => row.deltaPaise < 0)
        .sort((a, b) => a.deltaPaise - b.deltaPaise || a.name.localeCompare(b.name))
        .slice(0, ANALYTICS_CONFIG.reportCategoryChanges);
      const categoryChange = (row) => ({
        categoryId: row.categoryId,
        name: row.name,
        icon: row.icon,
        currentPaise: row.currentPaise,
        current: formatINR(row.currentPaise),
        previousPaise: row.previousPaise,
        previous: formatINR(row.previousPaise),
        deltaPaise: row.deltaPaise,
        delta: formatINR(row.deltaPaise),
      });
      const dailyRows = repository.dailyAggregates(userId, current.from, current.to);
      const days = zeroFillDays(current.from, current.to, dailyRows);
      const { busiestDay, cheapestNonZeroDay } = selectBusiestAndCheapest(days);
      const topTransactions = repository
        .topExpenseTransactions(
          userId,
          current.from,
          current.to,
          ANALYTICS_CONFIG.reportTopTransactions,
        )
        .map((row) => ({ ...row, amount: formatINR(row.amountPaise) }));
      const today = todayInTimezone(timezone);
      const daysElapsed =
        month < currentMonth
          ? daysInMonth(month)
          : month > currentMonth
            ? 0
            : Number(today.slice(-2));
      const loggedThrough =
        month === currentMonth ? today : month < currentMonth ? current.to : `${month}-01`;
      const daysWithTransactions =
        month > currentMonth ? 0 : repository.trackingDays(userId, current.from, loggedThrough);
      const budget = budgets.status(userId, month);
      return {
        month,
        totals: {
          incomePaise: totals.monthIncomePaise,
          income: formatINR(totals.monthIncomePaise),
          expensePaise: totals.monthExpensePaise,
          expense: formatINR(totals.monthExpensePaise),
          netPaise,
          net: formatINR(netPaise),
          savingsRateBps: calculateSavingsRateBps(netPaise, totals.monthIncomePaise),
        },
        comparison: {
          biggestIncreases: biggestIncreases.map(categoryChange),
          biggestDecreases: biggestDecreases.map(categoryChange),
        },
        topExpenseTransactions: topTransactions,
        busiestDay: busiestDay
          ? { ...busiestDay, expense: formatINR(busiestDay.expensePaise) }
          : null,
        cheapestNonZeroDay: cheapestNonZeroDay
          ? { ...cheapestNonZeroDay, expense: formatINR(cheapestNonZeroDay.expensePaise) }
          : null,
        budgetOutcome: { monthlyTotal: budget.monthlyTotal, categories: budget.categories },
        trackingConsistency: { daysWithTransactions, daysElapsed },
      };
    },
  };
}
