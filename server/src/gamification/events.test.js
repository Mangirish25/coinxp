import { describe, expect, it } from 'vitest';
import { GAMIFICATION_EVENTS } from './events.js';

describe('EVT-011 reward event vocabulary', () => {
  it('exports every Part 9 reward event once', () => {
    const expected = [
      'BADGE_UNLOCKED',
      'BADGE_REVOKED',
      'MISSION_ASSIGNED',
      'MISSION_COMPLETED',
      'MISSION_EXPIRED',
      'MISSION_REROLLED',
      'CHALLENGE_STARTED',
      'CHALLENGE_DAY_EVALUATED',
      'CHALLENGE_COMPLETED',
      'CHALLENGE_FAILED',
      'CHALLENGE_ABANDONED',
      'CHALLENGE_CANCELLED',
      'PURCHASE_COMPLETED',
      'PURCHASE_REFUNDED',
      'COSMETIC_EQUIPPED',
    ];
    const eventNames = Object.values(GAMIFICATION_EVENTS);
    expected.forEach((eventName) => expect(eventNames).toContain(eventName));
    expect(new Set(eventNames).size).toBe(eventNames.length);
  });
});
