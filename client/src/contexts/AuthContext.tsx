import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, setUnauthorizedHandler } from '../services/api';
import type { PublicUser } from '../types/api';

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  timezone?: string;
}

interface AuthContextValue {
  user: PublicUser | null;
  loading: boolean;
  login: (input: Pick<RegisterInput, 'email' | 'password'>) => Promise<PublicUser>;
  register: (input: RegisterInput) => Promise<PublicUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    apiFetch<PublicUser>('/api/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (input: Pick<RegisterInput, 'email' | 'password'>) => {
    const loggedInUser = await apiFetch<PublicUser>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const registeredUser = await apiFetch<PublicUser>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setUser(registeredUser);
    return registeredUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch<void>('/api/auth/logout', { method: 'POST', body: '{}' });
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
