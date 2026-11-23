// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CelebrationHost } from './CelebrationHost';

describe('NOT-005 celebration host', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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

  it('NOT-005: announces the level and title change from the payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL | Request) => {
      if (String(_url).includes('/api/notifications/preferences')) return { ok: true, status: 200, json: async () => ({ preferences: [] }) } as Response;
      return { ok: true, status: 200, json: async () => ({ data: [
        { id: 9, kind: 'PROGRESS', code: 'LEVEL_UP', createdAt: '2026-11-23T00:00:00.000Z',
          data: { fromLevel: 1, toLevel: 2, titleBefore: 'Beginner', titleAfter: 'Budget Explorer', titleChanged: true, lifetimeXp: 105, progressBps: 250 } },
      ] }) } as Response;
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><CelebrationHost userId={1} /></QueryClientProvider>);
    expect(await screen.findByRole('dialog', { name: 'Level 2 · Budget Explorer' })).toBeTruthy();
    expect(screen.getByText('Level 1 to 2. Your title changed from Beginner to Budget Explorer.')).toBeTruthy();
    client.clear();
  });

  it('NOT-005: keeps muted reward notices readable in the static recap', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL | Request) => {
      if (String(_url).includes('/api/notifications/preferences')) return { ok: true, status: 200, json: async () => ({ preferences: [{ category: 'REWARD', enabled: false }] }) } as Response;
      if (String(_url).includes('/api/celebrations/claim')) return { ok: true, status: 200, json: async () => ({ data: [
        { id: 11, kind: 'REWARD', code: 'MISSION_COMPLETED', createdAt: '2026-11-23T00:00:00.000Z', data: { xp: 10 } },
      ] }) } as Response;
      return { ok: true, status: 200, json: async () => ({ acknowledgedThrough: 11 }) } as Response;
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><CelebrationHost userId={1} /></QueryClientProvider>);
    expect(await screen.findByRole('dialog', { name: 'While you were away' })).toBeTruthy();
    expect(screen.getByText('You completed a mission.')).toBeTruthy();
    expect(screen.getByRole('dialog').className).not.toContain('celebration-enter');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    client.clear();
  });

  it('MOT-004: focuses Skip when available and restores focus to the trigger', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL | Request) => {
      if (String(_url).includes('/api/notifications/preferences')) return { ok: true, status: 200, json: async () => ({ preferences: [] }) } as Response;
      if (String(_url).includes('/api/celebrations/claim')) return { ok: true, status: 200, json: async () => ({ data: [
        { id: 12, kind: 'PROGRESS', code: 'LEVEL_UP', createdAt: '2026-11-23T00:00:00.000Z', data: { fromLevel: 1, toLevel: 2, titleChanged: true, titleBefore: 'Beginner', titleAfter: 'Explorer' } },
      ] }) } as Response;
      return { ok: true, status: 200, json: async () => ({ acknowledgedThrough: 12 }) } as Response;
    }));
    const trigger = document.createElement('button');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'auto';
    document.body.append(trigger);
    trigger.focus();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><CelebrationHost userId={1} /></QueryClientProvider>);
    expect(await screen.findByRole('dialog', { name: 'Level 2 · Explorer' })).toBeTruthy();
    await waitFor(() => expect(document.body.style.overflow).toBe('hidden'));
    const skip = screen.getByRole('button', { name: 'Skip' }) as HTMLButtonElement;
    expect(skip.disabled).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(skip), { timeout: 1500 });
    fireEvent.click(skip);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    await waitFor(() => expect(document.body.style.overflow).toBe('auto'));
    document.body.style.overflow = previousOverflow;
    trigger.remove();
    client.clear();
  });
});
