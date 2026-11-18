import rules from '../gamification/rules.config.js';
import { createIntegrityRepository } from '../repositories/integrityRepository.js';
import { httpError } from '../utils/httpError.js';
import { integrityMessageForCode } from '../gamification/messages.js';
import { CELEBRATION_CONFIG } from '../config/celebrationConfig.js';

export function createIntegrityService({ db, clock = { now: () => new Date() } }) {
  const repository = createIntegrityRepository(db);
  const now = () => clock.now();
  return {
    notices(userId, filters) {
      const result = repository.listNotices(userId, filters);
      const priority = rules.rewards.notifications.priority;
      return { data: result.data.map((notice) => ({ ...notice, message: integrityMessageForCode(notice.code,notice.data) }))
        .sort((a,b) => priority[b.kind]-priority[a.kind] || b.id-a.id),
      pagination: { page: filters.page, pageSize: filters.pageSize, total: result.total, totalPages: Math.ceil(result.total/filters.pageSize) } };
    },
    pendingCelebrations(userId) {
      const result = repository.listNotices(userId, { page: 1, pageSize: 100, unreadOnly: true });
      const codes = new Set(CELEBRATION_CONFIG.codes);
      return { data: result.data.filter(({ code }) => codes.has(code)) };
    },
    claimCelebrations(userId) {
      const instant = now();
      const rows = repository.claimCelebrations(userId, instant.toISOString(),
        new Date(instant.getTime() + CELEBRATION_CONFIG.claimLeaseMs).toISOString(),
        CELEBRATION_CONFIG.claimBatchSize, CELEBRATION_CONFIG.codes);
      return { data: rows };
    },
    acknowledge(userId, upToId) { repository.acknowledgeThrough(userId, upToId, now().toISOString()); return { acknowledgedThrough: upToId }; },
    status(userId) {
      const instant = now(); const hold = repository.activeHold(userId, instant.toISOString());
      const since = new Date(instant.getTime()-rules.integrity.review.appealWindowDays*rules.units.hoursPerDay*rules.units.minutesPerHour*rules.units.secondsPerMinute*rules.units.millisecondsPerSecond).toISOString();
      const eligibleCase = repository.eligibleAppealCase(userId,instant.toISOString(),since);
      return { holdActive: Boolean(hold), scope: hold?.scope ?? null, holdUntil: hold?.holdUntil ?? null,
        canAppeal: Boolean(eligibleCase), unreadNotices: repository.unreadCount(userId), lastNoticeCode: repository.latestNotice(userId) };
    },
    appeal(userId, message) {
      const instant = now(); const current = instant.toISOString();
      const since = new Date(instant.getTime()-rules.integrity.review.appealWindowDays*rules.units.hoursPerDay*rules.units.minutesPerHour*rules.units.secondsPerMinute*rules.units.millisecondsPerSecond).toISOString();
      const eligible = repository.eligibleAppealCase(userId,current,since);
      if (!eligible) throw httpError(409,'APPEAL_NOT_AVAILABLE','There is no eligible case to appeal.');
      if (eligible.appealCount > 0) throw httpError(409,'APPEAL_ALREADY_SENT','An appeal has already been submitted for this case.');
      const applied = repository.recordAppeal({ caseId: eligible.id, message, userId, createdAt: current, idempotencyKey: `CASE${eligible.id}:APPEAL:1` });
      if (!applied) throw httpError(409,'APPEAL_ALREADY_SENT','An appeal has already been submitted for this case.');
      repository.insertNotice({ userId, kind:'REVIEW', code:'APPEAL_RECEIVED', dedupeKey:`CASE${eligible.id}:APPEAL_RECEIVED`, createdAt:current, data:{ caseId:eligible.id } });
      return { caseId: eligible.id, received: true };
    },
  };
}

