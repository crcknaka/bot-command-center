import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { apiFetch, setToken, clearToken } from './api.js';

interface User {
  id: number;
  email: string;
  name: string;
  role: 'superadmin' | 'client';
  avatarUrl?: string;
  /** Still on the well-known default password */
  mustChangePassword?: boolean;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Re-read the account from the server (after a password change) */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    apiFetch<User>('/auth/me')
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const data = await apiFetch<{ user: User; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
    clearToken();
    setUser(null);
  };

  const refresh = async () => { setUser(await apiFetch<User>('/auth/me')); };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
