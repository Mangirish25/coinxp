// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BadgesPage } from './BadgesPage';
import { queryClient } from '../services/queryClient';

describe('BadgesPage', () => {
  afterEach(() => { queryClient.clear(); vi.unstubAllGlobals(); });

  it('shows tier progress and keeps hidden badge names out of the response UI', async () => {
    queryClient.clear();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ catalogVersion: '1.0.0', hiddenRemaining: 2, data: [
      { slug: 'first_step', category: 'TRACKING', type: 'ONE_TIME', rarity: 'COMMON', hidden: false, metric: 'FIRST_LIVE_TX', metricValue: 1, timesEarned: 0, tiers: [{ tier: 1, threshold: 1, rarity: 'COMMON', xp: 10, status: 'ACTIVE', achievedOn: '2026-11-18' }] },
      { slug: 'steady_tracker', category: 'TRACKING', type: 'PROGRESSIVE', rarity: null, hidden: false, metric: 'XP_TRACKED_DAYS', metricValue: 7, timesEarned: 0, tiers: [{ tier: 1, threshold: 14, rarity: 'COMMON', xp: 10, status: 'LOCKED', achievedOn: null }] },
    ] }) } as Response)));
    render(<QueryClientProvider client={queryClient}><MemoryRouter><BadgesPage /></MemoryRouter></QueryClientProvider>);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'First Step' })).toBeTruthy());
    expect(screen.getByText('2 hidden badges remain undiscovered.')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Steady Tracker next tier' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /View First Step, Bronze, common/ }));
    expect(await screen.findByRole('dialog', { name: 'First Step badge details' })).toBeTruthy();
    expect(screen.getAllByRole('img', { name: 'First Step, Bronze, common' }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/comeback|fresh start/i)).toBeNull();
  });
});
