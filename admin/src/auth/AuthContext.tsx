import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as api from '../api/client';
import type { Staff } from '../types';

const TOKEN_KEY = 'pawfectpets_admin_token';

interface AuthContextValue {
  staff: Staff | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      localStorage.removeItem(TOKEN_KEY);
      api.setAuthToken(null);
      setStaff(null);
    });

    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      setLoading(false);
      return;
    }
    api.setAuthToken(stored);
    api
      .me()
      .then(setStaff)
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        api.setAuthToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const { accessToken, staff } = await api.login(email, password);
    localStorage.setItem(TOKEN_KEY, accessToken);
    api.setAuthToken(accessToken);
    setStaff(staff);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    api.setAuthToken(null);
    setStaff(null);
  }

  return (
    <AuthContext.Provider value={{ staff, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
