// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';
import { queryClient } from '../services/queryClient';
import { StreaksPage } from './StreaksPage';

describe('StreaksPage', () => {
  afterEach(() => { queryClient.clear(); vi.unstubAllGlobals(); });

  it('renders streak status, accessible calendar labels, milestones, and freeze history', async () => {
    queryClient.clear();
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const month = date.slice(0, 7);
    const first = `${month}-01`;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.endsWith('/api/auth/me')
        ? { id: 1, email: 'streak@example.com', displayName: 'Streak user', timezone: 'Asia/Kolkata', createdAt: '2026-01-01T00:00:00.000Z' }
        : url.endsWith('/api/streaks')
          ? { tracking: { status: 'ACTIVE', current: 3, longest: 7, trackedToday: true, atRisk: false, freezeWouldProtect: true, settlingDate: null, nextMilestone: { days: 7, xp: 25 }, milestones: [3], comeback: null }, secondary: {}, freezes: { inventory: 1, cap: 2 }, through: date, recentEvents: [], week: [], lastPeriod: { date, status: 'COUNTED' }, milestones: { reached: [3], next: { days: 7, xp: 25 } } }
          : url.includes('/tracking/calendar')
            ? { from: first, to: url.match(/to=([^&]+)/)?.[1], days: [{ date: first, status: 'COUNTED', secondary: {} }] }
            : url.includes('/freezes') ? { inventory: 1, cap: 2, data: [{ id: 1, delta: 1, reason: 'STARTER', effectiveAt: '2026-01-03T00:00:00.000Z', effectiveLocalDate: first, message: 'Starter freeze earned' }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }
              : { tracking: { milestones: [{ days: 3, xp: 10 }, { days: 7, xp: 25 }] } };
      return { ok: true, status: 200, json: async () => body };
    }));
    render(<QueryClientProvider client={queryClient}><AuthProvider><MemoryRouter><StreaksPage /></MemoryRouter></AuthProvider></QueryClientProvider>);
    await waitFor(() => expect(screen.getByText('3 day tracking streak')).toBeTruthy());
    expect(screen.getByRole('gridcell', { name: `${first}: Counted` })).toBeTruthy();
    expect(screen.getByText('Starter freeze earned')).toBeTruthy();
    expect(screen.getByText('7 tracked days')).toBeTruthy();
  });
});
