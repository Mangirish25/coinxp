import { formatINR } from '../utils/money.js';

const templates = Object.freeze({
  TRANSACTION_TRACKED: 'You logged a qualifying transaction on the day it happened.',
  DAILY_REVIEW_COMPLETED: 'You completed your daily money review.',
  DAILY_ADHERENCE: 'Your tracked spending stayed within the daily limit set for that day.',
  WEEKLY_CONSISTENCY: 'You tracked money on enough eligible days this week.',
  MONTHLY_BUDGET_COMPLETION: 'Your tracked spending stayed within the monthly budget set at the start of the month.',
  STREAK_MILESTONE: 'You reached a tracking streak milestone.',
  FIRST_TRANSACTION: 'You recorded your first qualifying transaction.',
  FIRST_BUDGET: 'You set your first budget.',
  FIRST_REVIEW: 'You completed your first daily review.',
  RECORD_REMOVED: 'A transaction change means this XP is no longer earned.',
  RECORD_RESTORED: 'Restoring a transaction made this XP eligible again.',
  LIMIT_NOW_EXCEEDED: 'Current spending is above the limit that was in effect for that period.',
  NO_LONGER_TRACKED: 'This period no longer meets the tracking requirements.',
  LEVEL_UP: 'You reached a new level.',
  ADMIN_ADJUSTMENT: 'An administrator adjusted your XP balance.',
  INTEGRITY_CLAWBACK: 'An integrity adjustment removed XP tied to a reviewed case.',
});

const integrityMessages = Object.freeze({
  BADGE_UNLOCKED: 'You unlocked a badge. See your profile for your progress.',
  BADGE_BACKFILL_SUMMARY: 'Your badge progress has been updated from your existing activity.',
  BADGE_REVOKED: 'A badge was removed after an administrator review.',
  MISSION_ASSIGNED: 'A new mission is ready for you.',
  MISSION_COMPLETED: 'You completed a mission and earned XP.',
  MISSION_EXPIRED: 'A mission period has ended. A new mission will arrive in its next cycle.',
  CHALLENGE_STARTED: 'Your challenge is scheduled to begin soon.',
  CHALLENGE_COMPLETED: 'You completed a challenge and earned XP.',
  CHALLENGE_FAILED: 'Your challenge period has ended.',
  CHALLENGE_CANCELLED: 'Your pending challenge was cancelled and its XP was refunded.',
  CHALLENGE_ABANDONED: 'Your active challenge was abandoned.',
  PURCHASE_COMPLETED: 'Your XP shop purchase is complete.',
  PURCHASE_REFUNDED: 'Your XP shop purchase was refunded.',
  INTEGRITY_NUDGE: 'We noticed some unusual activity around reward records. Your financial features are unaffected.',
  HOLD_STARTED: 'Some outcome rewards are temporarily paused while we review activity. Your financial features are unaffected. You can submit an appeal.',
  APPEAL_RECEIVED: 'Your appeal has been received for review.',
  XP_REVERSED_LIMIT: 'A previously earned reward changed after a spending correction.',
  XP_REINSTATED: 'A previously reversed reward has been reinstated.',
  CORRECTION_NO_XP_CHANGE: 'Thanks for correcting this entry. No XP changed.',
  SETTLED_FINAL: 'This settled period is final; the correction did not change its reward.',
  CASE_RESOLVED_WARNING: 'A review is complete. Your rewards can continue normally.',
  HOLD_RELEASED: 'The reward hold has been released. Eligible rewards are being recalculated.',
  CASE_UPDATED: 'There is an update to a reviewed reward record.',
  INTEGRITY_ADJUSTED: 'An administrator reviewed and adjusted your XP. Your financial features are unaffected.',
});

export function integrityMessageForCode(code, data = {}) {
  if (code === 'CLAWBACK_APPLIED') return `${data.totalXp ?? 0} XP was adjusted after a review. Financial features are unaffected.`;
  if (code.startsWith('BUDGET_')) {
    const daily = data.scope === 'daily_limit';
    const subject = daily ? "today's limit" : data.scope === 'category_monthly' ? 'this category budget' : 'this month’s budget';
    const budgetPaise = Number(data.budgetPaise ?? 0);
    const spentPaise = Number(data.spentPaise ?? 0);
    if (code.endsWith('_EXCEEDED')) return `Spending is ${formatINR(spentPaise-budgetPaise)} over ${subject} (${formatINR(budgetPaise)}).`;
    if (code.endsWith('_NEAR')) {
      const usedPercent = budgetPaise === 0 ? 0 : Number((BigInt(spentPaise)*100n)/BigInt(budgetPaise));
      return `You've used ${usedPercent}% of ${subject} (${formatINR(budgetPaise)}).`;
    }
    if (code === 'BUDGET_PACE_RISK') return `Spending is moving faster than the monthly budget pace. ${formatINR(spentPaise)} used of ${formatINR(budgetPaise)} so far.`;
  }
  return integrityMessages[code] ?? 'There is an update for your CoinXP account.';
}

export function messageForReason(reasonCode, details = {}) {
  const base = templates[reasonCode] ?? 'Your XP balance changed.';
  if (reasonCode === 'LIMIT_NOW_EXCEEDED' && details.limitPaise !== undefined) {
    return `${base} The period limit was ${details.limitAmount ?? formatINR(Number(details.limitPaise))}.`;
  }
  return base;
}

export function knownReasonCodes() { return Object.keys(templates); }

