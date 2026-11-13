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

export function messageForReason(reasonCode, details = {}) {
  const base = templates[reasonCode] ?? 'Your XP balance changed.';
  if (reasonCode === 'LIMIT_NOW_EXCEEDED' && details.limitPaise !== undefined) {
    return `${base} The period limit was ${details.limitAmount ?? formatINR(Number(details.limitPaise))}.`;
  }
  return base;
}

export function knownReasonCodes() { return Object.keys(templates); }

