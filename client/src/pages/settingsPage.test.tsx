// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../contexts/AuthContext';
import { MotionProvider } from '../motion/MotionProvider';
import { SettingsPage } from './SettingsPage';

describe('MOT-002 display settings', () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
  it('offers reduced motion and a visible pause control while persisting the local fallback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: { code: 'UNAUTHENTICATED', message: 'Sign in.' } }) }) as Response));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AuthProvider><MotionProvider><SettingsPage /></MotionProvider></AuthProvider></QueryClientProvider>);
    const selector = await screen.findByLabelText('Motion preference');
    fireEvent.change(selector, { target: { value: 'REDUCED' } });
    await waitFor(() => expect(localStorage.getItem('coinxp:ui-preferences:v1')).toContain('REDUCED'));
    expect(screen.getByText(/Effective mode:.*reduced/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pause animations' }));
    expect(screen.getByRole('button', { name: 'Resume motion' })).toBeTruthy();
    client.clear();
  });
});
