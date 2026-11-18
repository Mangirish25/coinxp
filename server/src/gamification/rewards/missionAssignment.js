import { createHash } from 'node:crypto';

export function deterministicRank({ userId, slot, periodKey, templateId, generationSeq }) {
  const input = `${userId}|${slot}|${periodKey}|${templateId}|${generationSeq}`;
  return createHash('sha256').update(input).digest().readUInt32BE(0);
}

export function eligibleTemplates(templates, { accountAgeDays, facts, completedTemplates }) {
  const predicates = {
    NO_DAILY_LIMIT_AT_START: () => !facts.dailyLimitAtStart,
    DAILY_LIMIT_AT_START: () => Boolean(facts.dailyLimitAtStart),
    NO_CATEGORY_BUDGET_EVER: () => !facts.hasEverSetCategoryBudget,
    ACTIVE_LAST_7: () => facts.trackedLast7 >= 1,
    TRACKED_7_OF_LAST_14: () => facts.trackedLast14 >= 7,
    HAS_PRIOR_MONTHLY_BUDGET: () => Boolean(facts.hasPriorMonthlyBudget),
    ELIGIBLE_DAYS_14: () => facts.eligibleDays14 >= 14,
    PREV_MONTH_TRACKED_10: () => facts.previousMonthTracked >= 10,
    ACCOUNT_AGE_2: () => accountAgeDays >= 2,
    ACCOUNT_AGE_14: () => accountAgeDays >= 14,
  };
  return templates.filter((template) =>
    (!template.oncePerUser || !completedTemplates.has(template.id)) &&
    (template.eligibility ?? []).every((eligibility) => predicates[eligibility]?.() ?? false));
}

export function chooseMissionTemplate({ templates, userId, slot, periodKey, generationSeq, previousTemplateId }) {
  if (!templates.length) return null;
  const priority = Math.max(...templates.map(({ priority }) => priority));
  let candidates = templates.filter((template) => template.priority === priority);
  if (candidates.length > 1 && previousTemplateId) {
    const withoutPrevious = candidates.filter(({ id }) => id !== previousTemplateId);
    if (withoutPrevious.length) candidates = withoutPrevious;
  }
  return candidates.map((template) => ({ template, rank: deterministicRank({ userId, slot, periodKey, templateId: template.id, generationSeq }) }))
    .sort((left, right) => left.rank - right.rank || left.template.id.localeCompare(right.template.id))[0].template;
}
