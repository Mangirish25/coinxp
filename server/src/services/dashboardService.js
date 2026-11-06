import { ANALYTICS_CONFIG } from '../config/analyticsConfig.js';
import { createAnalyticsRepository } from '../repositories/analyticsRepository.js';
import { createUserRepository } from '../repositories/userRepository.js';
import { createBudgetService } from './budgetService.js';
import {
  averageDailyPaise,
  calculateExpenseChangeBps,
  calculateSavingsRateBps,
  calculateShareBps,
} from './analyticsCalculator.js';
import { daysInMonth } from './budgetCalculator.js';
import { formatINR } from '../utils/money.js';
import { todayInTimezone } from '../utils/dates.js';
import { httpError } from '../utils/httpError.js';

function safePaise(value) {
  const result = BigInt(value);
  if (result > BigInt(Number.MAX_SAFE_INTEGER) || result < BigInt(Number.MIN_SAFE_INTEGER))
    throw new RangeError('Money total exceeds the safe integer paise range.');
  return Number(result);
}

function monthBounds(month) {
  return { start: `${month}-01`, end: `${month}-${String(daysInMonth(month)).padStart(2, '0')}` };
}

function shiftMonth(month, offset) {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, number - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function createDashboardService({ db }) {
  const repository = createAnalyticsRepository(db);
  const users = createUserRepository(db);
  const budgets = createBudgetService({ db });

  return {
    summary(userId, requestedMonth) {
      const timezone = users.findTimezone(userId);
      if (!timezone) throw httpError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
      const today = todayInTimezone(timezone);
      const currentMonth = today.slice(0, 7);
      const month = requestedMonth ?? currentMonth;
      const [year, number] = currentMonth.split('-').map(Number);
      const [targetYear, targetNumber] = month.split('-').map(Number);
      const monthDelta = (targetYear - year) * 12 + targetNumber - number;
      if (Math.abs(monthDelta) > ANALYTICS_CONFIG.monthWindow)
        throw httpError(
          422,
          'MONTH_OUT_OF_RANGE',
          'Dashboard month must be within 12 months of the current month.',
        );
      const current = monthBounds(month);
      const previous = monthBounds(shiftMonth(month, -1));
      const totals = repository.dashboardTotals(userId, {
        monthStart: current.start,
        monthEnd: current.end,
        previousStart: previous.start,
        previousEnd: previous.end,
      });
      const monthNetPaise = safePaise(
        BigInt(totals.monthIncomePaise) - BigInt(totals.monthExpensePaise),
      );
      const totalBalancePaise = safePaise(
        BigInt(totals.allIncomePaise) - BigInt(totals.allExpensePaise),
      );
      const [recentRows, categoryRows, budgetStatus, todayStatus] = [
        repository.recentTransactions(userId, ANALYTICS_CONFIG.recentTransactions),
        repository.topExpenseCategories(
          userId,
          current.start,
          current.end,
          ANALYTICS_CONFIG.topCategories,
        ),
        budgets.status(userId, month),
        budgets.dailyStatus(userId),
      ];
      const daysElapsed =
        month < currentMonth
          ? daysInMonth(month)
          : month > currentMonth
            ? 0
            : Number(today.slice(-2));
      const recentTransactions = recentRows.map((row) => ({
        ...row,
        amount: formatINR(row.amountPaise),
      }));
      const topCategories = categoryRows.map((row) => ({
        ...row,
        spent: formatINR(row.spentPaise),
        shareBps: calculateShareBps(row.spentPaise, totals.monthExpensePaise) ?? 0,
      }));
      const monthlyTotal = budgetStatus.monthlyTotal;
      const remainingPaise = monthlyTotal?.remainingPaise ?? null;
      const safeDailySpendPaise =
        month === currentMonth && monthlyTotal ? budgetStatus.safeDailySpendPaise : null;
      return {
        month,
        isCurrentMonth: month === currentMonth,
        totalBalancePaise,
        totalBalance: formatINR(totalBalancePaise),
        monthIncomePaise: totals.monthIncomePaise,
        monthIncome: formatINR(totals.monthIncomePaise),
        monthExpensePaise: totals.monthExpensePaise,
        monthExpense: formatINR(totals.monthExpensePaise),
        monthNetPaise,
        monthNet: formatINR(monthNetPaise),
        savingsRateBps: calculateSavingsRateBps(monthNetPaise, totals.monthIncomePaise),
        comparison: {
          incomeDeltaPaise: safePaise(
            BigInt(totals.monthIncomePaise) - BigInt(totals.previousIncomePaise),
          ),
          income: formatINR(
            safePaise(BigInt(totals.monthIncomePaise) - BigInt(totals.previousIncomePaise)),
          ),
          expenseDeltaPaise: safePaise(
            BigInt(totals.monthExpensePaise) - BigInt(totals.previousExpensePaise),
          ),
          expense: formatINR(
            safePaise(BigInt(totals.monthExpensePaise) - BigInt(totals.previousExpensePaise)),
          ),
          expenseChangeBps: calculateExpenseChangeBps(
            totals.monthExpensePaise,
            totals.previousExpensePaise,
          ),
        },
        budget: {
          monthlyTotal,
          remainingPaise,
          remaining: remainingPaise === null ? null : formatINR(remainingPaise),
          safeDailySpendPaise,
          safeDailySpend: safeDailySpendPaise === null ? null : formatINR(safeDailySpendPaise),
        },
        today: {
          date: todayStatus.date,
          spentPaise: todayStatus.spentPaise,
          spent: todayStatus.spent,
          dailyLimitPaise: todayStatus.limitPaise,
          dailyLimit: todayStatus.limit,
          remainingPaise: todayStatus.remainingPaise,
          remaining: todayStatus.remaining,
          percentUsed: todayStatus.percentUsed,
          status: todayStatus.status,
        },
        averageDailySpendPaise: averageDailyPaise(totals.monthExpensePaise, daysElapsed),
        averageDailySpend: formatINR(averageDailyPaise(totals.monthExpensePaise, daysElapsed)),
        transactionCount: totals.transactionCount,
        recentTransactions,
        topCategories,
      };
    },
  };
}
