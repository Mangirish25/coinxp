// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';
import { GuestRoute } from '../components/GuestRoute';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppShell } from '../components/AppShell';
import { LoginPage } from './LoginPage';
import { RegisterPage } from './RegisterPage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function unauthenticatedResponse() {
  return new Response(
    JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Please sign in to continue.' } }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('authentication routes and forms', () => {
  it('shows inline registration validation messages before submitting', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(unauthenticatedResponse()));
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/register']}>
          <Routes>
            <Route element={<GuestRoute />}>
              <Route path="/register" element={<RegisterPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Display name must be at least 2 characters.')).toBeTruthy();
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy();
    expect(screen.getByText('Password must be at least 8 characters.')).toBeTruthy();
  });

  it('redirects a logged-out visitor from a protected route to login', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(unauthenticatedResponse()));
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<p>Private dashboard</p>} />
            </Route>
            <Route path="/login" element={<p>Login screen</p>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByText('Login screen')).toBeTruthy();
    expect(screen.queryByText('Private dashboard')).toBeNull();
  });

  it('redirects an authenticated visitor away from guest routes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 7,
            email: 'user@example.com',
            displayName: 'Test User',
            timezone: 'Asia/Kolkata',
            createdAt: '2026-11-06T10:00:00.000Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route element={<GuestRoute />}>
              <Route path="/login" element={<p>Login form</p>} />
            </Route>
            <Route path="/dashboard" element={<p>Dashboard home</p>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByText('Dashboard home')).toBeTruthy();
    expect(screen.queryByText('Login form')).toBeNull();
  });

  it('registers into an authenticated session and restores that session after remount', async () => {
    const user = {
      id: 12,
      email: 'new@example.com',
      displayName: 'New User',
      timezone: 'Asia/Kolkata',
      createdAt: '2026-11-06T10:00:00.000Z',
    };
    const response = (status: number) =>
      new Response(JSON.stringify(user), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unauthenticatedResponse())
      .mockResolvedValueOnce(response(201))
      .mockResolvedValueOnce(response(200));
    vi.stubGlobal('fetch', fetchMock);

    const firstMount = render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/register']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route element={<GuestRoute />}>
                <Route path="/register" element={<RegisterPage />} />
              </Route>
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<p>Dashboard for {user.displayName}</p>} />
              </Route>
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    fireEvent.change(await screen.findByLabelText('Display name'), {
      target: { value: 'New User' },
    });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'safe-pass-8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Dashboard for New User')).toBeTruthy();
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ credentials: 'include' });

    firstMount.unmount();
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<p>Restored dashboard</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByText('Restored dashboard')).toBeTruthy();
  });

  it('returns to the originally requested protected page after login', async () => {
    const user = {
      id: 15,
      email: 'return@example.com',
      displayName: 'Return User',
      timezone: 'Asia/Kolkata',
      createdAt: '2026-11-06T10:00:00.000Z',
    };
    const loginResponse = new Response(JSON.stringify(user), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(unauthenticatedResponse()).mockResolvedValueOnce(loginResponse),
    );
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/transactions?view=recent']}>
          <Routes>
            <Route element={<GuestRoute />}>
              <Route path="/login" element={<LoginPage />} />
            </Route>
            <Route element={<ProtectedRoute />}>
              <Route path="/transactions" element={<p>Requested transactions page</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: user.email } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'safe-pass-8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Requested transactions page')).toBeTruthy();
  });

  it('clears the local user on logout and sends the user to login', async () => {
    const user = {
      id: 18,
      email: 'logout@example.com',
      displayName: 'Logout User',
      timezone: 'Asia/Kolkata',
      createdAt: '2026-11-06T10:00:00.000Z',
    };
    const userResponse = () =>
      new Response(JSON.stringify(user), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(userResponse())
        .mockResolvedValueOnce(new Response(null, { status: 204 })),
    );
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<p>Authenticated dashboard</p>} />
              </Route>
              <Route element={<GuestRoute />}>
                <Route path="/login" element={<p>Login after logout</p>} />
              </Route>
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Log out' }));
    expect(await screen.findByText('Login after logout')).toBeTruthy();
  });
});
