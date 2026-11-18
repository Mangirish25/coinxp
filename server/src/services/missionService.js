import { daysBetween } from '../gamification/rewards/metrics.js';
import { eligibleTemplates, chooseMissionTemplate } from '../gamification/rewards/missionAssignment.js';
import { localDateAt, localInstantToUtc, monthOf, weekBounds, weekKey } from '../gamification/dateMath.js';
import { httpError } from '../utils/httpError.js';

const slots = ['DAILY', 'WEEKLY', 'MONTHLY'];

export function createMissionService({ repository, facts, config, clock, localDate }) {
  function slotKey(slot, date) {
    if (slot === 'DAILY') return date;
    if (slot === 'WEEKLY') return weekKey(date);
    return monthOf(date);
  }

  function materialize(userId, slot, periodKey) {
    const existing = repository.rows(userId, slot, periodKey);
    if (existing.length) return existing[0];
    const user = facts.user(userId);
    if (!user) throw httpError(404, 'USER_NOT_FOUND', 'User not found.');
    const date = slot === 'DAILY' ? periodKey : slot === 'WEEKLY' ? weekBounds(periodKey).start : `${periodKey}-01`;
    const periodStart = localInstantToUtc(date, config.settlement.cutoffLocalHour, user.timezone);
    const ageAtStart = daysBetween(localDateAt(user.createdAt, user.timezone), date, config.units);
    if (ageAtStart < config.rewards.missions.minAccountAgeDays) return null;
    const templates = config.rewards.missions.templates.filter((template) => template.slot === slot);
    const eligibilityFacts = repository.assignmentFacts(userId, date, periodStart);
    const eligible = eligibleTemplates(templates, { accountAgeDays: ageAtStart, facts: eligibilityFacts, completedTemplates: repository.completedTemplates(userId) });
    const previousTemplateId = repository.previousTemplate(userId, slot, periodKey);
    const picked = chooseMissionTemplate({ templates: eligible, userId, slot, periodKey, generationSeq: 0, previousTemplateId });
    if (!picked) return null;
    const assignedAt = clock.now().toISOString();
    const params = { ...(picked.params ?? {}), eligibilitySnapshot: eligibilityFacts, catalogVersion: config.rewards.catalogVersion };
    repository.insert({ userId, slot, periodKey, templateId: picked.id, generationSeq: 0, params, assignedAt });
    return repository.rows(userId, slot, periodKey)[0] ?? null;
  }

  function current(userId) {
    const date = localDate(userId);
    return { data: slots.map((slot) => materialize(userId, slot, slotKey(slot, date))).filter(Boolean) };
  }

  return { current, materialize };
}
