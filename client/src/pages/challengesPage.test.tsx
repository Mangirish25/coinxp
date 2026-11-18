// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ChallengesPage } from './ChallengesPage';
import { queryClient } from '../services/queryClient';

describe('ChallengesPage', () => {
  afterEach(() => { queryClient.clear(); vi.unstubAllGlobals(); });

  it('shows XP costs, qualifying actions, and the active challenge progress', async () => {
    queryClient.clear();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => ({ ok: true, status: 200, json: async () => String(input).includes('/runs/')
      ? { id: 2, challengeSlug: 'discipline_7', status: 'ACTIVE', costXp: 100, purchaseId: 5, startDate: '2026-11-18', endDate: '2026-11-24', qualifyingDays: 2, requiredDays: 6, closedAt: null, xpAwarded: 0, days: [] }
      : { data: [{ slug: 'discipline_7', days: 7, requiredQualifyingDays: 6, costXp: 100, rewardXp: 75, minLevel: 2, difficulty: 'MEDIUM', requires: ['DAILY_LIMIT_AT_START'], qualify: ['XP_TRACKED', 'REVIEW_DONE', 'COUNTED_BUDGET_DAY'], eligible: false, reason: 'ACTIVE_CHALLENGE_EXISTS' }], activeRun: { id: 2, challengeSlug: 'discipline_7', status: 'ACTIVE', costXp: 100, purchaseId: 5, startDate: '2026-11-18', endDate: '2026-11-24', qualifyingDays: 2, requiredDays: 6, closedAt: null, xpAwarded: 0 }, runs: [] } } as Response)));
    render(<QueryClientProvider client={queryClient}><MemoryRouter><ChallengesPage /></MemoryRouter></QueryClientProvider>);
    await waitFor(() => expect(screen.getAllByRole('heading', { name: '7-Day Discipline' })).toHaveLength(2));
    expect(screen.getByText('2 / 6 qualifying days')).toBeTruthy();
    expect(screen.getByText('Track the day · Complete a daily review · Stay within the daily budget')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Finish or abandon your active challenge first.' })).toBeTruthy();
  });
});
