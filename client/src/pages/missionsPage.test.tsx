// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MissionsPage } from './MissionsPage';
import { queryClient } from '../services/queryClient';

describe('MissionsPage', () => {
  afterEach(() => { queryClient.clear(); vi.unstubAllGlobals(); });

  it('renders assigned missions by cadence and period', async () => {
    queryClient.clear();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [
      { id: 3, slot: 'DAILY', periodKey: '2026-11-18', templateId: 'dm_set_limit', status: 'ASSIGNED', generationSeq: 0, params: {}, assignedAt: '2026-11-18T00:00:00.000Z', closedAt: null, xpAwarded: 0 },
    ] }) } as Response)));
    render(<QueryClientProvider client={queryClient}><MemoryRouter><MissionsPage /></MemoryRouter></QueryClientProvider>);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Set Limit' })).toBeTruthy());
    expect(screen.getByText('Daily · 2026-11-18')).toBeTruthy();
    expect(screen.getByText('In progress · verified at period close')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reroll mission' })).toBeTruthy();
  });
});
