import { describe, expect, it, vi } from 'vitest';
import { originGuard } from './originGuard.js';

function invoke(req, enabled = true) {
  const next = vi.fn();
  originGuard({ enabled, origin: 'https://coinxp.example' })(req, {}, next);
  return next;
}

describe('SEC-001 production write origin check', () => {
  it('accepts an exact Origin and a matching Referer', () => {
    expect(invoke({ method: 'POST', get: () => 'https://coinxp.example' })).toHaveBeenCalledWith();
    const headers = { origin: null, referer: 'https://coinxp.example/settings' };
    expect(invoke({ method: 'PATCH', get: (key) => headers[key] })).toHaveBeenCalledWith();
  });

  it('rejects absent, malformed and foreign origins on writes', () => {
    for (const value of [null, 'https://attacker.example']) {
      const next = invoke({ method: 'DELETE', get: () => value });
      expect(next.mock.calls[0][0]).toMatchObject({ status: 403, code: 'ORIGIN_REJECTED' });
    }
    const malformed = invoke({ method: 'POST', get: (key) => key === 'referer' ? 'not a url' : null });
    expect(malformed.mock.calls[0][0]).toMatchObject({ status: 403, code: 'ORIGIN_REJECTED' });
  });

  it('leaves reads and development requests alone', () => {
    expect(invoke({ method: 'GET', get: () => null }).mock.calls[0]).toEqual([]);
    expect(invoke({ method: 'POST', get: () => null }, false).mock.calls[0]).toEqual([]);
  });
});
