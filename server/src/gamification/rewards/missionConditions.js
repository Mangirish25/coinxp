import { effectiveBudgetFromHistory, transactionFactsAsOf } from '../asOf.js';
import { localDateAt, monthEnd, monthOf, shiftDate } from '../dateMath.js';

const outcomeConditions = new Set(['COUNTED_BUDGET_DAYS_AT_LEAST', 'COUNTED_BUDGET_DAYS_IMPROVED']);

function daysInclusive(from, to, units) {
  const dayMilliseconds = units.hoursPerDay * units.minutesPerHour * units.secondsPerMinute * units.millisecondsPerSecond;
  return Math.floor((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / dayMilliseconds) + 1;
}

export function requiresOutcomePass(condition) { return outcomeConditions.has(condition); }

export function missionPeriod(slot, periodKey) {
  if (slot === 'DAILY') return { from: periodKey, to: periodKey };
  if (slot === 'WEEKLY') {
    const [year, week] = periodKey.split('-W').map(Number);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const weekday = jan4.getUTCDay() || 7;
    jan4.setUTCDate(jan4.getUTCDate() - weekday + 1 + (week - 1) * 7);
    const from = jan4.toISOString().slice(0, 10);
    const toDate = new Date(jan4); toDate.setUTCDate(toDate.getUTCDate() + 6);
    return { from, to: toDate.toISOString().slice(0, 10) };
  }
  return { from: `${periodKey}-01`, to: monthEnd(periodKey) };
}

export function missionConditionPasses({ mission, template, facts, previousCount = 0, timezone, cutoff, minimumPaise, units }) {
  const { from, to } = missionPeriod(mission.slot, mission.periodKey);
  const trackedDates = new Set(facts.tracked.map(({ date }) => date));
  const live = transactionFactsAsOf(facts.auditRows, from, to, cutoff, minimumPaise).filter(({ live: isLive }) => isLive);
  const categoryName = new Map(facts.categories.map(({ id, name }) => [id, name]));
  const categorized = live.filter(({ categoryId }) => categoryName.get(categoryId) !== 'Other');
  const params = template.params ?? {};
  switch (template.condition) {
    case 'DAILY_LIMIT_SET_ON_DAY':
    case 'CATEGORY_BUDGET_SET_ON_DAY': {
      const scope = template.condition === 'DAILY_LIMIT_SET_ON_DAY' ? 'daily_limit' : 'category_monthly';
      const start = facts.periodStart;
      return facts.budgetHistory.some((row) => row.scope === scope && row.action !== 'delete' && row.createdAt >= start && row.createdAt <= cutoff);
    }
    case 'ALL_LIVE_CATEGORIZED':
      return live.length > 0 && live.every(({ categoryId }) => categoryName.get(categoryId) !== 'Other');
    case 'LIVE_EXPENSE_HAS_NOTE':
      return live.some(({ type, description }) => type === 'expense' && (description?.trim().length ?? 0) >= (params.minChars ?? 3));
    case 'TRACKED_DAYS_AT_LEAST':
      return trackedDates.size >= (params.days ?? 0);
    case 'REVIEWS_AT_LEAST':
      return facts.reviews.length >= (params.days ?? 0);
    case 'TRACKED_SHARE_AT_LEAST': {
      const dayCount = daysInclusive(from, to, units);
      return BigInt(trackedDates.size) * BigInt(units.basisPoints) >= BigInt(params.shareBps ?? 0) * BigInt(dayCount);
    }
    case 'COUNTED_BUDGET_DAYS_AT_LEAST':
      return facts.countedBudgetDays.length >= (params.days ?? 0);
    case 'CATEGORIZED_SHARE_AT_LEAST':
      return live.length >= (params.minTx ?? 0) && BigInt(categorized.length) * BigInt(units.basisPoints) >= BigInt(params.shareBps ?? 0) * BigInt(live.length);
    case 'NEXT_MONTH_BUDGET_SET_LAST_7_DAYS': {
      const nextMonth = shiftDate(`${monthOf(from)}-01`, 32).slice(0, 7);
      const currentMonthEnd = monthEnd(monthOf(from));
      const earliest = shiftDate(currentMonthEnd, -6);
      const budget = effectiveBudgetFromHistory(facts.budgetHistory, 'monthly_total', null, nextMonth, cutoff);
      return Boolean(budget && budget.month === nextMonth && budget.amountPaise > 0 && facts.budgetHistory.some((row) =>
        row.scope === 'monthly_total' && row.month === nextMonth && row.action !== 'delete' && localDateAt(row.createdAt, timezone) >= earliest && localDateAt(row.createdAt, timezone) <= currentMonthEnd));
    }
    case 'COUNTED_BUDGET_DAYS_IMPROVED': {
      const n = daysInclusive(from, to, units);
      const cap = Number((BigInt(params.capShareBps ?? 0) * BigInt(n) + BigInt(units.basisPoints - 1)) / BigInt(units.basisPoints));
      return facts.countedBudgetDays.length >= Math.min(previousCount + (params.by ?? 0), cap);
    }
    default:
      return false;
  }
}
