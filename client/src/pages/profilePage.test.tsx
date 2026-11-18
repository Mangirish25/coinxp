// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ProfilePage } from './ProfilePage';
import { queryClient } from '../services/queryClient';

describe('ProfilePage', () => {
  afterEach(() => { queryClient.clear(); vi.unstubAllGlobals(); });

  it('shows private progress and exposes only unlocked showcase badges and owned cosmetics', async () => {
    queryClient.clear();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({
      id: 1, displayName: 'Profile User', memberSince: '2026-11-01', level: 4, title: 'Financial Strategist', lifetimeXp: 600, spendableXp: 400,
      currentStreak: 3, longestStreak: 7, badgeCounts: { COMMON: 1 }, badges: [{ slug: 'first_step', tier: 1, rarity: 'COMMON', achievedOn: '2026-11-02' }],
      showcase: [], equippedTheme: null, equippedFrame: 'frame_bronze', ownedCosmetics: [{ itemSlug: 'frame_bronze', acquiredAt: '2026-11-03', itemType: 'FRAME' }],
      completedChallenges: 1, recentActivity: [{ id: 1, kind: 'BADGE', occurredAt: '2026-11-02T00:00:00.000Z', summaryCode: 'BADGE_UNLOCKED' }],
    }) } as Response)));
    render(<QueryClientProvider client={queryClient}><MemoryRouter><ProfilePage /></MemoryRouter></QueryClientProvider>);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Financial Strategist' })).toBeTruthy());
    expect(screen.getByText('Lifetime XP')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Show First Step' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Bronze frame' })).toBeTruthy();
    expect(screen.getByText('Badge Unlocked')).toBeTruthy();
  });
});
