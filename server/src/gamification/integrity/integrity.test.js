import { describe, expect, it } from 'vitest';
import rules from '../rules.config.js';
import { runDetectors } from './detectors/index.js';
import { responseLadder, scoreIntegrity } from './risk.js';

describe('Part 8 detector registry and response scoring', () => {
  it('ABU-007: detector passes are deterministic and preserve date-only evidence', () => {
    const input = { windowKey:'2026-11-13', apiRateLimitRejections:10, rateLimitRejections:rules.integrity.detectors.API_BURST.rejections,
      evidence:{API_BURST:{dates:['2026-11-13'],ids:[4]}} };
    expect(runDetectors(input,rules)).toEqual(runDetectors(input,rules));
    expect(runDetectors(input,rules)).toContainEqual({code:'API_BURST',windowKey:'2026-11-13',evidence:{dates:['2026-11-13'],ids:[4]}});
  });

  it('ABU-009: caps code instances and requires two eligible signals for a hold', () => {
    const flags = [
      ...Array.from({length:5},(_,index)=>({code:'LIMIT_RESCUE_PATTERN',status:'OPEN',id:index})),
      ...Array.from({length:5},(_,index)=>({code:'MICRO_ENTRY_PATTERN',status:'OPEN',id:index+5})),
    ];
    expect(scoreIntegrity(flags,rules).score).toBe(12);
    const passed = responseLadder({flags,accountCreatedAt:'2026-10-01T00:00:00.000Z',now:new Date('2026-11-13T00:00:00.000Z'),autoHoldsLast90Days:0},rules);
    expect(passed).toMatchObject({nudge:true,openCase:true,autoHold:true,distinctHoldEligible:2});
    const oneSignal = responseLadder({flags:flags.filter((flag)=>flag.code==='LIMIT_RESCUE_PATTERN'),accountCreatedAt:'2026-10-01T00:00:00.000Z',now:new Date('2026-11-13T00:00:00.000Z'),autoHoldsLast90Days:0},rules);
    expect(oneSignal.autoHold).toBe(false);
  });
});
