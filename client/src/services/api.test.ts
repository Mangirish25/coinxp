import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, ApiError } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('apiFetch', () => {
  it('returns parsed JSON for successful responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    await expect(apiFetch<{ ok: boolean }>('/api/health')).resolves.toEqual({ ok: true });
  });

  it('normalizes the server error shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: { code: 'NOPE', message: 'Unavailable' } }), {
            status: 503,
          }),
        ),
    );
    await expect(apiFetch('/api/health')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'NOPE',
      message: 'Unavailable',
    } satisfies Partial<ApiError>);
  });
});
