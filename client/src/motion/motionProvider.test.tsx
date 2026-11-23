// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../contexts/AuthContext';
import { StreakFlame } from '../visuals/flame/StreakFlame';
import { MotionProvider } from './MotionProvider';

describe('MOT-003 viewport and activity gated frame sampling', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('does not schedule frames until a visible ambient visual has recent user activity', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const requestFrame = vi.fn(() => 17);
    const cancelFrame = vi.fn();
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: { code: 'UNAUTHENTICATED', message: 'Sign in.' } }) }) as Response));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AuthProvider><MotionProvider>
      <StreakFlame length={30} state="ACTIVE_TRACKED" mode="FULL" quality="HIGH" />
    </MotionProvider></AuthProvider></QueryClientProvider>);

    const flame = await screen.findByRole('img', { name: /30-day tracking streak/ });
    await waitFor(() => expect(flame).toBeTruthy());
    expect(requestFrame).not.toHaveBeenCalled();
    fireEvent.pointerDown(flame);
    await waitFor(() => expect(requestFrame).toHaveBeenCalledTimes(1));
    cleanup();
    expect(cancelFrame).toHaveBeenCalledWith(17);
    client.clear();
  });
});
