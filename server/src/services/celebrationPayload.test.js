import { describe, expect, it } from 'vitest';
import { sanitizeCelebrationPayload } from './celebrationPayload.js';

describe('celebration presentation payloads', () => {
  it('returns an empty object for unknown and inherited event names', () => {
    expect(sanitizeCelebrationPayload('UNKNOWN_EVENT', { amountPaise: 100 })).toEqual({});
    expect(sanitizeCelebrationPayload('toString', { amountPaise: 100 })).toEqual({});
  });

  it('drops malformed nested presentation records and rejects non-integer numbers', () => {
    expect(sanitizeCelebrationPayload('DAY_RECAP', {
      xpDelta: 1.5,
      entries: [{ ruleId: 'XP-001', delta: 10, reasonCode: 'REVIEW', amountPaise: 500 }, null],
    })).toEqual({ entries: [{ ruleId: 'XP-001', delta: 10, reasonCode: 'REVIEW' }] });
  });
});
