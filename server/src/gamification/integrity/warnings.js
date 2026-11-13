function crossed(spent, budget, thresholdBps, units) {
  if (spent > budget) return 'EXCEEDED';
  if (budget === 0) return null;
  return BigInt(spent) * BigInt(units.basisPoints) >= BigInt(budget) * BigInt(thresholdBps) ? 'NEAR' : null;
}

export function buildBudgetWarnings({ daily, monthly, today, monthStatus, config }) {
  const policy = config.integrity.warnings;
  const result = [];
  const dailyState = daily.limitPaise === null ? null : crossed(daily.spentPaise,daily.limitPaise,policy.dailyNearBps,config.units);
  if (dailyState) result.push({
    code:`BUDGET_DAILY_${dailyState}`,kind:'WARNING',dedupeKey:`WARN:daily:daily_limit:-:${today}:${dailyState.toLowerCase()}`,
    data:{scope:'daily_limit',period:today,budgetPaise:daily.limitPaise,spentPaise:daily.spentPaise},
  });
  const total = monthly.monthlyTotal;
  const month = monthly.month;
  const monthState = total?.budgetPaise === null || !total ? null : crossed(total.spentPaise,total.budgetPaise,policy.monthlyNearBps,config.units);
  if (monthState) result.push({
    code:`BUDGET_MONTHLY_${monthState}`,kind:'WARNING',dedupeKey:`WARN:monthly:monthly_total:-:${month}:${monthState.toLowerCase()}`,
    data:{scope:'monthly_total',period:month,budgetPaise:total.budgetPaise,spentPaise:total.spentPaise},
  });
  for (const category of monthly.categories) {
    const state = crossed(category.spentPaise,category.budgetPaise,policy.categoryNearBps,config.units);
    if (state) result.push({
      code:`BUDGET_CATEGORY_${state}`,kind:'WARNING',dedupeKey:`WARN:category:category_monthly:${category.categoryId}:${month}:${state.toLowerCase()}`,
      data:{scope:'category_monthly',categoryId:category.categoryId,period:month,budgetPaise:category.budgetPaise,spentPaise:category.spentPaise},
    });
  }
  if (policy.pace.enabled && month === monthStatus.currentMonth && total?.budgetPaise > 0 && monthStatus.daysElapsed >= policy.pace.minElapsedDays
      && total.spentPaise <= total.budgetPaise
      && BigInt(total.spentPaise) * BigInt(monthly.daysInMonth) * BigInt(config.units.basisPoints)
        >= BigInt(total.budgetPaise) * BigInt(monthStatus.daysElapsed) * BigInt(policy.pace.projectedOverBps)) {
    result.push({code:'BUDGET_PACE_RISK',kind:'WARNING',dedupeKey:`WARN:pace:monthly_total:-:${month}:pace`,
      data:{scope:'monthly_total',period:month,budgetPaise:total.budgetPaise,spentPaise:total.spentPaise}});
  }
  return result;
}
