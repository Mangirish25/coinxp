import rules from '../gamification/rules.config.js';
import { createIntegrityRepository } from '../repositories/integrityRepository.js';
import { httpError } from '../utils/httpError.js';

const NOTICE_MESSAGES = Object.freeze({
  INTEGRITY_NUDGE: 'We noticed some unusual activity around reward records. Your financial features are unaffected.',
  HOLD_STARTED: 'Some outcome rewards are temporarily paused while we review activity. Your financial features are unaffected. You can submit an appeal.',
  APPEAL_RECEIVED: 'Your appeal has been received for review.',
  XP_REVERSED_LIMIT: 'A previously earned reward changed after a spending correction.',
  XP_REINSTATED: 'A previously reversed reward has been reinstated.',
  CORRECTION_NO_XP_CHANGE: 'Thanks for correcting this entry. No XP changed.',
  SETTLED_FINAL: 'This settled period is final; the correction did not change its reward.',
});

export function createIntegrityService({ db, clock = { now: () => new Date() } }) {
  const repository = createIntegrityRepository(db);
  const now = () => clock.now();
  return {
    notices(userId, filters) {
      const result = repository.listNotices(userId, filters);
      const priority = { RESTRICTION: 5, XP_CHANGE: 4, WARNING: 3, REVIEW: 2, INFO: 1 };
      return { data: result.data.map((notice) => ({ ...notice, message: NOTICE_MESSAGES[notice.code] ?? 'There is an update for your CoinXP account.' }))
        .sort((a,b) => priority[b.kind]-priority[a.kind] || b.id-a.id),
      pagination: { page: filters.page, pageSize: filters.pageSize, total: result.total, totalPages: Math.ceil(result.total/filters.pageSize) } };
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
      const applied = repository.recordAppeal({ caseId: eligible.id, message, userId, createdAt: current, idempotencyKey: `CASE${eligible.id}:APPEAL:1` });
      if (!applied) throw httpError(409,'APPEAL_ALREADY_SENT','An appeal has already been submitted for this case.');
      repository.insertNotice({ userId, kind:'REVIEW', code:'APPEAL_RECEIVED', dedupeKey:`CASE${eligible.id}:APPEAL_RECEIVED`, createdAt:current, data:{ caseId:eligible.id } });
      return { caseId: eligible.id, received: true };
    },
  };
}

export { NOTICE_MESSAGES };
