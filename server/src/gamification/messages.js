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
});

const integrityMessages = Object.freeze({
  INTEGRITY_NUDGE: 'We noticed some unusual activity around reward records. Your financial features are unaffected.',
  HOLD_STARTED: 'Some outcome rewards are temporarily paused while we review activity. Your financial features are unaffected. You can submit an appeal.',
  APPEAL_RECEIVED: 'Your appeal has been received for review.',
  XP_REVERSED_LIMIT: 'A previously earned reward changed after a spending correction.',
  XP_REINSTATED: 'A previously reversed reward has been reinstated.',
  CORRECTION_NO_XP_CHANGE: 'Thanks for correcting this entry. No XP changed.',
  SETTLED_FINAL: 'This settled period is final; the correction did not change its reward.',
});

export function integrityMessageForCode(code) {
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

