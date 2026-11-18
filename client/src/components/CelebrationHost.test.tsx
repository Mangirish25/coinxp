// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CelebrationHost } from './CelebrationHost';

describe('NOT-005 celebration host', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows a text recap, acknowledges it, and does not expose financial fields', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (String(_url).includes('/api/notifications/preferences')) return { ok: true, status: 200, json: async () => ({ preferences: [] }) } as Response;
      if (String(_url).includes('/api/celebrations/claim')) return { ok: true, status: 200, json: async () => ({ data: [
        { id: 7, kind: 'REWARD', code: 'MISSION_COMPLETED', createdAt: '2026-11-18T00:00:00.000Z', data: { xp: 15, amountPaise: 999999 } },
      ] }) } as Response;
      expect(init?.method).toBe('POST');
      return { ok: true, status: 200, json: async () => ({ acknowledgedThrough: 7 }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><CelebrationHost userId={1} /></QueryClientProvider>);
    expect(await screen.findByRole('dialog', { name: 'While you were away' })).toBeTruthy();
    expect(screen.getByText('+15 XP')).toBeTruthy();
    expect(screen.queryByText(/999999/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/celebrations/claim'), expect.objectContaining({ method: 'POST' }));
    client.clear();
  });
});
