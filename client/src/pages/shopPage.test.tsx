// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ShopPage } from './ShopPage';
import { queryClient } from '../services/queryClient';

describe('ShopPage', () => {
  afterEach(() => { queryClient.clear(); vi.unstubAllGlobals(); });

  it('shows XP balance, item gates and the freeze quota', async () => {
    queryClient.clear();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => ({ ok: true, status: 200, json: async () => String(input).endsWith('/purchases') ? { data: [] } : {
      level: 2, spendableXp: 90, freezes: { inventory: 1, inventoryCap: 2, quotaRemaining: 3 },
      items: [
        { slug: 'freeze', type: 'FREEZE', costXp: 150, minLevel: 1, owned: false, available: true },
        { slug: 'theme_midnight', type: 'THEME', costXp: 200, minLevel: 3, owned: false, available: false },
      ],
    } } as Response)));
    render(<QueryClientProvider client={queryClient}><MemoryRouter><ShopPage /></MemoryRouter></QueryClientProvider>);
    await waitFor(() => expect(screen.getByText('90 XP')).toBeTruthy());
    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(screen.getByText('3 purchases left in the rolling 30-day window')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Level 3 required/ })).toBeTruthy();
  });
});
