import { daysBetween } from '../gamification/rewards/metrics.js';
import { eligibleTemplates, chooseMissionTemplate } from '../gamification/rewards/missionAssignment.js';
import { dayCutoff } from '../gamification/asOf.js';
import { missionConditionPasses, missionPeriod, requiresOutcomePass } from '../gamification/rewards/missionConditions.js';
import { localDateAt, localInstantToUtc, monthEnd, monthOf, shiftDate, weekBounds, weekKey } from '../gamification/dateMath.js';
import { httpError } from '../utils/httpError.js';

const slots = ['DAILY', 'WEEKLY', 'MONTHLY'];

export function createMissionService({ repository, facts, config, clock, localDate, reconcileKey, publish, insertNotice }) {
  function slotKey(slot, date) {
    if (slot === 'DAILY') return date;
    if (slot === 'WEEKLY') return weekKey(date);
    return monthOf(date);
  }

  function materialize(userId, slot, periodKey) {
    const existing = repository.rows(userId, slot, periodKey);
    if (existing.length) return existing.find(({ status }) => status !== 'REPLACED') ?? existing[0];
    return assign(userId, slot, periodKey, 0);
  }

  function assign(userId, slot, periodKey, generationSeq, excludedTemplateId = null) {
    const user = facts.user(userId);
    if (!user) throw httpError(404, 'USER_NOT_FOUND', 'User not found.');
    const date = slot === 'DAILY' ? periodKey : slot === 'WEEKLY' ? weekBounds(periodKey).start : `${periodKey}-01`;
    const periodStart = localInstantToUtc(date, config.settlement.cutoffLocalHour, user.timezone);
    const ageAtStart = daysBetween(localDateAt(user.createdAt, user.timezone), date, config.units);
    if (ageAtStart < config.rewards.missions.minAccountAgeDays) return null;
    const templates = config.rewards.missions.templates.filter((template) => template.slot === slot);
    const eligibilityFacts = repository.assignmentFacts(userId, date, periodStart);
    const eligible = eligibleTemplates(templates, { accountAgeDays: ageAtStart, facts: eligibilityFacts, completedTemplates: repository.completedTemplates(userId) })
      .filter(({ id }) => id !== excludedTemplateId);
    const previousTemplateId = excludedTemplateId ?? repository.previousTemplate(userId, slot, periodKey);
    const picked = chooseMissionTemplate({ templates: eligible, userId, slot, periodKey, generationSeq, previousTemplateId });
    if (!picked) return null;
    const assignedAt = clock.now().toISOString();
    const params = { ...(picked.params ?? {}), eligibilitySnapshot: eligibilityFacts, catalogVersion: config.rewards.catalogVersion };
    repository.insert({ userId, slot, periodKey, templateId: picked.id, generationSeq, params, assignedAt });
    return repository.rows(userId, slot, periodKey)[0] ?? null;
  }

  function current(userId) {
    const date = localDate(userId);
    return { data: slots.map((slot) => materialize(userId, slot, slotKey(slot, date))).filter(Boolean) };
  }

  function reroll(userId, requestedSlot) {
    const slot = String(requestedSlot).toUpperCase();
    if (!slots.includes(slot)) throw httpError(400, 'INVALID_MISSION_SLOT', 'Choose a daily, weekly or monthly mission slot.');
    const allowance = config.rewards.missions.rerolls[slot] ?? 0;
    const date = localDate(userId);
    const periodKey = slotKey(slot, date);
    const rows = repository.rows(userId, slot, periodKey);
    const currentMission = rows.find(({ status }) => status !== 'REPLACED');
    if (!currentMission || currentMission.status !== 'ASSIGNED' || currentMission.generationSeq >= allowance) {
      throw httpError(409, 'REROLL_NOT_AVAILABLE', 'This mission cannot be rerolled again in this period.');
    }
    return repository.transaction(() => {
      if (!repository.replaceAssigned(userId, currentMission.id)) throw httpError(409, 'REROLL_NOT_AVAILABLE', 'This mission can no longer be rerolled.');
      const replacement = assign(userId, slot, periodKey, currentMission.generationSeq + 1, currentMission.templateId);
      if (!replacement) throw httpError(409, 'REROLL_NOT_AVAILABLE', 'No replacement mission is available.');
      return replacement;
    });
  }

  function advance(userId, throughDate, hasOutcomeHold) {
    const user = facts.user(userId);
    if (!user) return [];
    const results = [];
    for (const mission of repository.closeCandidates(userId)) {
      const { from, to } = missionPeriod(mission.slot, mission.periodKey);
      if (to > throughDate) continue;
      const cutoff = dayCutoff(to, user.timezone, config, localInstantToUtc);
      const holdActive = mission.status === 'DEFERRED'
        ? hasOutcomeHold(userId, clock.now().toISOString())
        : hasOutcomeHold(userId, cutoff);
      if (mission.status === 'DEFERRED' && holdActive) continue;
      const template = config.rewards.missions.templates.find(({ id }) => id === mission.templateId);
      if (!template) continue;
      if (requiresOutcomePass(template.condition) && holdActive) {
        repository.closeMission(userId, mission.id, 'DEFERRED', cutoff, 0);
        results.push({ id: mission.id, status: 'DEFERRED' });
        continue;
      }
      const context = repository.periodFacts(userId, from, to, cutoff);
      context.periodStart = localInstantToUtc(from, config.settlement.cutoffLocalHour, user.timezone);
      const previousMonth = monthOf(shiftDate(`${monthOf(from)}-01`, -1));
      const previousCount = template.condition === 'COUNTED_BUDGET_DAYS_IMPROVED'
        ? repository.countedBudgetDayCount(userId, `${previousMonth}-01`, monthEnd(previousMonth))
        : 0;
      const passed = missionConditionPasses({ mission, template, facts: context, previousCount, timezone: user.timezone,
        cutoff, minimumPaise: config.tracking.minQualifyingAmountPaise, units: config.units });
      const status = passed ? 'COMPLETED' : 'EXPIRED';
      const committed = repository.transaction(() => {
        const entry = passed ? reconcileKey({ userId, key: `MIS-004:${mission.id}`, ruleId: 'MIS-004', periodType: 'once',
          periodKey: String(mission.id), desired: true, value: config.rewards.missions.xp[mission.slot], reasonCode: 'MISSION_COMPLETED' }) : null;
        const xpAwarded = entry?.lifetimeDelta ?? 0;
        if (!repository.closeMission(userId, mission.id, status, cutoff, xpAwarded)) return false;
        const data = { missionId: mission.id, templateId: mission.templateId, slot: mission.slot, periodKey: mission.periodKey, xpAwarded };
        const eventType = passed ? 'MISSION_COMPLETED' : 'MISSION_EXPIRED';
        publish(eventType, userId, data, `MISSION:${mission.id}:${status}`);
        if (passed) repository.insertActivity({ userId, refId: mission.id, occurredAt: cutoff, data });
        insertNotice({ userId, kind: 'PROGRESS', code: eventType, data, dedupeKey: `MISSION:${mission.id}:NOTICE:${status}`, createdAt: cutoff });
        return true;
      });
      if (committed) results.push({ id: mission.id, status });
    }
    return results;
  }

  function releaseDeferred(userId) {
    const released = [];
    for (const mission of repository.completedUnpaid(userId)) {
      const xp = config.rewards.missions.xp[mission.slot];
      const entry = reconcileKey({ userId, key: `MIS-004:${mission.id}`, ruleId: 'MIS-004', periodType: 'once',
        periodKey: String(mission.id), desired: true, value: xp, reasonCode: 'MISSION_COMPLETED' });
      if (entry && repository.setMissionXp(userId, mission.id, entry.lifetimeDelta)) released.push(mission.id);
    }
    return released;
  }

  return { current, materialize, reroll, advance, releaseDeferred };
}
